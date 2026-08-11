/** Cliente do Netlify Identity (goTrue) feito à mão — mesmo padrão do
 *  Rizomove. Controle total da tela de login (tema do app), sem o widget
 *  oficial (modal branco num iframe, sem como estilizar).
 *
 *  Endpoints usados (relativos ao site):
 *    POST /.netlify/identity/token   (grant_type=password | refresh_token)
 *    POST /.netlify/identity/signup  ({ email, password })
 *    POST /.netlify/identity/verify  ({ token, type })
 *    POST /.netlify/identity/recover ({ email })
 *    POST /.netlify/identity/logout  (revoga a sessão)
 *    GET  /.netlify/identity/user    (valida a sessão restaurada)
 *
 *  O login é OPCIONAL no Esquizomon: o app roda 100% offline; a conta serve
 *  para guardar uma cópia na nuvem (backup/restauração entre dispositivos). */

const CHAVE_AUTH = 'esquizomon-rpg:auth'
const IDENTITY = '/.netlify/identity'

export interface Sessao {
  accessToken: string
  refreshToken: string
  /** Timestamp (ms) em que o access token expira. */
  expiraEm: number
  usuario: { id: string; email: string }
}

let sessao: Sessao | null = null

// ── Inscrição em mudanças de sessão (header/UI reagem ao login/sair) ──

let cbSessao: (() => void) | null = null

export function inscreverSessao(cb: () => void): () => void {
  cbSessao = cb
  return () => {
    if (cbSessao === cb) cbSessao = null
  }
}

function notificarSessao(): void {
  cbSessao?.()
}

// ── Persistência da sessão ──────────────────────────────────────────

function lerSessao(): Sessao | null {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE_AUTH) ?? 'null') as Sessao | null
    if (s?.accessToken && s?.refreshToken && s?.expiraEm && s?.usuario?.id) return s
  } catch {
    /* json inválido → sem sessão */
  }
  return null
}

function gravarSessao(s: Sessao | null): void {
  if (s) localStorage.setItem(CHAVE_AUTH, JSON.stringify(s))
  else localStorage.removeItem(CHAVE_AUTH)
}

/** Extrai só os tokens da resposta do goTrue — a Netlify NÃO devolve o usuário no /token. */
function montarTokens(t: unknown): { accessToken: string; refreshToken: string; expiraEm: number } {
  const r = (t ?? {}) as { access_token?: string; refresh_token?: string; expires_in?: number }
  if (!r.access_token || !r.expires_in) {
    throw new Error(`resposta inesperada (sem access_token/expires_in): ${JSON.stringify(t).slice(0, 300)}`)
  }
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token ?? '',
    expiraEm: Date.now() + r.expires_in * 1000,
  }
}

function montarSessao(tokens: { accessToken: string; refreshToken: string; expiraEm: number }, usuario: { id: string; email: string }): Sessao {
  return { ...tokens, usuario }
}

/** Mensagem de erro amigável a partir da resposta do goTrue. */
function extrairErro(res: Response, corpo: unknown): string {
  const c = (corpo ?? {}) as { error_description?: string; msg?: string; message?: string; errors?: Array<{ message?: string }> }
  const msg =
    c.error_description ?? c.msg ?? c.message ?? (Array.isArray(c.errors) ? c.errors.map((e) => e.message ?? '').join(', ') : '') ?? ''
  if (msg) return msg
  if (res.status === 400) return 'E-mail ou senha incorretos.'
  if (res.status === 422) return 'E-mail inválido ou senha fraca demais.'
  return `Falha na autenticação (HTTP ${res.status}).`
}

/** Busca o usuário com o access token (GET /user) com fallback para o JWT. */
async function buscarUsuario(token: string): Promise<{ id: string; email: string } | null> {
  try {
    const res = await fetch(`${IDENTITY}/user`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error('user falhou')
    const u = (await res.json()) as { id?: string; email?: string }
    if (u.id) return { id: u.id, email: u.email ?? '' }
    // fallback: decodifica o payload do JWT (nunca confia em claims além do id/email)
    const payload = token.split('.')[1]
    if (payload) {
      const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string; email?: string }
      if (claims.sub) return { id: claims.sub, email: claims.email ?? u.email ?? '' }
    }
    return null
  } catch {
    return null
  }
}

// ── API pública ─────────────────────────────────────────────────────

export function sessaoAtual(): Sessao | null {
  return sessao
}

/** Token válido, renovando via refresh_token se estiver perto de expirar. */
export async function obterTokenValido(): Promise<string | null> {
  if (!sessao) return null
  if (Date.now() < sessao.expiraEm - 30_000) return sessao.accessToken

  try {
    const res = await fetch(`${IDENTITY}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(sessao.refreshToken)}`,
    })
    if (!res.ok) throw new Error('refresh falhou')
    const t = await res.json()
    const tokens = montarTokens({ ...t, refresh_token: t.refresh_token ?? sessao.refreshToken })
    sessao = montarSessao(tokens, sessao.usuario) // o usuário não muda no refresh
    gravarSessao(sessao)
    return sessao.accessToken
  } catch {
    sessao = null
    gravarSessao(null)
    return null
  }
}

/**
 * Renova o access token SEMPRE (ignora expiraEm) — usado quando a function
 * responde 401: o token guardado pode estar expirado no relógio do servidor
 * mesmo com expiraEm no futuro (clock skew do browser).
 */
