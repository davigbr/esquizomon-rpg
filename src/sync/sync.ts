/**
 * Cloud sync (Netlify Blobs) — OPTIONAL. Esquizomon runs 100% local
 * (localStorage); when you log in, the data gains a copy in the cloud
 * (backup/restore between devices).
 *
 * - On login: pulls the blob (if newer than local) and applies it; if the cloud
 *   is empty or older, sends the local state (first migration).
 * - After: every store change is sent with debounce.
 * - Offline: nothing breaks — data stays in localStorage and the status shows
 *   "Offline".
 * - Conflict: last-write-wins by timestamp (salvoEm).
 */

import { appStore } from '../stores/base'
import { normalizeData } from '../db/storage'
import { getValidToken, renewToken, currentSession } from './auth'
import type { AppData } from '../core/tipos'
import { mergeData } from '../core/syncMerge'

const SYNC_KEY = 'esquizomon-rpg:sync' // local sync metadata
const ENDPOINT = '/.netlify/functions/dados'

export type SyncState = 'local' | 'enviando' | 'sincronizado' | 'sem-conexao'

interface SyncMeta {
  salvoEm?: string
  lastSync?: string // time of the last successful cloud sync
}

function readMeta(): SyncMeta {
  try {
    return JSON.parse(localStorage.getItem(SYNC_KEY) ?? '{}') as SyncMeta
  } catch {
    return {}
  }
}

function writeMeta(m: SyncMeta): void {
  localStorage.setItem(SYNC_KEY, JSON.stringify(m))
}

let timer: ReturnType<typeof setTimeout> | null = null
let loading = false // avoids the echo: pull → store → auto-send
let syncSubscribers: Array<(e: SyncState) => void> = []
let pullInterval: ReturnType<typeof setInterval> | null = null
let firstSubscribe = true
let idleTimer: ReturnType<typeof setTimeout> | null = null
let pendingLocalChange = false // a local change happened and may not be sent yet
const PULL_MS = 10_000
const IDLE_MS = 3 * 60_000 // 3 min without interaction → polling "sleeps"
// Short debounce so the last interaction lands before the app is closed/navigated
// away — a long window loses the final write when the tab exits (real bug).
const DEBOUNCE_MS = 500

/** Periodic pull + on returning to the tab: with 2 logged devices, one's
 *  changes reach the other within ~30s (or on returning to the tab). Without it,
 *  each device only syncs on its own login/edit — they drift apart. */
function onSleep(): void {
  // went to background OR became idle: stop the polling (the browser throttles
  // background timers; and idleness needn't pull — wastes battery/network)
  if (pullInterval) {
    clearInterval(pullInterval)
    pullInterval = null
  }
}
function rearmIdle(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    idleTimer = null
    onSleep() // X without interaction (even with the tab visible) → pauses polling
  }, IDLE_MS)
}
function onInteract(): void {
  // touch/key/focus: wake (sync now + resume polling) and rearm the idle
  onWake()
  rearmIdle()
}
function onWake(): void {
  // returned / the user interacted: resume polling and sync NOW (brings in
  // what happened while "asleep")
  if (document.visibilityState === 'visible' && currentSession()) {
    if (!pullInterval) startPullTimer()
    void syncNow()
  }
}
function startPullTimer(): void {
  if (pullInterval) return
  pullInterval = setInterval(() => {
    if (document.visibilityState === 'visible' && currentSession()) void syncNow()
  }, PULL_MS)
}
function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    onSleep()
    flushPendingNow() // don't lose the last interaction when the tab is hidden
  } else onInteract() // returning to the tab: wake + rearm the idle
}
const onPageHide = (): void => {
  flushPendingNow() // final best-effort flush before the page unloads
}
function startPeriodicPull(): void {
  if (pullInterval) return // already has listeners/timer
  startPullTimer()
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('focus', onInteract)
  window.addEventListener('pointerdown', onInteract, { passive: true })
  window.addEventListener('keydown', onInteract)
  rearmIdle()
}

