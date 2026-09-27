/**
 * Function Netlify — cadastro/cancelamento de push.
 *
 * POST /api/push (redirecionado de /.netlify/functions/push)
 *   body { action: 'subscribe', sub, horarios, offsetMin } → grava/atualiza
 *   body { action: 'unsubscribe', endpoint }              → remove
 *
 * As assinaturas ficam em Netlify Blobs (store 'esquizomon-rpg', key
 * 'push:subs'). Quem dispara os lembretes é a Scheduled Function `reminders`.
 * Push é opt-in e genérico: o servidor nunca recebe dados das tarefas.
 */
import { getStore } from '@netlify/blobs'

const STORE = 'esquizomon-rpg'
const KEY = 'push:subs'
const MAX_SUBS = 1000

interface PushSub {
  endpoint: string
  keys: { p256dh: string; auth: string }
  /** Minutos do dia (0..1439) — horário LOCAL do device. */
  horarios: number[]
  /** Offset UTC do device em minutos (ex.: Brasil UTC-3 → -180). */
  offsetMin: number
  lastSent: { day: string; min: number } | null
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

async function store(): ReturnType<typeof getStore> {
  return getStore({ name: STORE })
}

async function readSubs(s: ReturnType<typeof getStore>): Promise<PushSub[]> {
  const bruto = await s.get(KEY, { type: 'text' })
  if (!bruto) return []
  try {
    const arr = JSON.parse(bruto) as unknown
    return Array.isArray(arr) ? (arr as PushSub[]) : []
  } catch {
    return []
  }
}

function sanitizeHorarios(v: unknown): number[] {
  if (!Array.isArray(v)) return []
  return v
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0 && n < 1440)
    .slice(0, 12)
}

function sanitizeOffset(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(-14 * 60, Math.min(14 * 60, Math.round(n))) : fallback
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ erro: 'Método não suportado.' }, 405)

  let corpo: unknown
  try {
    corpo = await req.json()
  } catch {
    return json({ erro: 'Corpo inválido.' }, 400)
  }
  const c = (corpo ?? {}) as { action?: string; sub?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; endpoint?: string; horarios?: unknown; offsetMin?: unknown }

  if (c.action === 'subscribe') {
    if (!c.sub?.endpoint || !c.sub?.keys?.p256dh || !c.sub?.keys?.auth) {
      return json({ erro: 'Assinatura inválida.' }, 400)
    }
    const s = await store()
    const subs = await readSubs(s)
    const existing = subs.find((x) => x.endpoint === c.sub!.endpoint)
    if (existing) {
      existing.keys = c.sub.keys as PushSub['keys']
      existing.horarios = sanitizeHorarios(c.horarios)
      existing.offsetMin = sanitizeOffset(c.offsetMin, existing.offsetMin)
      existing.lastSent = null
    } else {
      subs.push({
        endpoint: c.sub.endpoint,
        keys: c.sub.keys as PushSub['keys'],
        horarios: sanitizeHorarios(c.horarios),
        offsetMin: sanitizeOffset(c.offsetMin, 0),
        lastSent: null,
      })
    }
    const final = subs.length > MAX_SUBS ? subs.slice(subs.length - MAX_SUBS) : subs
    await s.set(KEY, JSON.stringify(final))
    return json({ ok: true, horarios: sanitizeHorarios(c.horarios) })
  }

  if (c.action === 'unsubscribe') {
    if (!c.endpoint) return json({ erro: 'Faltando endpoint.' }, 400)
    const s = await store()
    const subs = await readSubs(s)
    await s.set(KEY, JSON.stringify(subs.filter((x) => x.endpoint !== c.endpoint)))
    return json({ ok: true })
  }

  return json({ erro: 'Ação desconhecida.' }, 400)
}