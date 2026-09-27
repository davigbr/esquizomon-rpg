/** Quick notes domain (DiaryNote) — many per day, captured fast. */

import type { DiaryNote } from '../core/tipos'
import { newId, todayISO } from '../core/jogo'
import { appStore } from './base'
import { rewardCardMentions, rewardDiaryLog } from './diaryRewards'

export function currentNotes(): DiaryNote[] {
  return appStore.get().notes ?? []
}

export function noteById(id: string): DiaryNote | undefined {
  return currentNotes().find((n) => n.id === id)
}

/** Local time as HH:MM (capture stamp of a note). */
export function localTimeHM(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Creates or updates a note. With `id` it UPDATES (keeps the original
 *  date/time unless overridden); without, it CREATES a new note (defaults to
 *  today, now). Logging real text yields XP 1×/day (shared dedup with the
 *  chronicle) and card mentions are rewarded on save. */
export function saveNote(input: { text: string; id?: string; date?: string; time?: string }): DiaryNote {
  const data = appStore.get()
  const notes = data.notes ?? []
  const now = new Date().toISOString()
  const realText = (input.text ?? '').trim()

  const existing = input.id ? notes.find((n) => n.id === input.id) : undefined
  if (existing) {
    const updated: DiaryNote = {
      ...existing,
      text: input.text,
      time: input.time ?? existing.time,
      updatedAt: now,
    }
    appStore.set({ ...data, notes: notes.map((n) => (n.id === updated.id ? updated : n)) })
    rewardDiaryLog(`nota:${existing.id}`, realText)
    rewardCardMentions()
    return updated
  }

  const created: DiaryNote = {
    id: newId(),
    date: input.date ?? todayISO(),
    time: input.time ?? localTimeHM(),
    text: input.text,
    createdAt: now,
  }
  appStore.set({ ...data, notes: [created, ...notes] })
  rewardDiaryLog(`nota:${created.id}`, realText)
  rewardCardMentions()
  return created
}

export function deleteNote(id: string): void {
  const data = appStore.get()
  appStore.set({ ...data, notes: (data.notes ?? []).filter((n) => n.id !== id) })
}