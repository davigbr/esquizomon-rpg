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

const AUTH_KEY = 'esquizomon-rpg:auth'
const IDENTITY = '/.netlify/identity'

export interface Session {
  accessToken: string
  refreshToken: string
  /** Timestamp (ms) em que o access token expira. */
  expiresAt: number
  user: { id: string; email: string }
}

let session: Session | null = null

// Cooldown anti-rate-limit: após uma falha transitória de refresh (429/5xx),
// não martela o endpoint de token — espera antes de tentar de novo.
let refreshCooldownUntil = 0
const REFRESH_COOLDOWN_MS = 30_000

// Mutex de refresh: garante que nunca existam DOIS POSTs de refresh_token em
// voo com o mesmo token. O goTrue rotaciona o refresh_token a cada renovação;
// um segundo POST que chega com o token JÁ rotacionado é tratado como "reuso"
// (proteção anti-roubo) e REVOGA toda a família de sessões do usuário — foi a
// causa do logout em massa 2026-08-21 (dois dispositivos caíram juntos). No
// mobile (iOS Safari/Quick Browser) os handlers de focus/visibility disparam
// várias syncNow quase ao mesmo tempo, o que tornava a corrida provável.
let refreshInFlight: Promise<string | null> | null = null

function clearSession(): void {
  session = null
  saveSession(null)
  notifySession()
}

/** Um único POST de refresh_token até o servidor, SEMPRE serializado. */
function refreshOnce(): Promise<string | null> {
  // Se já há um refresh em voo, reaproveita o MESMO resultado — nunca dispara
  // um segundo POST com o mesmo refresh_token.
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = doTokenRefresh().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

async function doTokenRefresh(): Promise<string | null> {
  if (!session?.refreshToken) return null
  // Cooldown (rate-limit/falha transitória recente): não martela o endpoint.
  if (Date.now() < refreshCooldownUntil) return session?.accessToken ?? null
  try {
    const res = await fetch(`${IDENTITY}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`,
    })
    // 400/401 = refresh_token revogado/inválido de VERDADE → a sessão morreu.
    // Bug real 2026-08-21: só tratávamos 401; com 400 (token morto) o app entrava
    // em retry infinito de refresh, martelando o endpoint até dar 429 (rate-limit).
    if (res.status === 400 || res.status === 401) {
      clearSession()
      return null
    }
    // Falha transitória (rede, 5xx, rate-limit 429, timeout): NÃO desloga.
    if (!res.ok) {
      refreshCooldownUntil = Date.now() + REFRESH_COOLDOWN_MS
      return session?.accessToken ?? null
    }
    const t = await res.json()
    const tokens = buildTokens({ ...t, refresh_token: t.refresh_token ?? session.refreshToken })
    session = buildSession(tokens, session.user) // o usuário não muda no refresh
    saveSession(session)
    return session.accessToken
  } catch {
    // transmissão falhou (timeout/rede): mantém a sessão; devolve o token atual.
    // bug real 2026-08-17: aqui deslogava o usuário em QUALQUER falha de refresh.
    refreshCooldownUntil = Date.now() + REFRESH_COOLDOWN_MS
    return session?.accessToken ?? null
  }
}

// ── Inscrição em mudanças de sessão (header/UI reagem ao login/sair) ──

let sessionCb: (() => void) | null = null

export function subscribeSession(cb: () => void): () => void {
  sessionCb = cb
  return () => {
    if (sessionCb === cb) sessionCb = null
  }
}

function notifySession(): void {
  sessionCb?.()
}

// ── Persistência da sessão ──────────────────────────────────────────

function readSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null') as Session | null
    if (s?.accessToken && s?.refreshToken && s?.expiresAt && s?.user?.id) return s
  } catch {
    /* json inválido → sem sessão */
  }
  return null
}

function saveSession(s: Session | null): void {
  if (s) localStorage.setItem(AUTH_KEY, JSON.stringify(s))
  else localStorage.removeItem(AUTH_KEY)
}

/** Extrai só os tokens da resposta do goTrue — a Netlify NÃO devolve o usuário no /token. */
function buildTokens(t: unknown): { accessToken: string; refreshToken: string; expiresAt: number } {
  const r = (t ?? {}) as { access_token?: string; refresh_token?: string; expires_in?: number }
  if (!r.access_token || !r.expires_in) {
    throw new Error(`resposta inesperada (sem access_token/expires_in): ${JSON.stringify(t).slice(0, 300)}`)
  }
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token ?? '',
    expiresAt: Date.now() + r.expires_in * 1000,
  }
}

