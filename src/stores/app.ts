/** Store global (nanostores) — estado imutável, persistido via subscribe. */

import { atom, computed } from 'nanostores'

import type { Agenda, AppData, Configuracao, Conversa, Dificuldade, EntradaDiario, Personagem, RecompensaConclusao, Tarefa, Tema, TipoLog, TipoTarefa } from '../core/tipos'
import { DANO_HABITO_NEGATIVO, cartasPorNivel, custoInvocacao, danoDe, diaDaSemana, diaDoMes, hojeISO, novoId, personagemInicial, somarDias, xpDe, xpProximoDe, hpMaxDe, manaMaxDe } from '../core/jogo'
import type { Carta } from '../core/baralho'
import { sortearIds, sortearIniciais } from '../core/baralho'
import { MAX_CONVERSAS, MAX_LOG, apagarTudo, carregar, normalizarDados, salvar, salvarTema } from '../db/storage'

export const appStore = atom<AppData>(carregar())

appStore.subscribe((dados) => {
  salvar(dados)
})

/* ---------- helpers ---------- */

/** Registra um evento no histórico (mais recente primeiro, limitado a MAX_LOG). */
export function registrarLog(tipo: TipoLog, texto: string): void {
  const dados = appStore.get()
  const evento = { id: novoId(), ts: new Date().toISOString(), tipo, texto }
  appStore.set({ ...dados, log: [evento, ...dados.log].slice(0, MAX_LOG) })
}

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
  registrarLog('tarefa', `Criou: ${titulo} (${rotuloTipoTarefa(dados.tipo)})`)
  return { ok: true }
}

/** Rótulo pt-BR do tipo de tarefa para o histórico. */
function rotuloTipoTarefa(tipo: TipoTarefa): string {
  switch (tipo) {
    case 'recorrente':
      return 'recorrente'
    case 'unica':
      return 'única'
    case 'habito':
      return 'hábito'
  }
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
  registrarLog('tarefa', `Editou: ${proxima.titulo}`)
  return { ok: true }
}

export function excluirTarefa(id: string): void {
  const tarefa = tarefaPorId(id)
  appStore.set({ ...appStore.get(), tarefas: appStore.get().tarefas.filter((t) => t.id !== id) })
  if (tarefa) registrarLog('tarefa', `Excluiu: ${tarefa.titulo}`)
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
    registrarLog('carta', `Esgotou — perdeu a carta: ${carta?.name ?? perdida}`)
  } else {
    mortePendente = { cartaId: '', cartaNome: '' }
    registrarLog('dano', 'Esgotou — sem cartas para perder')
  }
  registrarLog('dano', 'Ficou esgotado (vida zerada)')
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
    const nomes = cartas.filter((c) => iniciais.includes(c.id)).map((c) => c.name)
    registrarLog('carta', `Começou o jogo com ${iniciais.length} cartas: ${nomes.join(', ')}`)
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
  const nomes = deckCarregado.filter((c) => novos.includes(c.id)).map((c) => c.name)
  registrarLog('carta', `Desbloqueou: ${nomes.join(', ')}`)
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
  if (subiu) registrarLog('nivel', `Subiu para o nível ${nivel} (máximos restaurados)`)
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
  registrarLog('invocacao', `Invocou: ${carta.name} (−${custo} mana)`)
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
    if (tem) {
      // desmarcando: reverte a recompensa daquele dia
      reverterRecompensa(t, data)
      return { ...t, historico: t.historico.filter((d) => d !== data), recompensas: semRecompensa(t.recompensas, data) }
    }
    return { ...t, historico: [...t.historico, data] }
  })
  appStore.set({ ...appStore.get(), tarefas })
  const tarefa = tarefas.find((t) => t.id === id)
  if (tarefa) {
    const marcada = tarefa.historico.includes(data)
    if (marcada) {
      registrarLog('tarefa', `Concluiu recorrente: ${tarefa.titulo} (+${xpDe(tarefa.dificuldade)} XP)`)
      const antes = appStore.get().personagem
      const novas = ganharXP(xpDe(tarefa.dificuldade), tarefa.esfera).novasCartas
      registrarRecompensa(tarefa.id, data, antes, novas)
      return novas
    }
    registrarLog('tarefa', `Desfez recorrente: ${tarefa.titulo} (XP revertido)`)
  }
  return []
}

