/** Hand-rolled Netlify Identity (goTrue) client — same pattern as Rizomove.
 *  Full control of the login screen (app theme), without the official widget
 *  (a white modal in an iframe, no way to style it).
 *
 *  Endpoints used (relative to the site):
 *    POST /.netlify/identity/token   (grant_type=password | refresh_token)
 *    POST /.netlify/identity/signup  ({ email, password })
 *    POST /.netlify/identity/verify  ({ token, type })
 *    POST /.netlify/identity/recover ({ email })
 *    POST /.netlify/identity/logout  (revokes the session)
 *    GET  /.netlify/identity/user    (validates the restored session)
 *
 *  Login is OPTIONAL in Esquizomon: the app runs 100% offline; the account is
 *  used to hold a copy in the cloud (backup/restore between devices). */

const AUTH_KEY = 'esquizomon-rpg:auth'
const IDENTITY = '/.netlify/identity'

export interface Session {
  accessToken: string
  refreshToken: string
  /** Timestamp (ms) when the access token expires. */
  expiresAt: number
  user: { id: string; email: string }
}

let session: Session | null = null

// Anti-rate-limit cooldown: after a transient refresh failure (429/5xx),
// don't hammer the token endpoint — wait before trying again.
let refreshCooldownUntil = 0
const REFRESH_COOLDOWN_MS = 30_000

// Refresh mutex: guarantees there are never TWO in-flight refresh_token POSTs
// with the same token. goTrue rotates the refresh_token on every renewal;
// a second POST arriving with the ALREADY rotated token is treated as "reuse"
// (anti-theft protection) and REVOKES the whole family of the user's sessions —
// that was the cause of the mass logout 2026-08-21 (two devices dropped at once).
// On mobile (iOS Safari/Quick Browser) the focus/visibility handlers fire
// several syncNow almost at the same time, which made the race likely.
let refreshInFlight: Promise<string | null> | null = null

function clearSession(): void {
  session = null
  saveSession(null)
  notifySession()
}

/** A single refresh_token POST to the server, ALWAYS serialized. */
function refreshOnce(): Promise<string | null> {
  // If a refresh is already in flight, reuse the SAME result — never fire
  // a second POST with the same refresh_token.
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = doTokenRefresh().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

async function doTokenRefresh(): Promise<string | null> {
  if (!session?.refreshToken) return null
  // Cooldown (rate-limit/recent transient failure): don't hammer the endpoint.
  if (Date.now() < refreshCooldownUntil) return session?.accessToken ?? null
  try {
    const res = await fetch(`${IDENTITY}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`,
    })
    // 400/401 = refresh_token REALLY revoked/invalid → the session is dead.
    // Real bug 2026-08-21: we only handled 401; with 400 (dead token) the app
    // entered an infinite refresh retry, hammering the endpoint until 429.
    if (res.status === 400 || res.status === 401) {
      clearSession()
      return null
    }
    // Transient failure (network, 5xx, rate-limit 429, timeout): does NOT log out.
    if (!res.ok) {
      refreshCooldownUntil = Date.now() + REFRESH_COOLDOWN_MS
      return session?.accessToken ?? null
    }
    const t = await res.json()
    const tokens = buildTokens({ ...t, refresh_token: t.refresh_token ?? session.refreshToken })
    session = buildSession(tokens, session.user) // the user does not change on refresh
    saveSession(session)
    return session.accessToken
  } catch {
    // transmission failed (timeout/network): keep the session; return the current token.
    // real bug 2026-08-17: here it logged the user out on ANY refresh failure.
    refreshCooldownUntil = Date.now() + REFRESH_COOLDOWN_MS
    return session?.accessToken ?? null
  }
}

// ── Session-change subscription (header/UI react to login/logout) ──

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

// ── Session persistence ──────────────────────────────────────────────

function readSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null') as Session | null
    if (s?.accessToken && s?.refreshToken && s?.expiresAt && s?.user?.id) return s
  } catch {
    /* invalid json → no session */
  }
  return null
}

function saveSession(s: Session | null): void {
  if (s) localStorage.setItem(AUTH_KEY, JSON.stringify(s))
  else localStorage.removeItem(AUTH_KEY)
}

/** Extracts only the tokens from the goTrue response — Netlify does NOT return the user on /token. */
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

/** Friendly error message from the goTrue response — the server errors come
 *  in ENGLISH; we translate the common ones to pt-BR (2026-08-12). */
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

/** Fetches the user with the access token (GET /user) with a JWT fallback. */
async function fetchUser(token: string): Promise<{ id: string; email: string } | null> {
  try {
    const res = await fetch(`${IDENTITY}/user`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error('user falhou')
    const u = (await res.json()) as { id?: string; email?: string }
    if (u.id) return { id: u.id, email: u.email ?? '' }
    // fallback: decode the JWT payload (never trust claims beyond id/email)
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

// ── Public API ───────────────────────────────────────────────────────

export function currentSession(): Session | null {
  return session
}

/** Valid token, renewing via refresh_token if it's close to expiring. */
export async function getValidToken(): Promise<string | null> {
  if (!session) return null
  if (Date.now() < session.expiresAt - 30_000) return session.accessToken
  // Session entered cooldown (rate-limit/recent transient failure): avoids
  // hammering the endpoint and returns the current 'last chance' token.
  if (Date.now() < refreshCooldownUntil) return session.accessToken
  return refreshOnce()
}

/**
 * Renews the access token ALWAYS (ignores expiresAt) — used when the function
 * answers 401: the stored token may be expired on the server clock
 * even with expiresAt in the future (browser clock skew).
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

/** Creates the account. With email verification enabled, returns needsConfirm. */
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
      // Confirmation disabled: already logged in (signup returns the user in the body).
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
      /* ignore revocation failure */
    }
  }
  session = null
  saveSession(null)
  notifySession()
}

// ── Initialization (boot) ────────────────────────────────────────────

/** Confirmation link: goTrue expects type 'signup' (not 'confirmation'!)
 *  — real bug 2026-08-12: verify failed with 400 and the account never confirmed. */
const VERIFY_TYPES: Record<string, string> = {
  confirmation: 'signup',
  invite: 'invite',
  recovery: 'recovery',
}

/**
 * Processes the confirmation hash (email link) and restores the session.
 * Must run BEFORE the router (the hash carries confirmation_token, not a route).
 */
export async function initAuth(): Promise<Session | null> {
  // Confirmation/invite/recovery link: https://site/#confirmation_token=...
  const match = location.hash.match(/(confirmation|invite|recovery)_token=([^&]+)/)
  if (match) {
    const tipo = VERIFY_TYPES[match[1]!] ?? match[1]!
    const token = decodeURIComponent(match[2]!)
    location.hash = '' // clears before the router sees it
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

/** Post-email-confirmation notice (read and cleared by the login screen):
 *  'ok' = confirmed, 'falhou' = the link failed, null = no notice. */
export function consumeConfirmationNotice(): 'ok' | 'falhou' | null {
  const ok = sessionStorage.getItem('esquizomon-rpg:confirmado') === '1'
  const falhou = sessionStorage.getItem('esquizomon-rpg:confirmacao-falhou') === '1'
  if (ok) sessionStorage.removeItem('esquizomon-rpg:confirmado')
  if (falhou) sessionStorage.removeItem('esquizomon-rpg:confirmacao-falhou')
  if (ok) return 'ok'
  if (falhou) return 'falhou'
  return null
}