function buildSession(tokens: { accessToken: string; refreshToken: string; expiresAt: number }, user: { id: string; email: string }): Session {
  return { ...tokens, user }
}

/** Mensagem de erro amigável a partir da resposta do goTrue — os erros do
 *  servidor vêm em INGLÊS; traduzimos os comuns para pt-BR (2026-08-12). */
const TRANSLATED_ERRORS: Array<[RegExp, string]> = [
  [/email.{0,20}not.{0,15}confirmed|not confirmed|confirm your email/i, 'Seu e-mail ainda não foi confirmado. Abra o link que enviamos (confira também o spam) e tente de novo.'],
  [/invalid login|invalid.{0,10}password|incorrect/i, 'E-mail ou senha incorretos.'],
  [/already registered|user already exist/i, 'Este e-mail já tem uma conta. Entre ou use "Esqueci a senha".'],
  [/password.{0,20}(short|least|minimum|6)/i, 'A senha precisa ter ao menos 6 caracteres.'],
  [/invalid.{0,10}email|email.{0,10}invalid/i, 'E-mail inválido.'],
  [/no user|user.{0,15}not found|no account/i, 'Conta não encontrada.'],
  [/token.{0,15}(invalid|expired)|link.{0,10}expired/i, 'Este link expirou ou é inválido. Peça um novo.'],
  [/too many requests/i, 'Muitas tentativas seguidas. Espere um pouco e tente de novo.'],
  [/rate limit/i, 'Limite de tentativas atingido. Espere um pouco.']
]

function extractError(res: Response, body: unknown): string {
  const c = (body ?? {}) as { error_description?: string; msg?: string; message?: string; errors?: Array<{ message?: string }> }
  const bruto =
    c.error_description ?? c.msg ?? c.message ?? (Array.isArray(c.errors) ? c.errors.map((e) => e.message ?? '').join(', ') : '') ?? ''
  for (const [regex, pt] of TRANSLATED_ERRORS) {
    if (regex.test(bruto)) return pt
  }
  if (bruto) return bruto
  if (res.status === 400) return 'E-mail ou senha incorretos.'
  if (res.status === 422) return 'E-mail inválido ou senha fraca demais.'
  return `Falha na autenticação (HTTP ${res.status}).`
}

/** Busca o usuário com o access token (GET /user) com fallback para o JWT. */
async function fetchUser(token: string): Promise<{ id: string; email: string } | null> {
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

export function currentSession(): Session | null {
  return session
}

/** Token válido, renovando via refresh_token se estiver perto de expirar. */
export async function getValidToken(): Promise<string | null> {
  if (!session) return null
  if (Date.now() < session.expiresAt - 30_000) return session.accessToken
  // Sessão entrou em cooldown (rate-limit/falha transitória recente): evita
  // martelar o endpoint e devolve o token atual de 'última chance'.
  if (Date.now() < refreshCooldownUntil) return session.accessToken
  return refreshOnce()
}

/**
 * Renova o access token SEMPRE (ignora expiresAt) — usado quando a function
 * responde 401: o token guardado pode estar expirado no relógio do servidor
 * mesmo com expiresAt no futuro (clock skew do browser).
 */
export async function renewToken(): Promise<string | null> {
  if (!session?.refreshToken) return null
  if (Date.now() < refreshCooldownUntil) return null
  return refreshOnce()
}

export async function login(email: string, password: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await fetch(`${IDENTITY}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=password&username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
    })
    const texto = await res.text()
    let body: unknown = null
    try {
      body = JSON.parse(texto)
    } catch {
      body = null
    }
    if (!res.ok) {
      console.warn('[auth] login rejeitado', res.status, body ?? texto)
      return { ok: false, reason: extractError(res, body) }
    }
    if (!body || typeof body !== 'object') {
      console.error('[auth] resposta do token não é JSON:', res.status, texto.slice(0, 300))
      return { ok: false, reason: 'Resposta inesperada do servidor de autenticação. Veja o console.' }
    }
    let tokens: { accessToken: string; refreshToken: string; expiresAt: number }
    try {
      tokens = buildTokens(body)
    } catch (error) {
      console.error('[auth] resposta do token sem tokens:', error, body)
      return { ok: false, reason: 'Resposta inesperada do servidor de autenticação. Veja o console.' }
    }
    const user = await fetchUser(tokens.accessToken)
    if (!user) {
      console.error('[auth] não foi possível obter o usuário (GET /user e JWT falharam)')
      return { ok: false, reason: 'Não foi possível carregar seus dados de usuário. Veja o console e tente de novo.' }
    }
    session = buildSession(tokens, user)
    saveSession(session)
    notifySession()
    return { ok: true }
  } catch (error) {
    console.error('[auth] falha de rede no login:', error)
    return { ok: false, reason: 'Sem conexão com o servidor de autenticação. Verifique sua conexão e tente de novo.' }
  }
}

/** Cria a conta. Com verificação de email habilitada, retorna needsConfirm. */
export async function createAccount(email: string, password: string): Promise<{ ok: boolean; needsConfirm?: boolean; reason?: string }> {
  try {
    const res = await fetch(`${IDENTITY}/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, reason: extractError(res, body) }
    if (body?.access_token) {
      // Confirmação desabilitada: já vem logado (o signup devolve o usuário no corpo).
      const tokens = buildTokens(body)
      const u = body as { id?: string; email?: string }
      const user = u.id ? { id: u.id, email: u.email ?? email } : await fetchUser(tokens.accessToken)
      if (!user) return { ok: false, reason: 'Não foi possível carregar seus dados de usuário. Veja o console.' }
      session = buildSession(tokens, user)
      saveSession(session)
      notifySession()
      return { ok: true }
    }
    return { ok: true, needsConfirm: true }
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor de autenticação.' }
  }
}