/** Única: alterna concluída e registra a data (data = dia visível; default hoje). Retorna cartas novas. */
export function alternarUnica(id: string, data: string = hojeISO()): string[] {
  const tarefas = appStore.get().tarefas.map((t) => {
    if (t.id !== id || t.tipo !== 'unica') return t
    const concluida = !t.concluida
    if (!concluida) {
      // desmarcando: reverte a recompensa daquele dia
      reverterRecompensa(t, data)
      return {
        ...t,
        concluida,
        historico: t.historico.filter((d) => d !== data),
        recompensas: semRecompensa(t.recompensas, data),
      }
    }
    return {
      ...t,
      concluida,
      historico: [...new Set([...t.historico, data])],
    }
  })
  appStore.set({ ...appStore.get(), tarefas })
  const tarefa = tarefas.find((t) => t.id === id)
  if (tarefa && tarefa.concluida) {
    registrarLog('tarefa', `Concluiu: ${tarefa.titulo} (+${xpDe(tarefa.dificuldade)} XP)`)
    const antes = appStore.get().personagem
    const novas = ganharXP(xpDe(tarefa.dificuldade), tarefa.esfera).novasCartas
    registrarRecompensa(tarefa.id, data, antes, novas)
    return novas
  }
  if (tarefa) registrarLog('tarefa', `Desfez conclusão: ${tarefa.titulo} (XP revertido)`)
  return []
}

/* ---------- recompensas por conclusão (para reverter ao desmarcar) ---------- */

/** Remove a recompensa de uma data do mapa (retorna undefined se vazio). */
function semRecompensa(rec: Record<string, RecompensaConclusao> | undefined, data: string): Record<string, RecompensaConclusao> | undefined {
  if (!rec || !rec[data]) return rec
  const { [data]: _removida, ...resto } = rec
  return Object.keys(resto).length > 0 ? resto : undefined
}

/** Guarda na tarefa o snapshot da recompensa recém-concedida: estado ANTES do
 *  ganho (restaurado ao desmarcar) + nível PÓS-ganho (guarda de reversão). */
function registrarRecompensa(id: string, data: string, antes: Personagem, cartasNovas: string[]): void {
  const p = appStore.get().personagem
  const tarefas = appStore.get().tarefas.map((t) => {
    if (t.id !== id) return t
    const xp = xpDe(t.dificuldade)
    const recompensa: RecompensaConclusao = {
      xp,
      esfera: t.esfera?.trim() || undefined,
      subiu: p.nivel > antes.nivel,
      nivel: p.nivel,
      xpAntes: antes.xp,
      nivelAntes: antes.nivel,
      xpProximoAntes: antes.xpProximo,
      hpMaxAntes: antes.hpMax,
      manaMaxAntes: antes.manaMax,
      cartas: cartasNovas.length > 0 ? cartasNovas : undefined,
    }
    return { ...t, recompensas: { ...t.recompensas, [data]: recompensa } }
  })
  appStore.set({ ...appStore.get(), tarefas })
}

