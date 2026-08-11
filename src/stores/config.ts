/** Domínio de configuração: tema, preferências, import/export e zeragem. */

import type { Configuracao, Tema } from '../core/tipos'
import { personagemInicial } from '../core/jogo'
import { sortearIniciais } from '../core/baralho'
import { apagarTudo, normalizarDados, salvarTema } from '../db/storage'
import { appStore, registrarLog } from './base'
import type { Resultado } from './base'
import { deckCarregado } from './personagem'

export function definirTema(tema: Tema): void {
  salvarTema(tema)
  appStore.set({ ...appStore.get(), configuracao: { ...appStore.get().configuracao, tema } })
  document.documentElement.dataset.theme = tema
}

export function definirConfiguracao(patch: Partial<Configuracao>): void {
  appStore.set({ ...appStore.get(), configuracao: { ...appStore.get().configuracao, ...patch } })
}

/* ---------- import/export ---------- */

export function exportarJSON(): string {
  return JSON.stringify(appStore.get(), null, 2)
}

export function importarJSON(texto: string): Resultado {
  try {
    const bruto = JSON.parse(texto)
    if (typeof bruto !== 'object' || bruto === null || !Array.isArray(bruto.tarefas)) {
      return { ok: false, motivo: 'Arquivo com formato desconhecido.' }
    }
    const normalizado = normalizarDados(bruto)
    if (!normalizado) return { ok: false, motivo: 'Dados inválidos no arquivo.' }
    appStore.set(normalizado)
    return { ok: true }
  } catch {
    return { ok: false, motivo: 'Não deu para ler o arquivo (JSON inválido).' }
  }
}

export function apagarTodosDados(): void {
  apagarTudo()
  appStore.set({
    versao: appStore.get().versao,
    tarefas: [],
    personagem: personagemInicial(),
    configuracao: appStore.get().configuracao,
    log: [],
    conversas: [],
    diario: [],
  })
  // o deck já carregou no boot — re-sorteia as cartas iniciais do baralho zerado
  if (deckCarregado) {
    const iniciais = sortearIniciais(deckCarregado)
    appStore.set({ ...appStore.get(), personagem: { ...appStore.get().personagem, cartas: iniciais } })
  }
  registrarLog('sistema', 'Dados apagados — novo território')
}
