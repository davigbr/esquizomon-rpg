/**
 * Sincronização com a nuvem (Netlify Blobs) — OPCIONAL. O Esquizomon roda 100%
 * local (localStorage); ao entrar com uma conta, os dados ganham uma cópia na
 * nuvem (backup/restauração entre dispositivos).
 *
 * - Ao logar: puxa o blob (se mais novo que o local) e aplica; se a nuvem
 *   estiver vazia ou mais velha, envia o estado local (primeira migração).
 * - Depois: cada mudança no store é enviada com debounce.
 * - Offline: nada quebra — os dados ficam no localStorage e o status mostra
 *   "Sem conexão".
 * - Conflito: last-write-wins por timestamp (salvoEm).
 */

import { appStore } from '../stores/base'
import { normalizeData } from '../db/storage'
import { getValidToken, renewToken, currentSession } from './auth'
import type { AppData } from '../core/tipos'
import { mergeData } from '../core/syncMerge'

const SYNC_KEY = 'esquizomon-rpg:sync' // metadados locais de sincronização
const ENDPOINT = '/.netlify/functions/dados'
const DEBOUNCE_MS = 2000

export type SyncState = 'local' | 'enviando' | 'sincronizado' | 'sem-conexao'

interface SyncMeta {
  salvoEm?: string
  lastSync?: string // momento da última sincronização bem-sucedida com a nuvem
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
let loading = false // evita o eco: puxar → store → auto-enviar
let syncSubscribers: Array<(e: SyncState) => void> = []
let pullInterval: ReturnType<typeof setInterval> | null = null
let firstSubscribe = true
let idleTimer: ReturnType<typeof setTimeout> | null = null
const PULL_MS = 10_000
const IDLE_MS = 3 * 60_000 // 3 min sem interação → o polling "dorme"

/** Pull periódico + na volta à aba: com 2 dispositivos logados, as mudanças
 *  de um chegam ao outro em até ~30s (ou ao voltar para a aba). Sem isso, cada
 *  dispositivo só sincroniza no login/edição própria — ficam divergentes. */
function onSleep(): void {
  // foi pro background OU ficou inativo: para o polling (o navegador throttla
  // timers de fundo; e inatividade não precisa puxar — desperdiça bateria/rede)
  if (pullInterval) {
    clearInterval(pullInterval)
    pullInterval = null
  }
}
function rearmIdle(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    idleTimer = null
    onSleep() // X sem interação (mesmo com a aba visível) → pausa o polling
  }, IDLE_MS)
}
function onInteract(): void {
  // toque/tecla/foco: acorda (sincroniza já + retoma o polling) e rearma o idle
  onWake()
  rearmIdle()
}
function onWake(): void {
  // voltou / o usuário interagiu: retoma o polling e sincroniza JÁ (traz o
  // que aconteceu enquanto "dormia")
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
  if (document.visibilityState === 'hidden') onSleep()
  else onInteract() // voltar à aba: acorda + rearma o idle
}
function startPeriodicPull(): void {
  if (pullInterval) return // já tem listeners/timer
  startPullTimer()
  document.addEventListener('visibilitychange', onVisibilityChange)
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
  window.removeEventListener('focus', onInteract)
  window.removeEventListener('pointerdown', onInteract)
  window.removeEventListener('keydown', onInteract)
}

/** Última sincronização bem-sucedida (ISO) ou null. */
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

/** A UI inscreve-se aqui para mostrar o status (suporta vários listeners). */
export function subscribeSync(cb: (e: SyncState) => void): () => void {
  syncSubscribers.push(cb)
  return () => {
    syncSubscribers = syncSubscribers.filter((x) => x !== cb)
  }
}

/**
 * Fetch autenticado com auto-recuperação de 401: renova o token e tenta UMA
 * vez. Se a function rejeitar de novo, devolve o 401 — os chamadores tratam
 * como "sem conexão"; a sessão NUNCA é destruída sozinha (evita o loop
 * login → reload → login).
 */
