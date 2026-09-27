/**
 * PWA: instalação (beforeinstallprompt) + notificações push.
 *
 * Push é OPT-IN e funciona como "lembrete diário" genérico: o servidor não vê
 * os dados locais do usuário (local-first). O cliente apenas grava no
 * servidor a assinatura Push + os horários (em minutos do dia, fuso local) +
 * o offset UTC; a Scheduled Function do Netlify dispara o lembrete nesses
 * horários. Conteúdo do push é sempre uma cutucada temática — nunca dado.
 */

const CONFIG_KEY = 'esquizomon-rpg:push'

/** Chave pública VAPID (público — pode ficar no bundle). A privada fica só
 *  nas env vars do Netlify (VAPID_PRIVATE_KEY). Gerada junto com o par. */
// prettier-ignore
const VAPID_PUBLIC_KEY =
  'BO5hzp-htY6eXgHks5KB5kgDXMdCLEdq0HCfzFQOvRHxMI0C_eyZgB7zoNtCyPoGjiSeDcT1yB5M3lhQ4FYrcjk'

export interface PushSettings {
  /** Horários de lembrete, em minutos desde meia-noite (fuso local do device). */
  horarios: number[]
}

let pushSettings: PushSettings = { horarios: [] }
try {
  const raw = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}') as Partial<PushSettings>
  if (Array.isArray(raw.horarios)) {
    pushSettings.horarios = raw.horarios.map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n < 1440)
  }
} catch {
  pushSettings = { horarios: [] }
}

function save(): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(pushSettings))
  } catch {
    /* storage cheio → ignora */
  }
}

export function getPushSettings(): PushSettings {
  return { horarios: [...pushSettings.horarios] }
}

export function setPushSettings(s: PushSettings): void {
  pushSettings = { horarios: s.horarios.map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n < 1440) }
  save()
}

export function hasPushSupport(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function permissionState(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

/** Converte uma chave VAPID base64url (sem padding) para Uint8Array.
 *  Formato que o PushManager espera (raw P-256 public key). */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base64url = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64url)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

/** Registro do service worker do app (só existe em produção). */
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  // `.ready` pode nunca resolver sem SW ativo → limite de 4s para o status não travar.
  const ready = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((res) => setTimeout(() => res(null), 4000)),
  ]).catch(() => null)
  if (!ready) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

export async function isSubscribed(): Promise<boolean> {
  const reg = await getRegistration()
  if (!reg) return false
  return (await reg.pushManager.getSubscription()) != null
}

/**
 * Pede permissão, cria/subscribe a assinatura Push e registra no servidor
 * junto com os horários e o offset UTC (para o cron disparar no horário local).
 * Retorna { ok } ou { ok:false, reason } para a UI.
 */
export async function enableNotifications(horarios?: number[]): Promise<{ ok: boolean; reason?: string }> {
  if (!hasPushSupport()) return { ok: false, reason: 'Seu navegador não suporta notificações.' }

  let reg = await getRegistration()
  if (!reg) {
    // Raro: o client ainda não registrou o SW (offline/prod). Tenta registrar.
    if (!('serviceWorker' in navigator)) return { ok: false, reason: 'Serviço indisponível.' }
    try {
      const r = await navigator.serviceWorker.register('/sw.js')
      if (!r) return { ok: false, reason: 'Não consegui inicializar as notificações.' }
      reg = r
    } catch {
      return { ok: false, reason: 'Não consegui inicializar as notificações.' }
    }
  }

  if (Notification.permission === 'default') {
    const p = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission)
    if (p === 'denied') return { ok: false, reason: 'Notificações bloqueadas no navegador.' }
    if (p !== 'granted') return { ok: false, reason: 'Permissão não concedida.' }
  }
  if (Notification.permission !== 'granted') {
    return { ok: false, reason: 'Notificações bloqueadas. Libere nas configurações do navegador.' }
  }

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    } catch {
      return { ok: false, reason: 'O navegador recusou a assinatura de push.' }
    }
  }

  const h = (horarios ?? pushSettings.horarios).map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n < 1440)
  const payload = {
    action: 'subscribe',
    sub: sub.toJSON(),
    horarios: h,
    offsetMin: -new Date().getTimezoneOffset(),
  }

  try {
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return { ok: false, reason: 'Não consegui registrar os lembretes no servidor.' }
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor para salvar os lembretes.' }
  }

  setPushSettings({ horarios: h })
  return { ok: true }
}

/** Desliga: cancela a assinatura local e avisa o servidor para remover. */
export async function disableNotifications(): Promise<void> {
  const reg = await getRegistration()
  let endpoint = ''
  if (reg) {
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      endpoint = sub.endpoint
      await sub.unsubscribe().catch(() => undefined)
    }
  }
  if (endpoint) {
    try {
      await fetch('/api/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'unsubscribe', endpoint }),
      })
    } catch {
      /* melhor esforço — se falhar, o servidor ignora subs expiradas */
    }
  }
  setPushSettings({ horarios: [] })
}

/* ---------- instalação do PWA (beforeinstallprompt) ---------- */

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let installPrompt: InstallPrompt | null = null

let installChangedCb: ((available: boolean) => void) | null = null

/** main.ts repassa o beforeinstallprompt (capturado) para o módulo. */
export function captureInstallPrompt(e: Event): void {
  // Cancela o banner automático; a UI decide quando oferecer.
  e.preventDefault()
  const ev = e as InstallPrompt
  if (typeof ev.prompt !== 'function') return
  installPrompt = ev
  installChangedCb?.(true)
}

export function notifyInstalled(): void {
  installPrompt = null
  installChangedCb?.(false)
}

export function setInstallChangedCb(cb: ((available: boolean) => void) | null): void {
  installChangedCb = cb
}

export function installAvailable(): boolean {
  return installPrompt != null
}

/** Aciona o prompt nativo de instalação (retorna 'accepted' | 'dismissed' | null). */
export async function requestInstall(): Promise<'accepted' | 'dismissed' | null> {
  if (!installPrompt) return null
  await installPrompt.prompt().catch(() => undefined)
  const choice = await installPrompt.userChoice.catch(() => ({ outcome: 'dismissed' as const }))
  return choice.outcome
}