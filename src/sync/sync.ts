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

const CHAVE_SYNC = 'esquizomon-rpg:sync' // metadados locais de sincronização
const FUNCAO = '/.netlify/functions/dados'
const DEBOUNCE_MS = 2000

export type EstadoSync = 'local' | 'enviando' | 'sincronizado' | 'sem-conexao'

interface MetadadosSync {
  salvoEm?: string
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
let definirEstado: (e: EstadoSync) => void = () => {}

/** A UI (Config) inscreve-se aqui para mostrar o status. */
export function inscreverSync(cb: (e: EstadoSync) => void): () => void {
  definirEstado = cb
  return () => {
    if (definirEstado === cb) definirEstado = () => {}
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

/** Puxa a nuvem e decide quem é mais novo (last-write-wins por salvoEm). */
export async function sincronizarAgora(): Promise<void> {
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

    const blobMaisNovo = envelope.salvoEm && (!local.salvoEm || envelope.salvoEm > local.salvoEm)
    if (blobMaisNovo && envelope.dados) {
      // nuvem mais nova → aplica
      carregando = true
      substituirDados(envelope.dados)
      carregando = false
      gravarMetadados({ salvoEm: envelope.salvoEm ?? undefined })
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
export function aposMudancaSessao(): void {
  if (sessaoAtual()) {
    void sincronizarAgora()
  } else {
    definirEstado('local')
  }
}

/** Registra mudanças locais e agenda o envio (quando logado). */
appStore.subscribe(() => {
  // ECO do pull: NÃO marca como mudança local — senão o last-write-wins vira
  // "local sempre vence" e a nuvem (backup) é sobrescrita à toa. O pull grava
  // o salvoEm da nuvem explicitamente (ver substituirDados/sincronizarAgora).
  if (carregando) return
  // Mudança REAL: marca o timestamp do last-write-wins — mesmo offline
  // (no próximo login, o que mudou por último vence).
  gravarMetadados({ salvoEm: new Date().toISOString() })
  if (!sessaoAtual()) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void enviarAgora()
  }, DEBOUNCE_MS)
})

/** Boot: sincroniza se já estiver logado (sessão restaurada). */
export function iniciarSync(): void {
  if (sessaoAtual()) void sincronizarAgora()
  else definirEstado('local')
}
