/** Daily cycle domain: day renewal and check-in (Habitica style). */

import type { Task } from '../core/tipos'
import { damageFor, dayOfWeek, dayOfMonth, todayISO, HP_REGEN_PER_DAY, addDays, xpFor } from '../core/jogo'
import { appStore, addLog } from './base'
import { applyDamage, gainXP } from './personagem'
import { storeReward } from './tasks'
import { playSound } from '../ui/audio'

/** Yesterday's outstanding items awaiting the check-in decision (Habitica-style modal). */
export let pendingCheckin: { date: string; ids: string[] } | null = null

/** Marks the day processed and regenerates mana (end of the daily cycle). */
function finishDay(today: string): void {
  const current = appStore.get().character
  appStore.set({
    ...appStore.get(),
    character: {
      ...current,
      lastDay: today,
      // SLOW HP regeneration: +5% of hpMax per day (min 1)
      hp: Math.min(current.hpMax, current.hp + Math.max(1, Math.round(current.hpMax * HP_REGEN_PER_DAY))),
      mana: !current.exhausted ? current.manaMax : current.mana,
    },
  })
}

/** Applies daily damage from missed recurring tasks (unmarked in check-in).
 *  Expired one-offs NEVER deal daily damage — only recurring ones. */
function applyDailyDamage(ids: string[]): void {
  if (ids.length === 0) return
  const data = appStore.get()
  if (data.settings.relaxedMode || data.character.exhausted) return
  const missed = ids
    .map((id) => data.tasks.find((x) => x.id === id))
    .filter((t): t is Task => !!t && t.type === 'recorrente')
  if (missed.length === 0) return
  const totalDamage = missed.reduce((sum, t) => sum + damageFor(t.difficulty), 0)
  applyDamage(totalDamage)
  addLog('dano', `Dano diário: ${missed.length} recorrente(s) perdida(s) (−${totalDamage} vida)`)
}

/** Daily reset (once per day). If there are outstanding tasks from yesterday,
 *  it does NOT charge damage yet — it leaves the check-in pending
 *  (Habitica-style modal) for the user to decide which to mark retroactively. */
export function renewDay(): void {
  const data = appStore.get()
  const today = todayISO()
  if (data.character.lastDay === today) return

  const yesterday = addDays(today, -1)
  const dayYesterday = dayOfWeek(new Date(yesterday + 'T12:00:00'))
  const dayOfMonthYesterday = dayOfMonth(new Date(yesterday + 'T12:00:00'))

  // 1. zeros the "today" counter of habits (positive and negative)
  const tasks = data.tasks.map((t) => {
    if (t.type !== 'habito') return t
    const counter = t.counter ?? { today: 0, todayNeg: 0, totalPositive: 0, totalNegative: 0 }
    const needsReset = (counter.today > 0 || counter.todayNeg > 0) && !t.history.includes(today)
    return needsReset ? { ...t, counter: { ...counter, today: 0, todayNeg: 0 } } : t
  })
  appStore.set({ ...data, tasks })

  const p = appStore.get().character
  const firstTime = p.lastDay === ''

  // 2. yesterday's outstanding: valid recurring not completed + one-offs due yesterday
  const pending = data.tasks.filter((t) => {
    if (t.type === 'recorrente' && appliesOnDate(t, dayYesterday, dayOfMonthYesterday) && !t.history.includes(yesterday)) return true
    if (t.type === 'unica' && t.dueDate === yesterday && !t.done) return true
    return false
  })

  if (!firstTime && !p.exhausted && !data.settings.relaxedMode && pending.length > 0) {
    // lets the check-in decide — no damage for now
    pendingCheckin = { date: yesterday, ids: pending.map((t) => t.id) }
    return
  }

  // 3. without outstanding (or first time/relaxed): charges damage from the undone (none) and finishes
  const missed = pending.filter((t) => t.type === 'recorrente').map((t) => t.id)
  if (!firstTime && !p.exhausted && !data.settings.relaxedMode) {
    applyDailyDamage(missed)
  }
  finishDay(today)
}

/** Finishes the day WITHOUT damage and clears a pending check-in — used when
 *  the outstanding tasks were already completed for the check-in date (e.g.
 *  on another device and merged), so the window doesn't open and the day
 *  settles (lastDay advances, mana/HP regenerate normally). */
export function settleAllDone(): void {
  pendingCheckin = null
  finishDay(todayISO())
}

/** Check-in: marks the selected tasks in YESTERDAY (retroactive XP) and applies
 *  damage only to the recurring ones left unmarked. */
export function finishCheckin(markedIds: string[]): void {
  const pending = pendingCheckin
  if (!pending) return
  pendingCheckin = null
  const today = todayISO()
  const markedSet = new Set(markedIds)

  // marks the selected ones in YESTERDAY
  const tasks = appStore.get().tasks.map((t) => {
    if (!markedSet.has(t.id)) return t
    if (t.type === 'unica') {
      return { ...t, done: true, history: [...new Set([...t.history, pending.date])] }
    }
    if (t.type === 'recorrente' && !t.history.includes(pending.date)) {
      return { ...t, history: [...t.history, pending.date] }
    }
    return t
  })
  appStore.set({ ...appStore.get(), tasks })

  // retroactive XP of the marked ones
  for (const id of markedIds) {
    const t = appStore.get().tasks.find((x) => x.id === id)
    if (!t) continue
    addLog('tarefa', `Check-in: ${t.title} concluída em ${pending.date} (+${xpFor(t.difficulty)} XP)`)
    const before = appStore.get().character
    const added = gainXP(xpFor(t.difficulty)).newCards
    storeReward(t.id, pending.date, before, added)
  }
  if (markedIds.length > 0) playSound('tarefa')

  // damage of pending recurring ones NOT marked
  const damageIds = pending.ids.filter((id) => !markedSet.has(id))
  applyDailyDamage(damageIds)
  finishDay(today)
}

function appliesOnDate(t: Task, day: number, dayOfMonth: number): boolean {
  if (t.agenda?.daysOfMonth && t.agenda.daysOfMonth.length > 0) return t.agenda.daysOfMonth.includes(dayOfMonth)
  return !t.agenda || t.agenda.days.length === 0 || t.agenda.days.includes(day)
}
