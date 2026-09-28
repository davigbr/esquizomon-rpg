/** Quick notes domain (DiaryNote) — many per day, captured fast. */

import type { DiaryNote } from '../core/tipos'
import { newId, todayISO } from '../core/jogo'
import { getCity } from '../core/localizacao'
import { appStore } from './base'
import { flushSend } from '../sync/sync'
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
export function saveNote(input: { text: string; title?: string; id?: string; date?: string; time?: string }): DiaryNote {
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
      title: input.title !== undefined ? (input.title.trim() || undefined) : existing.title,
      updatedAt: now,
    }
    appStore.set({ ...data, notes: notes.map((n) => (n.id === updated.id ? updated : n)) })
    rewardDiaryLog(`nota:${existing.id}`, realText)
    rewardCardMentions()
    if (!existing.cidade) void attachNoteCity(existing.id)
    return updated
  }

  const created: DiaryNote = {
    id: newId(),
    date: input.date ?? todayISO(),
    time: input.time ?? localTimeHM(),
    text: input.text,
    title: input.title?.trim() || undefined,
    createdAt: now,
  }
  appStore.set({ ...data, notes: [created, ...notes] })
  rewardDiaryLog(`nota:${created.id}`, realText)
  rewardCardMentions()
  void attachNoteCity(created.id)
  return created
}

/** Attaches the city name (geolocation + reverse geocode) to a note when the
 *  browser allows it. Only the city string is kept; never blocks the save. */
function attachNoteCity(id: string): void {
  void getCity().then((cidade) => {
    if (!cidade) return
    const d = appStore.get()
    const cur = (d.notes ?? []).find((n) => n.id === id)
    if (!cur || cur.cidade) return
    appStore.set({ ...d, notes: (d.notes ?? []).map((n) => (n.id === id ? { ...n, cidade } : n)) })
  })
}

/** Imports notes in bulk (markdown import — NO XP, NO card-mention reward,
 *  matching the old chronicle import). Adds one note per parsed day. Returns
 *  the summary. Part of the 2026-09-28 unification (chronicle import → notes). */
export function importNotes(
  entries: Array<{ date: string; title?: string; text: string }>,
): { imported: number; skipped: string[]; invalid: string[] } {
  const data = appStore.get()
  const now = new Date().toISOString()
  const imported: DiaryNote[] = []
  const skipped: string[] = []
  const invalid: string[] = []
  for (const e of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
      invalid.push(e.date)
      continue
    }
    if (!e.text.trim()) {
      skipped.push(e.date)
      continue
    }
    imported.push({
      id: newId(),
      date: e.date,
      time: '23:59',
      text: e.text,
      title: e.title?.trim() || undefined,
      createdAt: now,
    })
  }
  if (imported.length > 0) {
    appStore.set({ ...data, notes: [...imported, ...(data.notes ?? [])] })
  }
  return { imported: imported.length, skipped, invalid }
}

export function deleteNote(id: string): void {
  const data = appStore.get()
  // tombstone: the merge must not re-add an already-deleted note
  appStore.set({
    ...data,
    notes: (data.notes ?? []).filter((n) => n.id !== id),
    deletedNotes: { ...(data.deletedNotes ?? {}), [id]: new Date().toISOString() },
  })
  // flush: guarantee the tombstone reaches the cloud right away (not via debounce)
  void flushSend()
}

/** Sets (or clears, with empty/whitespace) the city of a note. Metadata edit —
 *  no XP, no text change. Preserves date/time. */
export function setNoteCidade(id: string, cidade: string | undefined): void {
  const data = appStore.get()
  const notes = data.notes ?? []
  if (!notes.some((n) => n.id === id)) return
  const clean = cidade?.trim() || undefined
  appStore.set({ ...data, notes: notes.map((n) => (n.id === id ? { ...n, cidade: clean } : n)) })
}