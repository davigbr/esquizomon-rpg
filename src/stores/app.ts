/** Store global (nanostores) — estado imutável, persistido via subscribe. */

import { atom, computed } from 'nanostores'

import type { Agenda, AppData, Configuracao, Dificuldade, Tarefa, Tema, TipoTarefa } from '../core/tipos'
import { hojeISO, novoId } from '../core/jogo'
import { apagarTudo, carregar, normalizarDados, salvar, salvarTema } from '../db/storage'

export const appStore = atom<AppData>(carregar())

appStore.subscribe((dados) => {
  salvar(dados)
})

/* ---------- helpers ---------- */

export function tarefaPorId(id: string): Tarefa | undefined {
  return appStore.get().tarefas.find((t) => t.id === id)
}

export function tagsEmUso(dados: AppData): string[] {
  const set = new Set<string>()
  for (const t of dados.tarefas) for (const tag of t.tags) set.add(tag)
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/* ---------- ações ---------- */

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
  agenda?: Agenda
  sinal?: 'positivo' | 'negativo' | 'ambos'
}

export function criarTarefa(dados: DadosTarefa): Resultado {
  const titulo = dados.titulo.trim()
  if (!titulo) return { ok: false, motivo: 'Dê um nome para a tarefa.' }
  const tarefa: Tarefa = {
    id: novoId(),
    tipo: dados.tipo,
    titulo,
    dificuldade: dados.dificuldade,
    tags: dados.tags,
    notas: dados.notas?.trim() || undefined,
    dueDate: dados.tipo === 'unica' ? dados.dueDate : undefined,
    agenda: dados.tipo === 'recorrente' ? { dias: dados.agenda?.dias ?? [], diasDoMes: dados.agenda?.diasDoMes } : undefined,
    sinal: dados.tipo === 'habito' ? dados.sinal ?? 'positivo' : undefined,
    contador:
      dados.tipo === 'habito'
        ? { hoje: 0, totalPositivo: 0, totalNegativo: 0 }
        : undefined,
    concluida: false,
    historico: [],
    criadaEm: new Date().toISOString(),
  }
  appStore.set({ ...appStore.get(), tarefas: [...appStore.get().tarefas, tarefa] })
  return { ok: true }
}

export function atualizarTarefa(id: string, dados: Partial<DadosTarefa>): Resultado {
  const atual = tarefaPorId(id)
  if (!atual) return { ok: false, motivo: 'Tarefa não encontrada.' }
  const titulo = dados.titulo?.trim()
  if (titulo !== undefined && !titulo) return { ok: false, motivo: 'Dê um nome para a tarefa.' }

  const proxima: Tarefa = {
    ...atual,
    titulo: titulo ?? atual.titulo,
    dificuldade: dados.dificuldade ?? atual.dificuldade,
    tags: dados.tags ?? atual.tags,
    notas: dados.notas?.trim() || undefined,
    dueDate: dados.dueDate !== undefined ? dados.dueDate : atual.dueDate,
  }
  if (dados.tipo) {
    proxima.tipo = dados.tipo
    if (dados.tipo === 'recorrente') {
      proxima.agenda = { dias: dados.agenda?.dias ?? [], diasDoMes: dados.agenda?.diasDoMes ?? atual.agenda?.diasDoMes }
    }
    if (dados.tipo === 'habito') {
      proxima.sinal = dados.sinal ?? atual.sinal ?? 'positivo'
      proxima.contador = atual.contador ?? { hoje: 0, totalPositivo: 0, totalNegativo: 0 }
    }
    if (dados.tipo !== 'unica') proxima.dueDate = undefined
  }
  const tarefas = appStore.get().tarefas.map((t) => (t.id === id ? proxima : t))
  appStore.set({ ...appStore.get(), tarefas })
  return { ok: true }
}

export function excluirTarefa(id: string): void {
  appStore.set({ ...appStore.get(), tarefas: appStore.get().tarefas.filter((t) => t.id !== id) })
}

/** Reordena as tarefas (drag & drop): `ids` na nova ordem, dentro do mesmo tipo. */
export function reordenarTarefas(ids: string[]): void {
  const tarefas = appStore.get().tarefas
  const mapa = new Map(tarefas.map((t) => [t.id, t]))
  const conjunto = new Set(ids)
  const reordenadas = ids.map((id) => mapa.get(id)).filter((t): t is Tarefa => t !== undefined)
  if (reordenadas.length !== ids.length) return
  const tipo = reordenadas[0]?.tipo
  if (!tipo) return
  const demais = tarefas.filter((t) => !conjunto.has(t.id) || t.tipo !== tipo)
  const resultado = [...demais, ...reordenadas]
  appStore.set({ ...appStore.get(), tarefas: resultado })
}

/** Recorrente: marca/desmarca o dia no histórico (data = dia visível; default hoje). */
export function alternarRecorrenteHoje(id: string, data: string = hojeISO()): void {
  const tarefas = appStore.get().tarefas.map((t) => {
    if (t.id !== id || t.tipo !== 'recorrente') return t
    const tem = t.historico.includes(data)
    return {
      ...t,
      historico: tem ? t.historico.filter((d) => d !== data) : [...t.historico, data],
    }
  })
  appStore.set({ ...appStore.get(), tarefas })
}

/** Única: alterna concluída e registra a data (data = dia visível; default hoje). */
export function alternarUnica(id: string, data: string = hojeISO()): void {
  const tarefas = appStore.get().tarefas.map((t) => {
    if (t.id !== id || t.tipo !== 'unica') return t
    const concluida = !t.concluida
    return {
      ...t,
      concluida,
      historico: concluida
        ? [...new Set([...t.historico, data])]
        : t.historico.filter((d) => d !== data),
    }
  })
  appStore.set({ ...appStore.get(), tarefas })
}

/** Hábito: registra uma repetição positiva (+) ou negativa (−). */
export function registrarHabito(id: string, sinal: 'positivo' | 'negativo', data: string = hojeISO()): void {
  const tarefas = appStore.get().tarefas.map((t) => {
    if (t.id !== id || t.tipo !== 'habito') return t
    const contador = t.contador ?? { hoje: 0, totalPositivo: 0, totalNegativo: 0 }
    if (sinal === 'positivo') {
      const historico = t.historico.includes(data) ? t.historico : [...t.historico, data]
      return {
        ...t,
        historico,
        contador: { ...contador, hoje: contador.hoje + 1, totalPositivo: contador.totalPositivo + 1 },
      }
    }
    return {
      ...t,
      contador: { ...contador, totalNegativo: contador.totalNegativo + 1 },
    }
  })
  appStore.set({ ...appStore.get(), tarefas })
}

/** Zera o contador de "hoje" dos hábitos quando o dia vira. */
export function renovarDia(): void {
  const hoje = hojeISO()
  const tarefas = appStore.get().tarefas.map((t) => {
    if (t.tipo !== 'habito') return t
    const contador = t.contador ?? { hoje: 0, totalPositivo: 0, totalNegativo: 0 }
    const zerar = contador.hoje > 0 && !t.historico.includes(hoje)
    return zerar ? { ...t, contador: { ...contador, hoje: 0 } } : t
  })
  appStore.set({ ...appStore.get(), tarefas })
}

/* ---------- config ---------- */

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
    configuracao: appStore.get().configuracao,
  })
}

/* ---------- derivados ---------- */

export const totalTarefas = computed(appStore, (d) => d.tarefas.length)
