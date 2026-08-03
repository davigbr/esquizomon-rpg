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

/** Dano de uma repetição negativa de hábito. */
export const DANO_HABITO_NEGATIVO = 2

/** XP necessário para subir do nível atual (curva suave: nível n exige n×100). */
export function xpProximoDe(nivel: number): number {
  return Math.max(100, nivel * 100)
}

/** HP máximo por nível: 50 + 5 por nível acima do 1º. */
export function hpMaxDe(nivel: number): number {
  return 50 + (nivel - 1) * 5
}

/** Mana máximo por nível: 20 + 2 por nível acima do 1º. */
export function manaMaxDe(nivel: number): number {
  return 20 + (nivel - 1) * 2
}

/** Personagem inicial (nível 1). */
export function personagemInicial() {
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
    esferas: {},
  }
}

export const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

/** Data local em ISO (YYYY-MM-DD) — nunca toISOString (vira UTC e pode trocar o dia). */
export function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Hoje por extenso em pt-BR, ex.: "segunda-feira, 3 de agosto". */
export function hojePorExtenso(): string {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
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
