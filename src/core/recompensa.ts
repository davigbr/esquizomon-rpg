/**
 * Recompensa por menção de cartas no diário (2026-08-17).
 *
 * Sempre que um NOME DE CARTA aparecer no diário, o jogador ganha XP — isso
 * acontece quando a Fábula lê o diário (na interação com o chat): o app
 * processa as entradas e aplica o XP; a Fábula celebra na resposta.
 *
 * "Deve salvar para não acontecer duas vezes": o campo `diarioXp` (data →
 * ids de carta já premiados) registra o que já foi recompensado; se o texto
 * da entrada mudar e mencionar uma carta NOVA, essa nova dá XP.
 */
import { appStore } from '../stores/base'
import { ganharXP } from '../stores/personagem'
import { todasAsCartas } from './baralho'

/** XP por menção de uma carta no diário (por entrada/dia). */
export const XP_POR_MENCAO = 10

export interface ResultadoMencoes {
  nomes: string[]
  xp: number
  nivelSubiu: boolean
  novasCartas: string[]
}

/** Varre o diário, recompensa menções não premiadas e aplica o XP
 *  (com leve-up, se cair). Chamado na interação com a Fábula. */
export function processarMencoesDiario(): ResultadoMencoes {
  const d = appStore.get()
  const ja = d.diarioXp ?? {}
  const deck = todasAsCartas()
  const entradas = d.diario ?? []

  const novoJa: Record<string, string[]> = { ...ja }
  const detectados: string[] = []
  let total = 0
  let mudou = false

  for (const entrada of entradas) {
    if (!entrada || typeof entrada.texto !== 'string') continue
    const premiados = ja[entrada.data] ?? []
    const texto = `${entrada.titulo ?? ''}\n${entrada.texto}`.toLowerCase()
    for (const carta of deck) {
      if (!premiados.includes(carta.id) && texto.includes(carta.name.toLowerCase())) {
        novoJa[entrada.data] = [...(novoJa[entrada.data] ?? [...premiados]), carta.id]
        if (!detectados.includes(carta.name)) detectados.push(carta.name)
        total += XP_POR_MENCAO
        mudou = true
      }
    }
  }

  if (!mudou) return { nomes: [], xp: 0, nivelSubiu: false, novasCartas: [] }

  // persiste o registro ANTES (ganharXp re-setá o store preservando este campo)
  appStore.set({ ...d, diarioXp: novoJa })
  const r = ganharXP(total)
  return { nomes: detectados, xp: total, nivelSubiu: r.subiu, novasCartas: r.novasCartas }
}
