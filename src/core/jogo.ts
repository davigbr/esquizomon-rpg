/** Game constants — difficulty, multipliers (Habitica reference) and dates. */

import type { Agenda, Difficulty, Task, XpSpeed } from './tipos'
import { t, LOCALE, getLang } from '../i18n'

export const DIFFICULTIES: ReadonlyArray<{
  id: Difficulty
  multiplier: number
}> = [
  { id: 'facil', multiplier: 1 },
  { id: 'media', multiplier: 1.5 },
  { id: 'dificil', multiplier: 2 },
  { id: 'extrema', multiplier: 2.5 },
]

export function difficultyMeta(id: Difficulty) {
  const d = DIFFICULTIES.find((x) => x.id === id) ?? DIFFICULTIES[1]
  return { ...d, label: t(`diff.${d.id}`) }
}

/** DIFFICULTY-based base XP: 10 per unit of multiplier. */
export function xpFor(difficulty: Difficulty): number {
  return Math.round(10 * difficultyMeta(difficulty).multiplier)
}

/** Multiplier of the XP progression speed (settings). 'normal'/undefined = 1. */
export function xpSpeedMultiplier(speed: XpSpeed | undefined): number {
  if (speed === 'slow') return 0.5
  if (speed === 'fast') return 2
  return 1
}

/** Applies the progression speed to a RAW xp amount. ALWAYS rounds down, so
 *  Slow never inflates by rounding (÷2 of 5 = 2). Only XP gains go through
 *  here — habit DAMAGE and HP are out of scope (decision 2026-10-01). */
export function scaleXp(raw: number, speed: XpSpeed | undefined): number {
  return Math.floor(raw * xpSpeedMultiplier(speed))
}