function stopPeriodicPull(): void {
  if (pullInterval) {
    clearInterval(pullInterval)
    pullInterval = null
  }
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('pagehide', onPageHide)
  window.removeEventListener('focus', onInteract)
  window.removeEventListener('pointerdown', onInteract)
  window.removeEventListener('keydown', onInteract)
}

/** Last successful sync (ISO) or null. */
export function getLastSync(): string | null {
  return readMeta().lastSync ?? null
}

function setSyncState(e: SyncState): void {
  if (e === 'sincronizado') {
    const m = readMeta()
    writeMeta({ ...m, lastSync: new Date().toISOString() })
  }
  for (const cb of syncSubscribers) cb(e)
}

/** The UI subscribes here to show the status (supports multiple listeners). */
export function subscribeSync(cb: (e: SyncState) => void): () => void {
  syncSubscribers.push(cb)
  return () => {
    syncSubscribers = syncSubscribers.filter((x) => x !== cb)
  }
}

/**
 * Authenticated fetch with automatic 401 recovery: renews the token and tries
 * ONCE. If the function rejects again, returns the 401 — callers treat it as
 * "offline"; the session is NEVER destroyed on its own (avoids the
 * login → reload → login loop).
 */
async function authedFetch(method: 'GET' | 'PUT', url: string, body?: string): Promise<Response> {
  let token = await getValidToken()
  if (!token) throw new Error('no token')
  let res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` }, body })
  if (res.status !== 401) return res

  console.warn('[sync] 401 — renovando o token e tentando de novo…')
  token = await renewToken()
  if (!token) throw new Error('renovação do token falhou')
  return fetch(url, { method, headers: { Authorization: `Bearer ${token}` }, body })
}

async function request(method: 'GET' | 'PUT', body?: string): Promise<Response> {
  return authedFetch(method, ENDPOINT, body)
}

/** Replaces the app state with the data coming from the cloud. */
function replaceData(data: unknown): void {
  const normalized = normalizeData(data)
  if (normalized) appStore.set(normalized)
}

/* ---------- parachute: versioned local backup (path "E", 2026-08-17) ---------- */

const BACKUP_KEY = 'esquizomon-rpg:backup'

interface LocalBackup {
  ts: string
  data: AppData
}

function readRawBackup(): LocalBackup[] {
  try {
    const list = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? '[]') as LocalBackup[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** Stores the current local version BEFORE an overwrite (merge) — the last
 *  3 copies stay recoverable. */
function takeBackup(data: AppData): void {
  try {
    const historico = readRawBackup()
    historico.push({ ts: new Date().toISOString(), data: (normalizeData(data) ?? data) })
    localStorage.setItem(BACKUP_KEY, JSON.stringify(historico.slice(-3)))
  } catch {
    /* sync matters more than backup */
  }
}

/** Saved local backups (Config restore screen). */
export function getBackups(): Array<{ ts: string }> {
  return readRawBackup().map((b) => ({ ts: b.ts }))
}

/** Restores a backup copy (overwrites the current state, keeping the current one). */
export function restoreBackup(ts: string): boolean {
  const b = readRawBackup().find((x) => x.ts === ts)
  if (!b) return false
  takeBackup(appStore.get())
  replaceData(b.data)
  return true
}

async function sendNow(): Promise<void> {
  const token = await getValidToken()
  if (!token) return
  setSyncState('enviando')
  const savedAt = readMeta().salvoEm ?? new Date().toISOString()
  try {
    const res = await request('PUT', JSON.stringify({ salvoEm: savedAt, dados: appStore.get() }))
    if (!res.ok) throw new Error(`PUT falhou: HTTP ${res.status}`)
    pendingLocalChange = false
    setSyncState('sincronizado')
  } catch {
    setSyncState('sem-conexao')
  }
}

/** Flushes any unsent local change immediately. Used when the user leaves the
 *  tab/app so the last interaction is not lost to the debounce window. */
function flushPendingNow(): void {
  if (!pendingLocalChange) return
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  pendingLocalChange = false
  void sendNow()
}

/** Syncs with the cloud — NON-destructive MERGE (path "E", 2026-08-17).
 *  `force` decides only the BASE of the character/config (the login
 *  question); the collections (tasks, diary, conversations) always merge by item.
 *  There is never a global overwrite that loses entities. */
export async function syncNow(force?: 'local' | 'nuvem'): Promise<void> {
  const token = await getValidToken()
  if (!token) {
    setSyncState('local')
    return
  }
  setSyncState('enviando')
  try {
    const res = await request('GET')
    if (!res.ok) throw new Error(`GET falhou: HTTP ${res.status}`)
    const envelope = (await res.json()) as { salvoEm: string | null; dados: unknown }
    const local = appStore.get()
    const localSavedAt = readMeta().salvoEm ?? ''
    const cloud: AppData | null = envelope.dados ? normalizeData(envelope.dados) : null

    if (!cloud) {
      // empty cloud (first time) → the local becomes the cloud
      await sendNow()
      return
    }

    // CHARACTER/config BASE: force, otherwise global LWW (salvoEm).
    // Collections merge commutatively regardless of the base.
    let base: AppData
    let other: AppData
    if (force === 'nuvem') {
      base = cloud
      other = local
    } else if (force === 'local') {
      base = local
      other = cloud
    } else if ((envelope.salvoEm ?? '') > localSavedAt) {
      base = cloud
      other = local
    } else {
      base = local
      other = cloud
    }

    const merged = mergeData(base, other)

    const localChanged = JSON.stringify(merged) !== JSON.stringify(local)
    if (localChanged) {
      takeBackup(local) // parachute: keeps the previous version
      loading = true
      replaceData(merged)
      loading = false
      writeMeta({
        salvoEm: ((envelope.salvoEm ?? '') > localSavedAt ? envelope.salvoEm : localSavedAt) ?? undefined,
      })
    }

    const cloudChanged = JSON.stringify(merged) !== JSON.stringify(cloud)
    if (cloudChanged) {
      await sendNow() // PUT uses appStore.get() — the merged (applied to local above)
      return
    }
    setSyncState('sincronizado')
  } catch {
    setSyncState('sem-conexao')
  }
}

/** Called when the session changes (login/logout) — re-syncs or returns to local. */
export function onSessionChange(force?: 'local' | 'nuvem'): void {
  if (currentSession()) {
    startPeriodicPull()
    void syncNow(force)
  } else {
    stopPeriodicPull()
    setSyncState('local')
  }
}

/** Registers local changes and schedules the send (when logged in). */
appStore.subscribe(() => {
  // First call = bootstrap (nanostores calls with the INITIAL value upon
  // subscribing, with no edit). Must NOT bump salvoEm nor schedule a send —
  // that inflated the local salvoEm to "now" on every open and the pull never
  // applied data from other devices (real bug 2026-08-16: desync).
  if (!firstSubscribe) {
    // PULL ECHO: does NOT mark as a local change — otherwise last-write-wins
    // becomes "local always wins" and the cloud (backup) gets overwritten needlessly.
    // The pull writes the cloud salvoEm explicitly.
    if (!loading) {
      // REAL change: stamp the last-write-wins timestamp
      writeMeta({ salvoEm: new Date().toISOString() })
      if (currentSession()) {
        pendingLocalChange = true
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          void sendNow()
        }, DEBOUNCE_MS)
      }
    }
  } else {
    firstSubscribe = false
  }
})

/** Boot: syncs if already logged in (restored session). */
export function initSync(): void {
  if (currentSession()) {
    startPeriodicPull()
    void syncNow()
  } else {
    setSyncState('local')
  }
}