export async function renovarToken(): Promise<string | null> {
  if (!sessao?.refreshToken) return null
  try {
    const res = await fetch(`${IDENTITY}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(sessao.refreshToken)}`,
    })
    if (!res.ok) throw new Error(`refresh falhou: HTTP ${res.status}`)
    const t = await res.json()
    const tokens = montarTokens({ ...t, refresh_token: t.refresh_token ?? sessao.refreshToken })
    sessao = montarSessao(tokens, sessao.usuario)
    gravarSessao(sessao)
    return sessao.accessToken
  } catch (erro) {
    console.error('[auth] renovação forçada do token falhou:', erro)
    return null
  }
}

export async function login(email: string, senha: string): Promise<{ ok: boolean; motivo?: string }> {
  try {
    const res = await fetch(`${IDENTITY}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=password&username=${encodeURIComponent(email)}&password=${encodeURIComponent(senha)}`,
    })
    const texto = await res.text()
    let corpo: unknown = null
    try {
      corpo = JSON.parse(texto)
    } catch {
      corpo = null
    }
    if (!res.ok) {
      console.warn('[auth] login rejeitado', res.status, corpo ?? texto)
      return { ok: false, motivo: extrairErro(res, corpo) }
    }
    if (!corpo || typeof corpo !== 'object') {
      console.error('[auth] resposta do token não é JSON:', res.status, texto.slice(0, 300))
      return { ok: false, motivo: 'Resposta inesperada do servidor de autenticação. Veja o console.' }
    }
    let tokens: { accessToken: string; refreshToken: string; expiraEm: number }
    try {
      tokens = montarTokens(corpo)
    } catch (erro) {
      console.error('[auth] resposta do token sem tokens:', erro, corpo)
      return { ok: false, motivo: 'Resposta inesperada do servidor de autenticação. Veja o console.' }
    }
    const usuario = await buscarUsuario(tokens.accessToken)
    if (!usuario) {
      console.error('[auth] não foi possível obter o usuário (GET /user e JWT falharam)')
      return { ok: false, motivo: 'Não foi possível carregar seus dados de usuário. Veja o console e tente de novo.' }
    }
    sessao = montarSessao(tokens, usuario)
    gravarSessao(sessao)
    notificarSessao()
    return { ok: true }
  } catch (erro) {
    console.error('[auth] falha de rede no login:', erro)
    return { ok: false, motivo: 'Sem conexão com o servidor de autenticação. Verifique sua conexão e tente de novo.' }
  }
}

/** Cria a conta. Com verificação de email habilitada, retorna precisaConfirmar. */
export async function criarConta(email: string, senha: string): Promise<{ ok: boolean; precisaConfirmar?: boolean; motivo?: string }> {
  try {
    const res = await fetch(`${IDENTITY}/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: senha }),
    })
    const corpo = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, motivo: extrairErro(res, corpo) }
    if (corpo?.access_token) {
      // Confirmação desabilitada: já vem logado (o signup devolve o usuário no corpo).
      const tokens = montarTokens(corpo)
      const u = corpo as { id?: string; email?: string }
      const usuario = u.id ? { id: u.id, email: u.email ?? email } : await buscarUsuario(tokens.accessToken)
      if (!usuario) return { ok: false, motivo: 'Não foi possível carregar seus dados de usuário. Veja o console.' }
      sessao = montarSessao(tokens, usuario)
      gravarSessao(sessao)
      notificarSessao()
      return { ok: true }
    }
    return { ok: true, precisaConfirmar: true }
  } catch {
    return { ok: false, motivo: 'Sem conexão com o servidor de autenticação.' }
  }
}

export async function recuperarSenha(email: string): Promise<{ ok: boolean; motivo?: string }> {
  try {
    const res = await fetch(`${IDENTITY}/recover`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!res.ok) return { ok: false, motivo: extrairErro(res, await res.json().catch(() => null)) }
    return { ok: true }
  } catch {
    return { ok: false, motivo: 'Sem conexão com o servidor de autenticação.' }
  }
}

export async function sair(): Promise<void> {
  const token = await obterTokenValido()
  if (token) {
    try {
      await fetch(`${IDENTITY}/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    } catch {
      /* ignora falha de revogação */
    }
  }
  sessao = null
  gravarSessao(null)
  notificarSessao()
}

// ── Inicialização (boot) ────────────────────────────────────────────

/**
 * Processa o hash de confirmação (link do email) e restaura a sessão.
 * Deve rodar ANTES do router (o hash carrega confirmation_token, não rota).
 */
export async function iniciarAuth(): Promise<Sessao | null> {
  // Link de confirmação/convite/recuperação: https://site/#confirmation_token=...
  const match = location.hash.match(/(confirmation|invite|recovery)_token=([^&]+)/)
  if (match) {
    const tipo = match[1]!
    const token = decodeURIComponent(match[2]!)
    location.hash = '' // limpa antes do router ver
    try {
      const res = await fetch(`${IDENTITY}/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, type: tipo }),
      })
      if (res.ok) sessionStorage.setItem('esquizomon-rpg:confirmado', '1')
    } catch {
      /* offline — o aviso de erro aparece na tela de login */
    }
  }

  sessao = lerSessao()
  if (sessao) {
    const token = await obterTokenValido()
    if (!token) {
      sessao = null
      gravarSessao(null)
    }
  }
  notificarSessao()
  return sessao
}

/** Aviso pós-confirmação de email (lido e limpo pela tela de login). */
export function consumirAvisoConfirmacao(): boolean {
  const tem = sessionStorage.getItem('esquizomon-rpg:confirmado') === '1'
  if (tem) sessionStorage.removeItem('esquizomon-rpg:confirmado')
  return tem
}
