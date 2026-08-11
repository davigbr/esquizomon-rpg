/**
 * Function de sincronização do Esquizomon RPG (Netlify Blobs).
 *
 * - GET  → devolve o envelope {salvoEm, dados} salvo para o usuário autenticado
 * - PUT  → grava o envelope (corpo JSON, limite de ~5MB)
 *
 * Autenticação: tenta `context.clientContext.user` (validação automática da
 * Netlify) e, se vier vazio — bug conhecido de sites cujo Identity rejeita os
 * próprios JWTs nas functions — valida o Bearer direto em
 * `/.netlify/identity/user` (o mesmo endpoint que o app usa no login).
 */
import { getStore } from '@netlify/blobs'

interface ContextoFunction {
  clientContext?: { user?: { id?: string } | null }
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

/** Usuário autenticado: clientContext ou validação direta no Identity. */
async function usuarioAutenticado(req: Request, contexto: ContextoFunction): Promise<{ id: string } | null> {
  const ctx = contexto.clientContext?.user
  if (ctx?.id) return { id: ctx.id }
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try {
    const base = process.env.NETLIFY_SITE_URL ?? process.env.URL ?? ''
    const res = await fetch(`${base}/.netlify/identity/user`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const u = (await res.json()) as { id?: string }
    return u?.id ? { id: u.id } : null
  } catch {
    return null
  }
}

export default async (req: Request, context: ContextoFunction): Promise<Response> => {
  const usuario = await usuarioAutenticado(req, context)
  if (!usuario?.id) return json({ erro: 'Não autenticado.' }, 401)

  const store = getStore({ name: 'esquizomon-rpg' })
  const chave = `dados:${usuario.id}`

  try {
    if (req.method === 'GET') {
      const bruto = await store.get(chave, { type: 'text' })
      return json(bruto ? JSON.parse(bruto) : { salvoEm: null, dados: null })
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const corpo = await req.text()
      if (corpo.length > 5_000_000) return json({ erro: 'Dados grandes demais.' }, 413)
      JSON.parse(corpo) // valida antes de gravar
      await store.set(chave, corpo)
      return json({ ok: true })
    }

    return json({ erro: 'Método não suportado.' }, 405)
  } catch {
    return json({ erro: 'Falha ao acessar os dados.' }, 500)
  }
}