/** Reverte XP/esfera/nível/cartas de uma conclusão desmarcada. */
function reverterRecompensa(t: Tarefa, data: string): void {
  const r = t.recompensas?.[data]
  if (!r) return
  const p = appStore.get().personagem
  const personagem: Personagem = {
    ...p,
    xp: Math.max(0, p.xp - r.xp),
    esferas: r.esfera
      ? { ...p.esferas, [r.esfera]: Math.max(0, (p.esferas[r.esfera] ?? 0) - r.xp) }
      : p.esferas,
  }
  // rebaixa o nível apenas se ninguém subiu depois (nível atual == nível desta conclusão)
  if (r.subiu && r.nivel !== undefined && p.nivel === r.nivel) {
    // restaura o estado exato anterior ao ganho
    const nivelAntes = r.nivelAntes ?? Math.max(1, p.nivel - 1)
    personagem.nivel = nivelAntes
    personagem.xp = r.xpAntes ?? Math.max(0, p.xp - r.xp)
    personagem.xpProximo = r.xpProximoAntes ?? xpProximoDe(nivelAntes)
    personagem.hpMax = r.hpMaxAntes ?? hpMaxDe(nivelAntes)
    personagem.manaMax = r.manaMaxAntes ?? manaMaxDe(nivelAntes)
    personagem.hp = Math.min(p.hp, personagem.hpMax)
    personagem.mana = Math.min(p.mana, personagem.manaMax)
  }
  // cartas: SEMPRE re-bloqueadas quando esta conclusão as desbloqueou —
  // mesmo que o usuário já tenha subido outro nível depois (o nível não
  // rebaixa nesse caso, mas a carta específica da ação desfeita volta a
  // ficar bloqueada).
  if (r.subiu && r.cartas?.length) {
    const atuais = p.cartas ?? []
    const removidas = new Set(r.cartas)
    personagem.cartas = atuais.filter((c) => !removidas.has(c))
    const inv = { ...(p.invocacoes ?? {}) }
    for (const c of r.cartas) delete inv[c]
    personagem.invocacoes = inv
  }
  appStore.set({ ...appStore.get(), personagem })
  registrarLog('tarefa', `Recompensa revertida (−${r.xp} XP)`)
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
    if (sinal === 'positivo') {
      registrarLog('habito', `Hábito positivo: ${tarefa.titulo} (+${xpDe(tarefa.dificuldade)} XP)`)
      return ganharXP(xpDe(tarefa.dificuldade), tarefa.esfera).novasCartas
    }
    aplicarDano(DANO_HABITO_NEGATIVO)
    registrarLog('habito', `Hábito negativo: ${tarefa.titulo} (−${DANO_HABITO_NEGATIVO} vida)`)
  }
  return []
}

/** Pendências de ontem aguardando decisão do check-in (modal estilo Habitica). */
export let checkinPendente: { data: string; ids: string[] } | null = null

/** Marca o dia processado e regenera mana (fim do ciclo diário). */
function finalizarDia(hoje: string): void {
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

/** Aplica o dano diário das recorrentes perdidas (não marcadas no check-in).
 *  Únicas vencidas NUNCA dão dano diário — só recorrentes. */
function aplicarDanoDiario(ids: string[]): void {
  if (ids.length === 0) return
  const dados = appStore.get()
  if (dados.configuracao.modoRelaxado || dados.personagem.esgotado) return
  const perdidas = ids
    .map((id) => dados.tarefas.find((x) => x.id === id))
    .filter((t): t is Tarefa => !!t && t.tipo === 'recorrente')
  if (perdidas.length === 0) return
  const danoTotal = perdidas.reduce((soma, t) => soma + danoDe(t.dificuldade), 0)
  if (danoTotal <= 0) return
  const p = dados.personagem
  const hp = Math.max(0, p.hp - danoTotal)
  const esgotou = hp <= 0
  appStore.set({
    ...appStore.get(),
    personagem: { ...appStore.get().personagem, hp, esgotado: esgotou },
  })
  registrarLog('dano', `Dano diário: ${perdidas.length} recorrente(s) perdida(s) (−${danoTotal} vida)`)
  if (esgotou) registrarMorte()
}

/** Reset diário (uma vez por dia). Se há tarefas de ontem pendentes, NÃO cobra
 *  dano ainda — deixa pendente o check-in (modal estilo Habitica) para o
 *  usuário decidir quais quer marcar retroativamente. */
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

  const p = appStore.get().personagem
  const primeiraVez = p.ultimoDia === ''

  // 2. pendencias de ontem: recorrentes válidas não concluídas + únicas vencidas ontem
  const pendentes = dados.tarefas.filter((t) => {
    if (t.tipo === 'recorrente' && valeNaData(t, diaOntem, diaMesOntem) && !t.historico.includes(ontem)) return true
    if (t.tipo === 'unica' && t.dueDate === ontem && !t.concluida) return true
    return false
  })

  if (!primeiraVez && !p.esgotado && !dados.configuracao.modoRelaxado && pendentes.length > 0) {
    // deixa o check-in decidir — sem dano por enquanto
    checkinPendente = { data: ontem, ids: pendentes.map((t) => t.id) }
    return
  }

  // 3. sem pendentes (ou primeira vez/relaxado): cobra dano das não feitas (nenhuma) e finaliza
  const perdidas = pendentes.filter((t) => t.tipo === 'recorrente').map((t) => t.id)
  if (!primeiraVez && !p.esgotado && !dados.configuracao.modoRelaxado) {
    aplicarDanoDiario(perdidas)
  }
  finalizarDia(hoje)
}