export async function recoverPassword(email: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await fetch(`${IDENTITY}/recover`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!res.ok) return { ok: false, reason: extractError(res, await res.json().catch(() => null)) }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor de autenticação.' }
  }
}

export async function logout(): Promise<void> {
  const token = await getValidToken()
  if (token) {
    try {
      await fetch(`${IDENTITY}/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    } catch {
      /* ignora falha de revogação */
    }
  }
  session = null
  saveSession(null)
  notifySession()
}

// ── Inicialização (boot) ────────────────────────────────────────────

/** Link de confirmação: o goTrue espera type 'signup' (não 'confirmation'!)
 *  — bug real 2026-08-12: o verify falhava 400 e a conta nunca confirmava. */
const VERIFY_TYPES: Record<string, string> = {
  confirmation: 'signup',
  invite: 'invite',
  recovery: 'recovery',
}

/**
 * Processa o hash de confirmação (link do email) e restaura a sessão.
 * Deve rodar ANTES do router (o hash carrega confirmation_token, não rota).
 */
export async function initAuth(): Promise<Session | null> {
  // Link de confirmação/convite/recuperação: https://site/#confirmation_token=...
  const match = location.hash.match(/(confirmation|invite|recovery)_token=([^&]+)/)
  if (match) {
    const tipo = VERIFY_TYPES[match[1]!] ?? match[1]!
    const token = decodeURIComponent(match[2]!)
    location.hash = '' // limpa antes do router ver
    try {
      const res = await fetch(`${IDENTITY}/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, type: tipo }),
      })
      if (res.ok) sessionStorage.setItem('esquizomon-rpg:confirmado', '1')
      else {
        console.warn('[auth] verify rejeitado', res.status, await res.text().catch(() => ''))
        sessionStorage.setItem('esquizomon-rpg:confirmacao-falhou', '1')
      }
    } catch {
      sessionStorage.setItem('esquizomon-rpg:confirmacao-falhou', '1')
    }
  }

  session = readSession()
  if (session) {
    const token = await getValidToken()
    if (!token) {
      session = null
      saveSession(null)
    }
  }
  notifySession()
  return session
}

/** Aviso pós-confirmação de email (lido e limpo pela tela de login):
 *  'ok' = confirmado, 'falhou' = o link não funcionou, null = sem aviso. */
export function consumeConfirmationNotice(): 'ok' | 'falhou' | null {
  const ok = sessionStorage.getItem('esquizomon-rpg:confirmado') === '1'
  const falhou = sessionStorage.getItem('esquizomon-rpg:confirmacao-falhou') === '1'
  if (ok) sessionStorage.removeItem('esquizomon-rpg:confirmado')
  if (falhou) sessionStorage.removeItem('esquizomon-rpg:confirmacao-falhou')
  if (ok) return 'ok'
  if (falhou) return 'falhou'
  return null
}