async function authedFetch(method: 'GET' | 'PUT', url: string, body?: string): Promise<Response> {
  let token = await getValidToken()
  if (!token) throw new Error('sem token')
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

/** Substitui o estado do app pelos dados vindos da nuvem. */
function replaceData(data: unknown): void {
  const normalized = normalizeData(data)
  if (normalized) appStore.set(normalized)
}

/* ---------- paraquedas: backup local versionado (caminho "E", 2026-08-17) ---------- */

const BACKUP_KEY = 'esquizomon-rpg:backup'

interface LocalBackup {
  ts: string
  data: AppData
}

function readRawBackup(): LocalBackup[] {
  try {
    const lista = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? '[]') as LocalBackup[]
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

/** Guarda a versão local atual ANTES de uma sobreescrita (merge) — as últimas
 *  3 cópias ficam recuperáveis. */
function takeBackup(data: AppData): void {
  try {
    const historico = readRawBackup()
    historico.push({ ts: new Date().toISOString(), data: (normalizeData(data) ?? data) })
    localStorage.setItem(BACKUP_KEY, JSON.stringify(historico.slice(-3)))
  } catch {
    /* sincronização importa mais que backup */
  }
}

/** Backups locais salvos (tela de restauração da Config). */
export function getBackups(): Array<{ ts: string }> {
  return readRawBackup().map((b) => ({ ts: b.ts }))
}

/** Restaura uma cópia de backup (sobrescreve o estado atual, guardando o atual). */
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
    setSyncState('sincronizado')
  } catch {
    setSyncState('sem-conexao')
  }
}

/** Sincroniza com a nuvem — MERGE não-destrutivo (caminho "E", 2026-08-17).
 *  `force` decide apenas a BASE do personagem/configuração (a pergunta do
 *  login); as coleções (tarefas, diário, conversas) sempre mesclam por item.
 *  Nunca há sobrescrita global que perca entidades. */
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
      // nuvem vazia (primeira vez) → o local vira a nuvem
      await sendNow()
      return
    }

    // BASE do personagem/configuração: forçar, senão LWW global (salvoEm).
    // As coleções mesclam de forma comutativa independentemente da base.
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
      takeBackup(local) // paraquedas: guarda a versão anterior
      loading = true
      replaceData(merged)
      loading = false
      writeMeta({
        salvoEm: ((envelope.salvoEm ?? '') > localSavedAt ? envelope.salvoEm : localSavedAt) ?? undefined,
      })
    }

    const cloudChanged = JSON.stringify(merged) !== JSON.stringify(cloud)
    if (cloudChanged) {
      await sendNow() // PUT usa appStore.get() — o fundido (aplicado ao local acima)
      return
    }
    setSyncState('sincronizado')
  } catch {
    setSyncState('sem-conexao')
  }
}

/** Chama quando a sessão muda (login/sair) — re-sincroniza ou volta ao local. */
export function onSessionChange(force?: 'local' | 'nuvem'): void {
  if (currentSession()) {
    startPeriodicPull()
    void syncNow(force)
  } else {
    stopPeriodicPull()
    setSyncState('local')
  }
}

/** Registra mudanças locais e agenda o envio (quando logado). */
appStore.subscribe(() => {
  // Primeira chamada = bootstrap (o nanostores chama com o valor INICIAL ao
  // registrar, sem haver edição). NÃO pode bumpar o salvoEm nem agendar envio —
  // isso inflava o salvoEm local para "agora" a cada abertura e o pull nunca
  // aplicava dados de outros dispositivos (bug real 2026-08-16: dessincronização).
  if (!firstSubscribe) {
    // ECO do pull: NÃO marca como mudança local — senão o last-write-wins vira
    // "local sempre vence" e a nuvem (backup) é sobrescrita à toa. O pull grava
    // o salvoEm da nuvem explicitamente.
    if (!loading) {
      // Mudança REAL: marca o timestamp do last-write-wins
      writeMeta({ salvoEm: new Date().toISOString() })
      if (currentSession()) {
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

/** Boot: sincroniza se já estiver logado (sessão restaurada). */
export function initSync(): void {
  if (currentSession()) {
    startPeriodicPull()
    void syncNow()
  } else {
    setSyncState('local')
  }
}