/** Check-in: marca em ONTEM as tarefas selecionadas (XP retroativo) e aplica o
 *  dano apenas nas recorrentes que ficaram sem marcação. */
export function concluirCheckin(idsMarcados: string[]): void {
  const pend = checkinPendente
  if (!pend) return
  checkinPendente = null
  const hoje = hojeISO()
  const marcadosSet = new Set(idsMarcados)

  // marca as selecionadas em ONTEM
  const tarefas = appStore.get().tarefas.map((t) => {
    if (!marcadosSet.has(t.id)) return t
    if (t.tipo === 'unica') {
      return { ...t, concluida: true, historico: [...new Set([...t.historico, pend.data])] }
    }
    if (t.tipo === 'recorrente' && !t.historico.includes(pend.data)) {
      return { ...t, historico: [...t.historico, pend.data] }
    }
    return t
  })
  appStore.set({ ...appStore.get(), tarefas })

  // XP retroativo das marcadas
  for (const id of idsMarcados) {
    const t = appStore.get().tarefas.find((x) => x.id === id)
    if (!t) continue
    registrarLog('tarefa', `Check-in: ${t.titulo} concluída em ${pend.data} (+${xpDe(t.dificuldade)} XP)`)
    const antes = appStore.get().personagem
    const novas = ganharXP(xpDe(t.dificuldade), t.esfera).novasCartas
    registrarRecompensa(t.id, pend.data, antes, novas)
  }

  // dano das recorrentes pendentes NÃO marcadas
  const danoIds = pend.ids.filter((id) => !marcadosSet.has(id))
  aplicarDanoDiario(danoIds)
  finalizarDia(hoje)
}

/** Check-in pulado: tudo o que ficou pendente ontem conta como perdido. */
export function pularCheckin(): void {
  const pend = checkinPendente
  if (!pend) return
  checkinPendente = null
  aplicarDanoDiario(pend.ids)
  finalizarDia(hojeISO())
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

/* ---------- conversas (chat com a IA) ---------- */

function conversasAtuais(): Conversa[] {
  return appStore.get().conversas ?? []
}

function salvarConversas(conversas: Conversa[]): void {
  appStore.set({ ...appStore.get(), conversas })
}

export function criarConversa(): Conversa {
  const id = novoId()
  const agora = new Date().toISOString()
  const conversa: Conversa = { id, titulo: 'Nova conversa', mensagens: [], atualizadaEm: agora }
  salvarConversas([conversa, ...conversasAtuais()].slice(0, MAX_CONVERSAS))
  return conversa
}

export function conversaPorId(id: string): Conversa | undefined {
  return conversasAtuais().find((c) => c.id === id)
}

export function atualizarConversa(id: string, patch: Partial<Conversa>): void {
  const conversas = conversasAtuais()
  const idx = conversas.findIndex((c) => c.id === id)
  if (idx < 0) return
  const atualizada: Conversa = { ...conversas[idx], ...patch, atualizadaEm: new Date().toISOString() }
  const proximas = [...conversas]
  proximas.splice(idx, 1)
  // Re-ordena: mais recente no topo.
  salvarConversas([atualizada, ...proximas].slice(0, MAX_CONVERSAS))
}

export function adicionarMensagem(conversaId: string, msg: import('../core/tipos').MensagemIA): void {
  const conversa = conversaPorId(conversaId)
  if (!conversa) return
  const mensagens = [...conversa.mensagens, msg]
  // Primeira mensagem do usuário vira o título (3-5 palavras).
  let titulo = conversa.titulo
  if (conversa.mensagens.length === 0 && msg.role === 'user') {
    titulo = msg.content
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 5)
      .join(' ')
      .slice(0, 60)
    if (!titulo) titulo = 'Conversa'
  }
  atualizarConversa(conversaId, { titulo, mensagens })
}

