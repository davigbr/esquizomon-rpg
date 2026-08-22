/** Store core (nanostores): global state + shared helpers.
 *  The domains (character, tasks, check-in, diary, conversations, settings)
 *  import from here and app.ts re-exports everything — no module imports
 *  app.ts, so there are no cycles. */

import { atom } from 'nanostores'

import type { Agenda, AppData, Difficulty, Task, LogType, TaskType } from '../core/tipos'
import { newId } from '../core/jogo'
import { MAX_LOG, load, save } from '../db/storage'

export const appStore = atom<AppData>(load())

appStore.subscribe((data) => {
  save(data)
})

/** Records an event in the history (most recent first, capped at MAX_LOG). */
export function addLog(type: LogType, text: string): void {
  const data = appStore.get()
  const event = { id: newId(), ts: new Date().toISOString(), type, text }
  appStore.set({ ...data, log: [event, ...data.log].slice(0, MAX_LOG) })
}

export function taskById(id: string): Task | undefined {
  return appStore.get().tasks.find((t) => t.id === id)
}

export interface Result {
  ok: boolean
  reason?: string
}

export interface TaskInput {
  title: string
  type: TaskType
  difficulty: Difficulty
  tags: string[]
  notes?: string
  dueDate?: string
  agenda?: Agenda
  sign?: 'positivo' | 'negativo' | 'ambos'
}
