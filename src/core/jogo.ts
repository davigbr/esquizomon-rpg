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
