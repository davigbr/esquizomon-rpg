/** Constantes de jogo — dificuldade, multiplicadores (referência Habitica) e datas. */

import type { Dificuldade } from './tipos'

export const DIFICULDADES: ReadonlyArray<{
  id: Dificuldade
  rotulo: string
  multiplicador: number
}> = [
  { id: 'facil', rotulo: 'Fácil', multiplicador: 1 },
  { id: 'media', rotulo: 'Média', multiplicador: 1.5 },
  { id: 'dificil', rotulo: 'Difícil', multiplicador: 2 },
  { id: 'extrema', rotulo: 'Extrema', multiplicador: 2.5 },
]

export function dificuldadeDe(id: Dificuldade) {
  return DIFICULDADES.find((d) => d.id === id) ?? DIFICULDADES[1]
}

/** XP concedido por conclusão, conforme a dificuldade (base 10 × multiplicador). */
export function xpDe(dificuldade: Dificuldade): number {
  return Math.round(10 * dificuldadeDe(dificuldade).multiplicador)
}

/** Dano causado por uma recorrente perdida no reset diário, conforme a dificuldade. */
export function danoDe(dificuldade: Dificuldade): number {
  switch (dificuldade) {
    case 'facil':
      return 3
    case 'media':
      return 5
    case 'dificil':
      return 8
    case 'extrema':
      return 12
  }
}

/** Dano de repetição negativa de hábito = MESMA escala do dano diário
 *  (`danoDe(dificuldade)`: 3/5/8/12) — decisão 2026-08-12 (usuário:
 *  "hábitos negativos devem tirar mais vida" + "aplique o multiplicador no
 *  dano do hábito também"). A constante fixa DANO_HABITO_NEGATIVO foi
 *  REMOVIDA — chamadores usam `danoDe(tarefa.dificuldade)`. */

/** XP automático por carta citada no diário (a Fábula anota, o app recompensa). */
export const XP_POR_CARTA_CITADA = 5
/** Máximo de cartas recompensadas por entrada do diário. */
export const MAX_CARTAS_RECOMPENSADAS_POR_ENTRADA = 2

/** XP necessário para subir do nível atual (curva suave: nível n exige n×80). */
export function xpProximoDe(nivel: number): number {
  return Math.max(80, nivel * 80)
}

/** HP máximo por nível: 50 + 5 por nível acima do 1º. */
export function hpMaxDe(nivel: number): number {
  return 50 + (nivel - 1) * 5
}

/** Mana máximo por nível: 20 + 2 por nível acima do 1º. */
export function manaMaxDe(nivel: number): number {
  return 20 + (nivel - 1) * 2
}

/* ---------- baralho: desbloqueio e invocação ---------- */

/** Cartas desbloqueadas no início: ~10% de 65 = 7. */
export const CARTAS_INICIAIS = 7

/** Cartas desbloqueadas a cada nível acima do 1º (1 por nível → completo no nível 59). */
export function cartasPorNivel(): number {
  return 1
}

/** Nível em que o baralho fica completo (65 cartas, 7 iniciais + 1/nível). */
export function nivelBaralhoCompleto(): number {
  return 1 + Math.ceil((65 - CARTAS_INICIAIS) / cartasPorNivel())
}

/** Custo base de invocação por tipo de carta (monstro < captura < aliança).
 *  Aumentado 2026-08-12 (2× — decisão do usuário): invocar agora é escolha
 *  rara e significativa, não rotina diária. */
export function custoBaseInvocacao(tipo: 'monstro' | 'captura' | 'alianca'): number {
  switch (tipo) {
    case 'monstro':
      return 4
    case 'captura':
      return 8
    case 'alianca':
      return 12
  }
}

/** Incremento de custo por invocação repetida da mesma carta. */
export function incrementoInvocacao(tipo: 'monstro' | 'captura' | 'alianca'): number {
  switch (tipo) {
    case 'monstro':
      return 2
    case 'captura':
      return 4
    case 'alianca':
      return 6
  }
}

/** Teto de invocações que encarecem (a partir daí o custo fica estável). */
export const TETO_INVOCACOES = 3

/** Custo atual de invocar uma carta, dado quantas vezes ela já foi invocada.
 *  Ex.: monstro 4→6→8→10; captura 8→12→16→20; aliança 12→18→24→30. */
export function custoInvocacao(tipo: 'monstro' | 'captura' | 'alianca', invocacoes: number): number {
  const extras = Math.min(invocacoes, TETO_INVOCACOES)
  return custoBaseInvocacao(tipo) + extras * incrementoInvocacao(tipo)
}

/** Custo premium quando a FÁBULA escolhe a carta (comando /invocar sem nome,
 *  2026-08-12): ×1,5 do custo normal, arredondado pra cima. */
export function custoInvocacaoFabula(tipo: 'monstro' | 'captura' | 'alianca', invocacoes: number): number {
  return Math.ceil(custoInvocacao(tipo, invocacoes) * 1.5)
}

/** Custo da análise esquizoanalítica da Fábula (comando /analisar). */
export const CUSTO_ANALISE = 10

/** Personagem inicial (nível 1, 7 cartas sorteadas). */
export function personagemInicial(cartasIniciais: string[] = []) {
  return {
    nivel: 1,
    xp: 0,
    xpProximo: xpProximoDe(1),
    hp: hpMaxDe(1),
    hpMax: hpMaxDe(1),
    mana: manaMaxDe(1),
    manaMax: manaMaxDe(1),
    esgotado: false,
    ultimoDia: '',
    cartas: cartasIniciais,
    invocacoes: {},
  }
}

export const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

/** Data local em ISO (YYYY-MM-DD) — nunca toISOString (vira UTC e pode trocar o dia). */
export function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Data ISO por extenso em pt-BR (sem o dia da semana), ex.: "3 de agosto de 2026". */
export function dataPorExtenso(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Nome do dia da semana por extenso (capitalizado), ex.: "Segunda-feira". */
export function diaSemanaPorExtenso(iso: string): string {
  const nome = new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

/** Soma dias a uma data ISO (aceita negativos). */
export function somarDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function diaDaSemana(d: Date = new Date()): number {
  return d.getDay()
}

export function diaDoMes(d: Date = new Date()): number {
  return d.getDate()
}

/** Dias (inteiros) até uma data futura; negativo = já venceu. */
export function diasAte(dataISO: string, hoje = hojeISO()): number {
  const a = new Date(hoje + 'T12:00:00')
  const b = new Date(dataISO + 'T12:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/** Dias desde uma data (aceita ISO completo ou só a data). */
export function diasDesde(data: string, hoje = new Date()): number {
  const d = new Date(data)
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const inicioCriacao = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.floor((inicioHoje.getTime() - inicioCriacao.getTime()) / 86_400_000)
}

/** Streak de dias consecutivos com repetição positiva, terminando em hoje ou ontem. */
export function calcularStreak(historico: string[], hoje = hojeISO()): number {
  if (historico.length === 0) return 0
  const dias = new Set(historico)
  const umDiaAtras = (iso: string): string => {
    const d = new Date(iso + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  let cursor = dias.has(hoje) ? hoje : umDiaAtras(hoje)
  let streak = 0
  while (dias.has(cursor)) {
    streak++
    cursor = umDiaAtras(cursor)
  }
  return streak
}

/** Um id curto e legível para tarefas novas. */
export function novoId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
