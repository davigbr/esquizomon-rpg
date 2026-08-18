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
import { normalizarDados } from '../db/storage'
import { obterTokenValido, renovarToken, sessaoAtual } from './auth'
import { notificar } from '../ui/toast'

const CHAVE_SYNC = 'esquizomon-rpg:sync' // metadados locais de sincronização
const FUNCAO = '/.netlify/functions/dados'
const DEBOUNCE_MS = 2000

export type EstadoSync = 'local' | 'enviando' | 'sincronizado' | 'sem-conexao'

interface MetadadosSync {
  salvoEm?: string
  ultimaSync?: string // momento da última sincronização bem-sucedida com a nuvem
}

function lerMetadados(): MetadadosSync {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_SYNC) ?? '{}') as MetadadosSync
  } catch {
    return {}
  }
}

function gravarMetadados(m: MetadadosSync): void {
  localStorage.setItem(CHAVE_SYNC, JSON.stringify(m))
}

let timer: ReturnType<typeof setTimeout> | null = null
let carregando = false // evita o eco: puxar → store → auto-enviar
let inscritosSync: Array<(e: EstadoSync) => void> = []
let intervaloPull: ReturnType<typeof setInterval> | null = null
let primeiroSubscribe = true
let idleTimer: ReturnType<typeof setTimeout> | null = null
const PULL_MS = 10_000
const IDLE_MS = 3 * 60_000 // 3 min sem interação → o polling "dorme"

/** Pull periódico + na volta à aba: com 2 dispositivos logados, as mudanças
 *  de um chegam ao outro em até ~30s (ou ao voltar para a aba). Sem isso, cada
 *  dispositivo só sincroniza no login/edição própria — ficam divergentes. */
function aoDormir(): void {
  // foi pro background OU ficou inativo: para o polling (o navegador throttla
  // timers de fundo; e inatividade não precisa puxar — desperdiça bateria/rede)
  if (intervaloPull) {
    clearInterval(intervaloPull)
    intervaloPull = null
  }
}
function rearmarInatividade(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    idleTimer = null
    aoDormir() // X sem interação (mesmo com a aba visível) → pausa o polling
  }, IDLE_MS)
}
function aoInteragir(): void {
  // toque/tecla/foco: acorda (sincroniza já + retoma o polling) e rearma o idle
  aoAcordar()
  rearmarInatividade()
}
function aoAcordar(): void {
  // voltou / o usuário interagiu: retoma o polling e sincroniza JÁ (traz o
  // que aconteceu enquanto "dormia")
  if (document.visibilityState === 'visible' && sessaoAtual()) {
    if (!intervaloPull) iniciarTimerPull()
    void sincronizarAgora()
  }
}
function iniciarTimerPull(): void {
  if (intervaloPull) return
  intervaloPull = setInterval(() => {
    if (document.visibilityState === 'visible' && sessaoAtual()) void sincronizarAgora()
  }, PULL_MS)
}
function aoMudarVisibilidade(): void {
  if (document.visibilityState === 'hidden') aoDormir()
  else aoInteragir() // voltar à aba: acorda + rearma o idle
}
function iniciarPullPeriodico(): void {
  if (intervaloPull) return // já tem listeners/timer
  iniciarTimerPull()
  document.addEventListener('visibilitychange', aoMudarVisibilidade)
  window.addEventListener('focus', aoInteragir)
  window.addEventListener('pointerdown', aoInteragir, { passive: true })
  window.addEventListener('keydown', aoInteragir)
  rearmarInatividade()
}

function pararPullPeriodico(): void {
  if (intervaloPull) {
    clearInterval(intervaloPull)
    intervaloPull = null
  }
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  document.removeEventListener('visibilitychange', aoMudarVisibilidade)
  window.removeEventListener('focus', aoInteragir)
  window.removeEventListener('pointerdown', aoInteragir)
  window.removeEventListener('keydown', aoInteragir)
}

/** Última sincronização bem-sucedida (ISO) ou null. */
export function lerUltimaSync(): string | null {
  return lerMetadados().ultimaSync ?? null
}

function definirEstado(e: EstadoSync): void {
  if (e === 'sincronizado') {
    const m = lerMetadados()
    gravarMetadados({ ...m, ultimaSync: new Date().toISOString() })
  }
  for (const cb of inscritosSync) cb(e)
}

/** A UI inscreve-se aqui para mostrar o status (suporta vários listeners). */
export function inscreverSync(cb: (e: EstadoSync) => void): () => void {
  inscritosSync.push(cb)
  return () => {
    inscritosSync = inscritosSync.filter((x) => x !== cb)
  }
}

/**
 * Fetch autenticado com auto-recuperação de 401: renova o token e tenta UMA
 * vez. Se a function rejeitar de novo, devolve o 401 — os chamadores tratam
 * como "sem conexão"; a sessão NUNCA é destruída sozinha (evita o loop
 * login → reload → login).
 */
