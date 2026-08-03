/** Store global (nanostores) — estado imutável, persistido via subscribe. */

import { atom, computed } from 'nanostores'

import type { Agenda, AppData, Configuracao, Dificuldade, Personagem, Tarefa, Tema, TipoTarefa } from '../core/tipos'
import { DANO_HABITO_NEGATIVO, danoDe, diaDaSemana, diaDoMes, hojeISO, novoId, somarDias, xpDe, xpProximoDe, hpMaxDe, manaMaxDe } from '../core/jogo'
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
  esfera?: string
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
    esfera: dados.esfera?.trim() || undefined,
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
    esfera: dados.esfera !== undefined ? (dados.esfera.trim() || undefined) : atual.esfera,
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

/* ---------- mecânica de jogo ---------- */

/** Aplica XP ao personagem (com esfera se houver); retorna se subiu de nível. */
export function ganharXP(quantidade: number, esfera?: string): { subiu: boolean; nivel: number } {
  const p = appStore.get().personagem
  let xp = p.xp + quantidade
  const esferas = { ...p.esferas }
  if (esfera && esfera.trim()) {
    const nome = esfera.trim()
    esferas[nome] = (esferas[nome] ?? 0) + quantidade
  }
  let { nivel } = p
  let xpProximo = p.xpProximo
  let subiu = false
  while (xp >= xpProximo) {
    xp -= xpProximo
    nivel += 1
    xpProximo = xpProximoDe(nivel)
    subiu = true
  }
  const personagem: Personagem = {
    ...p,
    xp,
    xpProximo,
    nivel,
    esferas,
    hpMax: hpMaxDe(nivel),
    manaMax: manaMaxDe(nivel),
  }
  if (subiu) {
    // subir de nível restaura HP e mana
    personagem.hp = personagem.hpMax
    personagem.mana = personagem.manaMax
    personagem.esgotado = false
  }
  appStore.set({ ...appStore.get(), personagem })
  return { subiu, nivel }
}

/** Aplica dano ao personagem (no-op no modo relaxado). Retorna se esgotou. */
export function aplicarDano(quantidade: number): { esgotou: boolean } {
  const dados = appStore.get()
  if (dados.configuracao.modoRelaxado) return { esgotou: false }
  const p = dados.personagem
  if (p.esgotado) return { esgotou: true }
  const hp = Math.max(0, p.hp - quantidade)
  const esgotou = hp <= 0
  appStore.set({
    ...dados,
    personagem: { ...p, hp, esgotado: p.esgotado || esgotou },
  })
  return { esgotou }
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
  const tarefa = tarefas.find((t) => t.id === id)
  if (tarefa) {
    const marcada = tarefa.historico.includes(data)
    if (marcada) ganharXP(xpDe(tarefa.dificuldade), tarefa.esfera)
  }
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
  const tarefa = tarefas.find((t) => t.id === id)
  if (tarefa && tarefa.concluida) ganharXP(xpDe(tarefa.dificuldade), tarefa.esfera)
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
  const tarefa = tarefas.find((t) => t.id === id)
  if (tarefa) {
    if (sinal === 'positivo') ganharXP(xpDe(tarefa.dificuldade), tarefa.esfera)
    else aplicarDano(DANO_HABITO_NEGATIVO)
  }
}

/** Reset diário (uma vez por dia): cobra dano das recorrentes perdidas de ontem e regenera mana. */
export function renovarDia(): void {
  const dados = appStore.get()
  const hoje = hojeISO()
  if (dados.personagem.ultimoDia === hoje) return

  const ontem = somarDias(hoje, -1)
  const diaOntem = diaDaSemana(new Date(ontem + 'T12:00:00'))
  const diaMesOntem = diaDoMes(new Date(ontem + 'T12:00:00'))

  // 1. zera contador de "hoje" dos hábitos
  const tarefas = dados.tarefas.map((t) => {
    if (t.tipo !== 'habito') return t
    const contador = t.contador ?? { hoje: 0, totalPositivo: 0, totalNegativo: 0 }
    return contador.hoje > 0 && !t.historico.includes(hoje) ? { ...t, contador: { ...contador, hoje: 0 } } : t
  })
  appStore.set({ ...dados, tarefas })

  // 2. dano das recorrentes de ontem não concluídas (primeira vez que roda hoje)
  const p = appStore.get().personagem
  const primeiraVez = p.ultimoDia === ''
  if (!primeiraVez && !p.esgotado && !dados.configuracao.modoRelaxado) {
    const perdidas = dados.tarefas.filter((t) => {
      if (t.tipo !== 'recorrente') return false
      if (!valeNaData(t, diaOntem, diaMesOntem)) return false
      return !t.historico.includes(ontem)
    })
    if (perdidas.length > 0) {
      const danoTotal = perdidas.reduce((soma, t) => soma + danoDe(t.dificuldade), 0)
      const hp = Math.max(0, p.hp - danoTotal)
      appStore.set({
        ...appStore.get(),
        personagem: { ...appStore.get().personagem, hp, esgotado: hp <= 0, ultimoDia: hoje },
      })
    }
  }

  // 3. regenera mana (se não estiver esgotado) e marca o dia processado
  const atual = appStore.get().personagem
  appStore.set({
    ...appStore.get(),
    personagem: {
      ...atual,
      ultimoDia: hoje,
      mana: !atual.esgotado ? atual.manaMax : atual.mana,
    },
  })
}

function valeNaData(t: Tarefa, dia: number, diaMes: number): boolean {
  if (t.agenda?.diasDoMes && t.agenda.diasDoMes.length > 0) return t.agenda.diasDoMes.includes(diaMes)
  return !t.agenda || t.agenda.dias.length === 0 || t.agenda.dias.includes(dia)
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
    personagem: appStore.get().personagem,
    configuracao: appStore.get().configuracao,
  })
}

/* ---------- derivados ---------- */

export const totalTarefas = computed(appStore, (d) => d.tarefas.length)
