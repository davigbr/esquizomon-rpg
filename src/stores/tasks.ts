/** Task domain: CRUD, toggling (XP/rewards) and habits. */

import type { AppData, Character, CompletionReward, Task, TaskType } from '../core/tipos'
import { damageFor, todayISO, newId, xpFor } from '../core/jogo'
import { HP_PER_POSITIVE_HABIT } from '../core/jogo'
import { xpNextFor, hpMaxFor, manaMaxFor } from '../core/jogo'
import { appStore, addLog, taskById } from './base'
import type { TaskInput, Result } from './base'
import { playSound } from '../ui/audio'
import { notify } from '../ui/toast'
import { applyDamage, heal, gainXP } from './personagem'

export function tagsInUse(data: AppData): string[] {
  const set = new Set<string>()
  for (const t of data.tasks) for (const tag of t.tags) set.add(tag)
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function createTask(input: TaskInput): Result {
  const title = input.title.trim()
  if (!title) return { ok: false, reason: 'Dê um nome para a tarefa.' }
  const task: Task = {
    id: newId(),
    type: input.type,
    title,
    difficulty: input.difficulty,
    tags: input.tags,
    notes: input.notes?.trim() || undefined,
    dueDate: input.type === 'unica' ? input.dueDate : undefined,
    agenda: input.type === 'recorrente' ? { days: input.agenda?.days ?? [], daysOfMonth: input.agenda?.daysOfMonth } : undefined,
    sign: input.type === 'habito' ? input.sign ?? 'positivo' : undefined,
    counter:
      input.type === 'habito'
        ? { today: 0, todayNeg: 0, totalPositive: 0, totalNegative: 0 }
        : undefined,
    done: false,
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  // new task enters at the TOP of the list (most recent above) — 2026-08-17
  appStore.set({ ...appStore.get(), tasks: [task, ...appStore.get().tasks] })
  addLog('tarefa', `Criou: ${title} (${taskTypeLabel(input.type)})`)
  return { ok: true }
}

/** pt-BR label of the task type for the history. */
function taskTypeLabel(type: TaskType): string {
  switch (type) {
    case 'recorrente':
      return 'recorrente'
    case 'unica':
      return 'única'
    case 'habito':
      return 'hábito'
  }
}

export function updateTask(id: string, input: Partial<TaskInput>): Result {
  const current = taskById(id)
  if (!current) return { ok: false, reason: 'Tarefa não encontrada.' }
  const title = input.title?.trim()
  if (title !== undefined && !title) return { ok: false, reason: 'Dê um nome para a tarefa.' }

  const next: Task = {
    ...current,
    updatedAt: new Date().toISOString(),
    title: title ?? current.title,
    difficulty: input.difficulty ?? current.difficulty,
    tags: input.tags ?? current.tags,
    notes: input.notes?.trim() || undefined,
    dueDate: input.dueDate !== undefined ? input.dueDate : current.dueDate,
  }
  if (input.type) {
    next.type = input.type
    if (input.type === 'recorrente') {
      next.agenda = { days: input.agenda?.days ?? [], daysOfMonth: input.agenda?.daysOfMonth ?? current.agenda?.daysOfMonth }
    }
    if (input.type === 'habito') {
      next.sign = input.sign ?? current.sign ?? 'positivo'
      next.counter = current.counter ?? { today: 0, todayNeg: 0, totalPositive: 0, totalNegative: 0 }
    }
    if (input.type !== 'unica') next.dueDate = undefined
  }
  const tasks = appStore.get().tasks.map((t) => (t.id === id ? next : t))
  appStore.set({ ...appStore.get(), tasks })
  addLog('tarefa', `Editou: ${next.title}`)
  return { ok: true }
}

export function deleteTask(id: string): void {
  const task = taskById(id)
  const d = appStore.get()
  // tombstone: the merge must not re-add an already-deleted task
  appStore.set({
    ...d,
    tasks: d.tasks.filter((t) => t.id !== id),
    deletedTasks: { ...(d.deletedTasks ?? {}), [id]: new Date().toISOString() },
  })
  if (task) addLog('tarefa', `Excluiu: ${task.title}`)
}

/** Reorders the tasks (drag & drop): `ids` in the new order, within the same type. */
export function reorderTasks(ids: string[]): void {
  const tasks = appStore.get().tasks
  const map = new Map(tasks.map((t) => [t.id, t]))
  const set = new Set(ids)
  const reordered = ids.map((id) => map.get(id)).filter((t): t is Task => t !== undefined)
  if (reordered.length !== ids.length) return
  const type = reordered[0]?.type
  if (!type) return
  const rest = tasks.filter((t) => !set.has(t.id) || t.type !== type)
  const result = [...rest, ...reordered]
  appStore.set({ ...appStore.get(), tasks: result })
}

/** Recurring: marks/unmarks the day in the history (date = visible day; default today). Returns new cards. */
export function toggleRecurringToday(id: string, date: string = todayISO()): string[] {
  const tasks = appStore.get().tasks.map((t) => {
    if (t.id !== id || t.type !== 'recorrente') return t
    const has = t.history.includes(date)
    if (has) {
      // unmarking: reverts that day's reward
      revertReward(t, date)
      return { ...t, history: t.history.filter((d) => d !== date), rewards: withoutReward(t.rewards, date) }
    }
    return { ...t, history: [...t.history, date] }
  })
  appStore.set({ ...appStore.get(), tasks })
  const task = tasks.find((t) => t.id === id)
  if (task) {
    const marked = task.history.includes(date)
    if (marked) {
      addLog('tarefa', `Concluiu recorrente: ${task.title} (+${xpFor(task.difficulty)} XP)`)
      const before = appStore.get().character
      const added = gainXP(xpFor(task.difficulty)).newCards
      playSound('tarefa')
      storeReward(task.id, date, before, added)
      return added
    }
    addLog('tarefa', `Desfez recorrente: ${task.title} (XP revertido)`)
  }
  return []
}

/** One-off: toggles done and records the date (date = visible day; default today). Returns new cards. */
export function toggleOneOff(id: string, date: string = todayISO()): string[] {
  const tasks = appStore.get().tasks.map((t) => {
    if (t.id !== id || t.type !== 'unica') return t
    const done = !t.done
    if (!done) {
      // unmarking: reverts that day's reward
      revertReward(t, date)
      return {
        ...t,
        done,
        history: t.history.filter((d) => d !== date),
        rewards: withoutReward(t.rewards, date),
      }
    }
    return {
      ...t,
      done,
      history: [...new Set([...t.history, date])],
    }
  })
  appStore.set({ ...appStore.get(), tasks })
  const task = tasks.find((t) => t.id === id)
  if (task && task.done) {
    addLog('tarefa', `Concluiu: ${task.title} (+${xpFor(task.difficulty)} XP)`)
    const before = appStore.get().character
    const added = gainXP(xpFor(task.difficulty)).newCards
    playSound('tarefa')
    storeReward(task.id, date, before, added)
    return added
  }
  if (task) addLog('tarefa', `Desfez conclusão: ${task.title} (XP revertido)`)
  return []
}

/* ---------- rewards per completion (to revert when unmarking) ---------- */

/** Removes a date's reward from the map (returns undefined if empty). */
function withoutReward(rec: Record<string, CompletionReward> | undefined, date: string): Record<string, CompletionReward> | undefined {
  if (!rec || !rec[date]) return rec
  const { [date]: _removed, ...rest } = rec
  return Object.keys(rest).length > 0 ? rest : undefined
}

/** Stores on the task the snapshot of the just-granted reward: state BEFORE the
 *  gain (restored when unmarking) + POST-gain level (reversal guard).
 *  Exported for the check-in (retroactive completion also records reward). */
export function storeReward(id: string, date: string, before: Character, newCards: string[]): void {
  const p = appStore.get().character
  const tasks = appStore.get().tasks.map((t) => {
    if (t.id !== id) return t
    const xp = xpFor(t.difficulty)
    const reward: CompletionReward = {
      xp,
      leveledUp: p.level > before.level,
      level: p.level,
      xpBefore: before.xp,
      levelBefore: before.level,
      xpNextBefore: before.xpNext,
      hpMaxBefore: before.hpMax,
      manaMaxBefore: before.manaMax,
      cards: newCards.length > 0 ? newCards : undefined,
    }
    return { ...t, updatedAt: new Date().toISOString(), rewards: { ...t.rewards, [date]: reward } }
  })
  appStore.set({ ...appStore.get(), tasks })
}

/** Reverts XP/level/cards of an unmarked completion. */
function revertReward(t: Task, date: string): void {
  const r = t.rewards?.[date]
  if (!r) return
  const p = appStore.get().character
  const character: Character = {
    ...p,
    xp: Math.max(0, p.xp - r.xp),
  }
  // only de-levels if nobody leveled up after (current level == this completion's level)
  if (r.leveledUp && r.level !== undefined && p.level === r.level) {
    // restores the exact prior state
    const prevLevel = r.levelBefore ?? Math.max(1, p.level - 1)
    character.level = prevLevel
    character.xp = r.xpBefore ?? Math.max(0, p.xp - r.xp)
    character.xpNext = r.xpNextBefore ?? xpNextFor(prevLevel)
    character.hpMax = r.hpMaxBefore ?? hpMaxFor(prevLevel)
    character.manaMax = r.manaMaxBefore ?? manaMaxFor(prevLevel)
    character.hp = Math.min(p.hp, character.hpMax)
    character.mana = Math.min(p.mana, character.manaMax)
  }
  // cards: ALWAYS re-blocked when this completion unlocked them — even if the
  // user has since leveled up again (the level doesn't de-level in that case,
  // but the specific card of the undone action goes back to blocked).
  if (r.leveledUp && r.cards?.length) {
    const current = p.cards ?? []
    const removed = new Set(r.cards)
    character.cards = current.filter((c) => !removed.has(c))
    const inv = { ...(p.invocations ?? {}) }
    for (const c of r.cards) delete inv[c]
    character.invocations = inv
  }
  appStore.set({ ...appStore.get(), character })
  addLog('tarefa', `Recompensa revertida (−${r.xp} XP)`)
}

/** Habit: records a positive (+) or negative (−) repetition. Returns new cards. */
export function recordHabit(id: string, sign: 'positivo' | 'negativo', date: string = todayISO()): string[] {
  let alreadyMarked = false
  const isToday = date === todayISO() // retroativo (day selector) must NOT bump today's counter
  const tasks = appStore.get().tasks.map((t) => {
    if (t.id !== id || t.type !== 'habito') return t
    const counter = t.counter ?? { today: 0, todayNeg: 0, totalPositive: 0, totalNegative: 0 }
    if (sign === 'positivo') {
      // past day (non-today) already marked → doesn't re-mark nor re-give XP
      if (!isToday && t.history.includes(date)) {
        alreadyMarked = true
        return t
      }
      const history = t.history.includes(date) ? t.history : [...t.history, date]
      return {
        ...t,
        updatedAt: new Date().toISOString(),
        history,
        // only TODAY's counter increments when the date is today — retroactive
        // marks (day selector) record the history but never touch it.
        counter: {
          ...counter,
          today: isToday ? counter.today + 1 : counter.today,
          totalPositive: counter.totalPositive + 1,
        },
      }
    }
    // negative
    const negHist = t.negativeHistory ?? []
    if (!isToday && negHist.includes(date)) {
      alreadyMarked = true
      return t
    }
    return {
      ...t,
      updatedAt: new Date().toISOString(),
      counter: {
        ...counter,
        todayNeg: isToday ? counter.todayNeg + 1 : counter.todayNeg,
        totalNegative: counter.totalNegative + 1,
      },
      negativeHistory: negHist.includes(date) ? negHist : [...negHist, date],
    }
  })
  appStore.set({ ...appStore.get(), tasks })
  const task = tasks.find((t) => t.id === id)
  if (task) {
    if (alreadyMarked) {
      notify('Já marcado neste dia.')
      return []
    }
    if (sign === 'positivo') {
      addLog('habito', `Hábito positivo: ${task.title} (+${xpFor(task.difficulty)} XP, +${HP_PER_POSITIVE_HABIT} vida)`)
      const added = gainXP(xpFor(task.difficulty)).newCards
      heal(HP_PER_POSITIVE_HABIT)
      playSound('habito-pos')
      return added
    }
    const damage = damageFor(task.difficulty) // scales with difficulty (3/5/8/12)
    applyDamage(damage)
    playSound('habito-neg')
    addLog('habito', `Hábito negativo: ${task.title} (−${damage} vida)`)
  }
  return []
}
