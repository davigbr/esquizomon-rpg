/** Diary domain (1 entry per day). */

import type { DiaryEntry } from '../core/tipos'
import { newId, XP_PER_DAILY_LOG } from '../core/jogo'
import { appStore, addLog } from './base'
import { gainXP } from './personagem'
import { processDiaryMentions } from '../core/recompensa'
import { notify } from '../ui/toast'
import type { Result } from './base'

export function currentDiary(): DiaryEntry[] {
  return appStore.get().diary ?? []
}

function saveDiary(diary: DiaryEntry[]): void {
  appStore.set({ ...appStore.get(), diary })
}

/** Finds the entry of a specific date (YYYY-MM-DD). Returns undefined if there's none. */
export function entryOfDay(date: string): DiaryEntry | undefined {
  return currentDiary().find((e) => e.date === date)
}

/** Creates or updates the entry of a date (idempotent on date — 1/day).
 *  Logging the diary with real text yields XP once per day. */
export function saveEntry(date: string, fields: { title?: string; text: string }): DiaryEntry {
  const realText = (fields.text ?? '').trim()
  const current = entryOfDay(date)
  if (current) {
    const patch: Partial<DiaryEntry> = {
      text: fields.text,
      updatedAt: new Date().toISOString(),
    }
    if (fields.title !== undefined) patch.title = fields.title
    const updated: DiaryEntry = { ...current, ...patch }
    saveDiary(currentDiary().map((e) => (e.id === current.id ? updated : e)))
    rewardLog(date, realText)
    recompensarMencoesCarta()
    return updated
  }
  const created: DiaryEntry = {
    id: newId(),
    date,
    title: fields.title ?? '',
    text: fields.text,
    createdAt: new Date().toISOString(),
  }
  saveDiary([created, ...currentDiary()])
  rewardLog(date, realText)
  recompensarMencoesCarta()
  return created
}

/** XP for logging the diary: 1×/day, only when it gains REAL text (the empty
 *  creation of the editor when opening the page does NOT count). Dedup via diaryLogXp. */
function rewardLog(date: string, realText: string): void {
  if (!realText) return
  const d = appStore.get()
  if (d.diaryLogXp?.[date]) return
  appStore.set({ ...d, diaryLogXp: { ...(d.diaryLogXp ?? {}), [date]: true } })
  gainXP(XP_PER_DAILY_LOG)
  addLog('sistema', `Registrou o diário (+${XP_PER_DAILY_LOG} XP)`)
  notify(`Diário registrado! +${XP_PER_DAILY_LOG} XP`)
}

export function deleteEntry(id: string): void {
  saveDiary(currentDiary().filter((e) => e.id !== id))
}

/** Card mentions in the diary grant XP immediately on save (bug 2026-08-30:
 *  before, the reward only happened when the Fable read the diary in a chat —
 *  so citing a card and never chatting gave nothing). `diaryXp` keeps it once. */
function recompensarMencoesCarta(): void {
  const r = processDiaryMentions()
  if (r.xp > 0) {
    addLog('sistema', `Carta(s) citada(s) no diário: ${r.names.join(', ')} (+${r.xp} XP)`)
    notify(`Carta(s) citada(s) no diário: ${r.names.join(', ')} (+${r.xp} XP)`)
  }
}

/** Moves an entry to another date (respecting 1/day). Returns result. */
export function moveEntry(id: string, newDate: string): Result {
  const entry = currentDiary().find((e) => e.id === id)
  if (!entry) return { ok: false, reason: 'Entrada não encontrada.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return { ok: false, reason: 'Data inválida.' }
  if (entry.date === newDate) return { ok: true }
  const conflict = currentDiary().find((e) => e.date === newDate && e.id !== id)
  if (conflict) return { ok: false, reason: `Já existe uma crônica em ${newDate}.` }
  const moved: DiaryEntry = { ...entry, date: newDate, updatedAt: new Date().toISOString() }
  saveDiary(currentDiary().map((e) => (e.id === id ? moved : e)))
  return { ok: true }
}

/** Imports entries in batch (respecting 1/day). Existing days or invalid dates
 *  are skipped. Returns the summary. */
export function importDiary(
  entries: Array<{ date: string; title?: string; text: string }>,
): { imported: number; skipped: string[]; invalid: string[] } {
  const diary = currentDiary()
  const existing = new Set(diary.map((e) => e.date))
  const imported: DiaryEntry[] = []
  const skipped: string[] = []
  const invalid: string[] = []
  for (const e of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
      invalid.push(e.date)
      continue
    }
    if (existing.has(e.date)) {
      skipped.push(e.date)
      continue
    }
    existing.add(e.date)
    imported.push({
      id: newId(),
      date: e.date,
      title: e.title ?? '',
      text: e.text,
      createdAt: new Date().toISOString(),
    })
  }
  if (imported.length > 0) {
    saveDiary([...imported, ...diary])
    recompensarMencoesCarta()
  }
  return { imported: imported.length, skipped, invalid }
}

/** Lists diary entries in descending order. Used by the system prompt and the tool. */
export function listDiary(opts?: { limit?: number; from?: string; to?: string }): DiaryEntry[] {
  let list = currentDiary()
  if (opts?.from) list = list.filter((e) => e.date >= opts.from!)
  if (opts?.to) list = list.filter((e) => e.date <= opts.to!)
  const limit = opts?.limit ?? list.length
  return list.slice(0, limit)
}
