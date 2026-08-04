/** Store global (nanostores) — estado imutável, persistido via subscribe. */

import { atom, computed } from 'nanostores'

import type { Agenda, AppData, Configuracao, Dificuldade, Personagem, Tarefa, Tema, TipoTarefa } from '../core/tipos'
import { DANO_HABITO_NEGATIVO, cartasPorNivel, custoInvocacao, danoDe, diaDaSemana, diaDoMes, hojeISO, novoId, personagemInicial, somarDias, xpDe, xpProximoDe, hpMaxDe, manaMaxDe } from '../core/jogo'
import type { Carta } from '../core/baralho'
import { sortearIds, sortearIniciais } from '../core/baralho'
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

/* Deck carregado + fila de desbloqueio (o deck chega assíncrono no boot). */
let deckCarregado: Carta[] | null = null
let desbloqueioPendente = 0
/** Evento de morte pendente de ser exibido pela UI (carta perdida). */
let mortePendente: { cartaId: string; cartaNome: string } | null = null

/** Consome o evento de morte (uma vez) — a UI mostra a tela de esgotado e a carta perdida. */
export function consumirMorte(): { cartaId: string; cartaNome: string } | null {
  const m = mortePendente
  mortePendente = null
  return m
}

/** Registra a morte (esgotou agora) e perde 1 carta da coleção.
 *  A ordem importa: `mortePendente` é setada ANTES do set das cartas, para o
 *  subscribe disparado pela remoção já encontrar o evento e mostrar o overlay. */
function registrarMorte(): void {
  const dados = appStore.get()
  const p = dados.personagem
  if (p.cartas.length > 0) {
    const perdida = p.cartas[Math.floor(Math.random() * p.cartas.length)]
    const carta = deckCarregado?.find((c) => c.id === perdida)
    mortePendente = { cartaId: perdida, cartaNome: carta?.name ?? perdida }
    appStore.set({ ...dados, personagem: { ...p, cartas: p.cartas.filter((id) => id !== perdida) } })
  } else {
    mortePendente = { cartaId: '', cartaNome: '' }
  }
}

/** Registra o deck carregado; sorteia as cartas iniciais e processa desbloqueios pendentes. */
export function registrarDeck(cartas: Carta[]): void {
  deckCarregado = cartas
  const dados = appStore.get()
  const p = dados.personagem
  if (p.cartas.length === 0 && !p.esgotado) {
    // primeira execução: 5 monstros + 1 captura + 1 aliança
    const iniciais = sortearIniciais(cartas)
    appStore.set({ ...appStore.get(), personagem: { ...p, cartas: iniciais } })
  }
  if (desbloqueioPendente > 0) {
    const n = desbloqueioPendente
    desbloqueioPendente = 0
    desbloquearCartas(n)
  }
}

/** Sorteia e adiciona n cartas novas ao personagem; retorna os ids desbloqueados. */
function desbloquearCartas(n: number): string[] {
  const dados = appStore.get()
  const p = dados.personagem
  if (!deckCarregado) {
    desbloqueioPendente += n
    return []
  }
  const novos = sortearIds(deckCarregado, n, p.cartas)
  if (novos.length === 0) return []
  appStore.set({
    ...dados,
    personagem: { ...p, cartas: [...p.cartas, ...novos] },
  })
  return novos
}

/** Aplica XP ao personagem (com esfera se houver); retorna se subiu de nível e cartas novas. */
export function ganharXP(quantidade: number, esfera?: string): { subiu: boolean; nivel: number; novasCartas: string[] } {
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
  let niveis = 0
  while (xp >= xpProximo) {
    xp -= xpProximo
    nivel += 1
    xpProximo = xpProximoDe(nivel)
    subiu = true
    niveis += 1
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
  const novasCartas = subiu ? desbloquearCartas(niveis * cartasPorNivel()) : []
  return { subiu, nivel, novasCartas }
}

/** Invoca uma carta desbloqueada: gasta mana (custo cresce por invocação até o teto). */
export function invocarCarta(id: string): Resultado {
  const dados = appStore.get()
  const p = dados.personagem
  const carta = deckCarregado?.find((c) => c.id === id)
  if (!carta) return { ok: false, motivo: 'Carta não encontrada.' }
  if (!p.cartas.includes(id)) return { ok: false, motivo: 'Esta carta ainda está bloqueada.' }
  const custo = custoInvocacao(carta.type, p.invocacoes[id] ?? 0)
  if (p.mana < custo) return { ok: false, motivo: `Mana insuficiente — precisa de ${custo}.` }
  appStore.set({
    ...dados,
    personagem: {
      ...p,
      mana: p.mana - custo,
      invocacoes: { ...p.invocacoes, [id]: (p.invocacoes[id] ?? 0) + 1 },
    },
  })
  return { ok: true }
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
  if (esgotou) registrarMorte()
  return { esgotou }
}

/** Recorrente: marca/desmarca o dia no histórico (data = dia visível; default hoje). Retorna cartas novas. */
export function alternarRecorrenteHoje(id: string, data: string = hojeISO()): string[] {
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
    if (marcada) return ganharXP(xpDe(tarefa.dificuldade), tarefa.esfera).novasCartas
  }
  return []
}

/** Única: alterna concluída e registra a data (data = dia visível; default hoje). Retorna cartas novas. */
export function alternarUnica(id: string, data: string = hojeISO()): string[] {
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
  if (tarefa && tarefa.concluida) return ganharXP(xpDe(tarefa.dificuldade), tarefa.esfera).novasCartas
  return []
}

/** Hábito: registra uma repetição positiva (+) ou negativa (−). Retorna cartas novas. */
export function registrarHabito(id: string, sinal: 'positivo' | 'negativo', data: string = hojeISO()): string[] {
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
    if (sinal === 'positivo') return ganharXP(xpDe(tarefa.dificuldade), tarefa.esfera).novasCartas
    aplicarDano(DANO_HABITO_NEGATIVO)
  }
  return []
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
      const esgotou = hp <= 0
      appStore.set({
        ...appStore.get(),
        personagem: { ...appStore.get().personagem, hp, esgotado: esgotou, ultimoDia: hoje },
      })
      if (esgotou) registrarMorte()
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
    personagem: personagemInicial(),
    configuracao: appStore.get().configuracao,
  })
  // o deck já carregou no boot — re-sorteia as cartas iniciais do baralho zerado
  if (deckCarregado) {
    const iniciais = sortearIniciais(deckCarregado)
    appStore.set({ ...appStore.get(), personagem: { ...appStore.get().personagem, cartas: iniciais } })
  }
}

/* ---------- derivados ---------- */

export const totalTarefas = computed(appStore, (d) => d.tarefas.length)
