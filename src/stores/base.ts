/** Núcleo da store (nanostores): estado global + helpers compartilhados.
 *  Os domínios (personagem, tarefas, check-in, diário, conversas, config)
 *  importam daqui e o app.ts re-exporta tudo — nenhum módulo importa o
 *  app.ts, então não há ciclos. */

import { atom } from 'nanostores'

import type { Agenda, AppData, Dificuldade, Tarefa, TipoLog, TipoTarefa } from '../core/tipos'
import { novoId } from '../core/jogo'
import { MAX_LOG, carregar, salvar } from '../db/storage'

export const appStore = atom<AppData>(carregar())

appStore.subscribe((dados) => {
  salvar(dados)
})

/** Registra um evento no histórico (mais recente primeiro, limitado a MAX_LOG). */
export function registrarLog(tipo: TipoLog, texto: string): void {
  const dados = appStore.get()
  const evento = { id: novoId(), ts: new Date().toISOString(), tipo, texto }
  appStore.set({ ...dados, log: [evento, ...dados.log].slice(0, MAX_LOG) })
}

export function tarefaPorId(id: string): Tarefa | undefined {
  return appStore.get().tarefas.find((t) => t.id === id)
}

export interface Resultado {
  ok: boolean
  motivo?: string
}

export interface DadosTarefa {
  titulo: string
  tipo: TipoTarefa
  dificuldade: Dificuldade
  tags: string[]
  notas?: string
  dueDate?: string
  esfera?: string
  agenda?: Agenda
  sinal?: 'positivo' | 'negativo' | 'ambos'
}