export function excluirConversa(id: string): void {
  salvarConversas(conversasAtuais().filter((c) => c.id !== id))
}

/* ---------- diário (1 entrada por dia) ---------- */

export function diarioAtual(): EntradaDiario[] {
  return appStore.get().diario ?? []
}

function salvarDiario(diario: EntradaDiario[]): void {
  appStore.set({ ...appStore.get(), diario })
}

/** Busca a entrada de uma data específica (YYYY-MM-DD). Retorna undefined se não houver. */
export function entradaDoDia(data: string): EntradaDiario | undefined {
  return diarioAtual().find((e) => e.data === data)
}

/** Cria ou atualiza a entrada de uma data (idempotente na data — 1/dia). */
export function salvarEntrada(data: string, campos: { titulo?: string; texto: string }): EntradaDiario {
  const atual = entradaDoDia(data)
  if (atual) {
    const patch: Partial<EntradaDiario> = {
      texto: campos.texto,
      editadaEm: new Date().toISOString(),
    }
    if (campos.titulo !== undefined) patch.titulo = campos.titulo
    const atualizada: EntradaDiario = { ...atual, ...patch }
    salvarDiario(diarioAtual().map((e) => (e.id === atual.id ? atualizada : e)))
    return atualizada
  }
  const nova: EntradaDiario = {
    id: novoId(),
    data,
    titulo: campos.titulo ?? '',
    texto: campos.texto,
    criadaEm: new Date().toISOString(),
  }
  salvarDiario([nova, ...diarioAtual()])
  return nova
}

export function excluirEntrada(id: string): void {
  salvarDiario(diarioAtual().filter((e) => e.id !== id))
}

/** Move uma entrada para outra data (respeitando 1/dia). Retorna resultado. */
export function moverEntrada(id: string, novaData: string): Resultado {
  const entrada = diarioAtual().find((e) => e.id === id)
  if (!entrada) return { ok: false, motivo: 'Entrada não encontrada.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) return { ok: false, motivo: 'Data inválida.' }
  if (entrada.data === novaData) return { ok: true }
  const conflito = diarioAtual().find((e) => e.data === novaData && e.id !== id)
  if (conflito) return { ok: false, motivo: `Já existe uma crônica em ${novaData}.` }
  const movida: EntradaDiario = { ...entrada, data: novaData, editadaEm: new Date().toISOString() }
  salvarDiario(diarioAtual().map((e) => (e.id === id ? movida : e)))
  return { ok: true }
}

/* ---------- tools da IA (acessadas pelo chat) ---------- */

/** Lista entradas do diário em ordem decrescente. Usado pelo system prompt e pela tool. */
export function listarDiario(opts?: { limite?: number; desde?: string; ate?: string }): EntradaDiario[] {
  let lista = diarioAtual()
  if (opts?.desde) lista = lista.filter((e) => e.data >= opts.desde!)
  if (opts?.ate) lista = lista.filter((e) => e.data <= opts.ate!)
  const limite = opts?.limite ?? lista.length
  return lista.slice(0, limite)
}

/** Busca entradas por palavras-chave (case-insensitive, no titulo OU texto). */
export function buscarDiario(termo: string, limite = 5): EntradaDiario[] {
  const t = termo.trim().toLowerCase()
  if (!t) return []
  return diarioAtual()
    .filter((e) => e.titulo.toLowerCase().includes(t) || e.texto.toLowerCase().includes(t))
    .slice(0, limite)
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

/* ---------- derivados ---------- */

export const totalTarefas = computed(appStore, (d) => d.tarefas.length)
