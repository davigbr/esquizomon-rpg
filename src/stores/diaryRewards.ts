/** Shared diary rewards — used by BOTH the daily chronicle (diary.ts) and the
 *  quick notes (notes.ts): EVERY record (note or chronicle) with real text
 *  yields XP, multiple per day. Editing the SAME record does not re-yield
 *  (dedup per entity key, not per date). */

import { appStore, addLog } from './base'
import { XP_PER_LOG } from '../core/jogo'
import { gainXP } from './personagem'
import { processDiaryMentions } from '../core/recompensa'
import { notify } from '../ui/toast'

/** XP for logging the diary — PER RECORD (several per day). The entity key is
 *  `nota:<id>` for quick notes and `cronica:<date>` for the daily chronicle;
 *  only the FIRST real-text save of each record yields (empty text never
 *  counts because the capture/editor is born empty). Dedup via diaryLogXp. */
export function rewardDiaryLog(entityKey: string, realText: string): void {
  if (!realText) return
  const d = appStore.get()
  if (d.diaryLogXp?.[entityKey]) return
  appStore.set({ ...d, diaryLogXp: { ...(d.diaryLogXp ?? {}), [entityKey]: true } })
  gainXP(XP_PER_LOG)
  addLog('sistema', `Registrou o diário (+${XP_PER_LOG} XP)`)
  notify(`Diário registrado! +${XP_PER_LOG} XP`)
}

/** Card mentions grant XP immediately on save (bug 2026-08-30: before, the
 *  reward only happened when the Fable read the diary — so citing a card and
 *  never chatting gave nothing). `diaryXp` keeps it once per day. */
export function rewardCardMentions(): void {
  const r = processDiaryMentions()
  if (r.xp > 0) {
    addLog('sistema', `Carta(s) citada(s) no diário: ${r.names.join(', ')} (+${r.xp} XP)`)
    notify(`Carta(s) citada(s) no diário: ${r.names.join(', ')} (+${r.xp} XP)`)
  }
}