/** Damage dealt by a recurring task missed at reset, by difficulty. */
export function damageFor(difficulty: Difficulty): number {
  switch (difficulty) {
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

/** Damage of a negative habit repetition = SAME scale as daily damage
 *  (`damageFor(difficulty)`: 3/5/8/12) — decision 2026-08-12 (user:
 *  "negative habits should take more HP" + "apply the multiplier to habit
 *  damage too"). The fixed constant DANO_HABITO_NEGATIVO was REMOVED —
 *  callers use `damageFor(task.difficulty)`. */

/** XP for logging the diary — PER RECORD (each note and each chronicle; many
 *  per day). Re-saving the SAME record doesn't yield again. */
export const XP_PER_LOG = 5

/** HP regeneration per day — fraction of hpMax (slow, 5%). */
export const HP_REGEN_PER_DAY = 0.05

/** HP recovered per positive habit marked. */
export const HP_PER_POSITIVE_HABIT = 1

/** XP needed to go up from the current level (smooth curve: level n needs n×80). */
export function xpNextFor(level: number): number {
  return Math.max(80, level * 80)
}

/** Max HP per level: 50 + 5 per level above the 1st. */
export function hpMaxFor(level: number): number {
  return 50 + (level - 1) * 5
}

/** Max mana per level: 20 + 2 per level above the 1st. */
export function manaMaxFor(level: number): number {
  return 20 + (level - 1) * 2
}

/* ---------- deck: unlocking and invocation ---------- */

/** Cards unlocked at start: ~10% of 65 = 7. */
export const INITIAL_CARDS = 7

/** Cards unlocked per level above the 1st (1 per level → complete at level 59). */
export function cardsPerLevel(): number {
  return 1
}

/** Level at which the deck is complete (65 cards, 7 initial + 1/level). */
export function fullDeckLevel(): number {
  return 1 + Math.ceil((65 - INITIAL_CARDS) / cardsPerLevel())
}

/** Base invocation cost per card kind (monster < capture < alliance).
 *  Increased 2026-08-12 (2× — user decision): invoking is now a rare and
 *  meaningful choice, not a daily routine. */
export function baseInvocationCost(kind: 'monstro' | 'captura' | 'alianca'): number {
  switch (kind) {
    case 'monstro':
      return 4
    case 'captura':
      return 8
    case 'alianca':
      return 12
  }
}

/** Cost increment per repeated invocation of the same card. */
export function invocationIncrement(kind: 'monstro' | 'captura' | 'alianca'): number {
  switch (kind) {
    case 'monstro':
      return 2
    case 'captura':
      return 4
    case 'alianca':
      return 6
  }
}

/** Cap of invocations that get more expensive (beyond it the cost stays stable). */
export const INVOCATION_CAP = 3

/** Current cost of invoking a card, given how many times it was already invoked.
 *  E.g. monster 4→6→8→10; capture 8→12→16→20; alliance 12→18→24→30. */
export function invocationCost(kind: 'monstro' | 'captura' | 'alianca', invocations: number): number {
  const extras = Math.min(invocations, INVOCATION_CAP)
  return baseInvocationCost(kind) + extras * invocationIncrement(kind)
}

/** Premium cost when the FABLE picks the card (command /invocar without a name,
 *  2026-08-12): ×1.5 of the normal cost, rounded up. */
export function fableInvocationCost(kind: 'monstro' | 'captura' | 'alianca', invocations: number): number {
  return Math.ceil(invocationCost(kind, invocations) * 1.5)
}

/** Cost of the Fable's schizoanalytic analysis (command /analisar). */
export const ANALYZE_COST = 10

/** Cost of the captures sweep (command /capturas) — EXPENSIVE: reads the
 *  everyday life with the unlocked capture cards. */
export const CAPTURES_COST = 25

/** Initial character (level 1, 7 drawn cards). */
export function initialCharacter(initialCards: string[] = []) {
  return {
    level: 1,
    xp: 0,
    xpNext: xpNextFor(1),
    hp: hpMaxFor(1),
    hpMax: hpMaxFor(1),
    mana: manaMaxFor(1),
    manaMax: manaMaxFor(1),
    exhausted: false,
    lastDay: '',
    cards: initialCards,
    invocations: {},
  }
}

export const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

/** Local date in ISO (YYYY-MM-DD) — never toISOString (it becomes UTC and can change the day). */
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** ISO date spelled out in the active locale, e.g. "3 de agosto de 2026" / "August 3, 2026". */
export function formatLongDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString(LOCALE[getLang()], { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Weekday name spelled out (capitalized), e.g. "Segunda-feira" / "Monday". */
export function formatWeekday(iso: string): string {
  const name = new Date(iso + 'T12:00:00').toLocaleDateString(LOCALE[getLang()], { weekday: 'long' })
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Adds days to an ISO date (accepts negatives). */
export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dayOfWeek(d: Date = new Date()): number {
  return d.getDay()
}

export function dayOfMonth(d: Date = new Date()): number {
  return d.getDate()
}

/* ---------- recurring-task schedule + deferral (2026-09-14) ---------- */

/** True if a weekly/monthly agenda applies on a given ISO date. `daysOfMonth`
 *  (monthly) wins over `days` (weekly); empty agenda = every day. */
export function agendaApplies(agenda: Agenda | undefined, iso: string): boolean {
  if (agenda?.daysOfMonth && agenda.daysOfMonth.length > 0) return agenda.daysOfMonth.includes(dayOfMonth(new Date(iso + 'T12:00:00')))
  if (!agenda || agenda.days.length === 0) return true
  return agenda.days.includes(dayOfWeek(new Date(iso + 'T12:00:00')))
}

/** Daily recurring = empty agenda (applies every day). Weekly/monthly have a
 *  non-empty schedule and defer when missed (see recurrenceDue). */
export function isDailyRecurring(t: Task): boolean {
  return !t.agenda || (t.agenda.days.length === 0 && !t.agenda.daysOfMonth?.length)
}

/** Most recent scheduled date ≤ `iso` for a weekly/monthly task (or `iso` itself
 *  when it IS scheduled). Ignores dates before `createdAt` — a freshly created
 *  task never defers before its first scheduled day. Null if there is none. */
export function lastScheduledOnOrBefore(t: Task, iso: string): string | null {
  const created = (t.createdAt || iso).slice(0, 10)
  let cur = iso
  // bounded walk: a weekly gap ≤ 6 days; a monthly gap ≤ ~31 (day 31 in a
  // shorter month jumps to the previous valid one). 62 is comfortably enough.
  for (let i = 0; i < 62; i++) {
    if (cur < created) return null
    if (agendaApplies(t.agenda, cur)) return cur
    cur = addDays(cur, -1)
  }
  return null
}

/** Weekly/monthly deferral: the current occurrence shows (pending, possibly
 *  overdue) on EVERY day from its scheduled date until it's completed. Once
 *  completed it stops until the next scheduled date. A task completed ON `iso`
 *  still shows that day (as done), so the checkbox isn't a flicker. Daily tasks
 *  keep their current always-visible behavior. Never returns "two copies": one
 *  task = one card (single row in data.tasks). */
export function recurrenceDue(t: Task, iso: string): boolean {
  if (isDailyRecurring(t)) return true
  if (t.history.includes(iso)) return true // completed on this day → show as done
  const S = lastScheduledOnOrBefore(t, iso)
  if (!S) return false
  // the occurrence for S is still open iff no completion happened in [S, iso]
  return !t.history.some((h) => h >= S && h <= iso)
}

/** True when the task is shown-but-PENDING (not completed today) and its
 *  scheduled day already passed — i.e. it's overdue/deferred, worth a cue. */
export function recurrenceOverdue(t: Task, iso: string): boolean {
  if (isDailyRecurring(t) || t.history.includes(iso)) return false
  const S = lastScheduledOnOrBefore(t, iso)
  return !!S && S < iso
}

/** Days (integer) until a future date; negative = already due. */
export function daysUntil(dateISO: string, today = todayISO()): number {
  const a = new Date(today + 'T12:00:00')
  const b = new Date(dateISO + 'T12:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/** Days since a date (accepts full ISO or date only). */
export function daysSince(date: string, today = new Date()): number {
  const d = new Date(date)
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startCreated = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.floor((startToday.getTime() - startCreated.getTime()) / 86_400_000)
}

/** Streak of consecutive days with positive repetition, ending today or yesterday. */
export function calcStreak(history: string[], today = todayISO()): number {
  if (history.length === 0) return 0
  const days = new Set(history)
  const oneDayAgo = (iso: string): string => {
    const d = new Date(iso + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  let cursor = days.has(today) ? today : oneDayAgo(today)
  let streak = 0
  while (days.has(cursor)) {
    streak++
    cursor = oneDayAgo(cursor)
  }
  return streak
}

/** A short, readable id for new tasks. */
export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