async function chamarAutenticado(metodo: 'GET' | 'PUT', url: string, corpo?: string): Promise<Response> {
  let token = await obterTokenValido()
  if (!token) throw new Error('sem token')
  let res = await fetch(url, { method: metodo, headers: { Authorization: `Bearer ${token}` }, body: corpo })
  if (res.status !== 401) return res

  console.warn('[sync] 401 — renovando o token e tentando de novo…')
  token = await renovarToken()
  if (!token) throw new Error('renovação do token falhou')
  return fetch(url, { method: metodo, headers: { Authorization: `Bearer ${token}` }, body: corpo })
}

async function chamar(metodo: 'GET' | 'PUT', corpo?: string): Promise<Response> {
  return chamarAutenticado(metodo, FUNCAO, corpo)
}

/** Substitui o estado do app pelos dados vindos da nuvem. */
function substituirDados(dados: unknown): void {
  const normalizado = normalizarDados(dados)
  if (normalizado) appStore.set(normalizado)
}

async function enviarAgora(): Promise<void> {
  const token = await obterTokenValido()
  if (!token) return
  definirEstado('enviando')
  const salvoEm = lerMetadados().salvoEm ?? new Date().toISOString()
  try {
    const res = await chamar('PUT', JSON.stringify({ salvoEm, dados: appStore.get() }))
    if (!res.ok) throw new Error(`PUT falhou: HTTP ${res.status}`)
    definirEstado('sincronizado')
  } catch {
    definirEstado('sem-conexao')
  }
}

/** Sincroniza com a nuvem. `forcar` decide a direção (pergunta da UI no
 *  login com dados locais — 2026-08-12): 'local' envia SEMPRE (o dispositivo
 *  sobrescreve a nuvem), 'nuvem' aplica SEMPRE (a nuvem sobrescreve o local),
 *  omitido = last-write-wins por `salvoEm`. */
export async function sincronizarAgora(forcar?: 'local' | 'nuvem'): Promise<void> {
  const token = await obterTokenValido()
  if (!token) {
    definirEstado('local')
    return
  }
  definirEstado('enviando')
  try {
    const res = await chamar('GET')
    if (!res.ok) throw new Error(`GET falhou: HTTP ${res.status}`)
    const envelope = (await res.json()) as { salvoEm: string | null; dados: unknown }
    const local = lerMetadados()

    if (forcar === 'local') {
      await enviarAgora()
      return
    }

    const blobMaisNovo =
      forcar === 'nuvem' || (envelope.salvoEm && (!local.salvoEm || envelope.salvoEm > local.salvoEm))
    if (blobMaisNovo && envelope.dados) {
      // nuvem mais nova (ou forçado) → aplica
      carregando = true
      substituirDados(envelope.dados)
      carregando = false
      gravarMetadados({ salvoEm: envelope.salvoEm ?? undefined })
      notificar('Sincronizado — dados atualizados da nuvem.')
      definirEstado('sincronizado')
    } else if (!envelope.salvoEm || (local.salvoEm && local.salvoEm > envelope.salvoEm)) {
      // nuvem vazia ou mais velha → envia o local (primeira migração)
      await enviarAgora()
    } else {
      definirEstado('sincronizado')
    }
  } catch {
    definirEstado('sem-conexao')
  }
}

/** Chama quando a sessão muda (login/sair) — re-sincroniza ou volta ao local. */
export function aposMudancaSessao(forcar?: 'local' | 'nuvem'): void {
  if (sessaoAtual()) {
    iniciarPullPeriodico()
    void sincronizarAgora(forcar)
  } else {
    pararPullPeriodico()
    definirEstado('local')
  }
}

/** Registra mudanças locais e agenda o envio (quando logado). */
appStore.subscribe(() => {
  // Primeira chamada = bootstrap (o nanostores chama com o valor INICIAL ao
  // registrar, sem haver edição). NÃO pode bumpar o salvoEm nem agendar envio —
  // isso inflava o salvoEm local para "agora" a cada abertura e o pull nunca
  // aplicava dados de outros dispositivos (bug real 2026-08-16: dessincronização).
  if (!primeiroSubscribe) {
    // ECO do pull: NÃO marca como mudança local — senão o last-write-wins vira
    // "local sempre vence" e a nuvem (backup) é sobrescrita à toa. O pull grava
    // o salvoEm da nuvem explicitamente.
    if (!carregando) {
      // Mudança REAL: marca o timestamp do last-write-wins
      gravarMetadados({ salvoEm: new Date().toISOString() })
      if (sessaoAtual()) {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          void enviarAgora()
        }, DEBOUNCE_MS)
      }
    }
  } else {
    primeiroSubscribe = false
  }
})

/** Boot: sincroniza se já estiver logado (sessão restaurada). */
export function iniciarSync(): void {
  if (sessaoAtual()) {
    iniciarPullPeriodico()
    void sincronizarAgora()
  } else {
    definirEstado('local')
  }
}
