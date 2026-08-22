/**
 * Reward for card mentions in the diary (2026-08-17).
 *
 * Every time a CARD NAME appears in the diary, the player earns XP — this
 * happens when the Fable reads the diary (in chat interaction): the app
 * processes the entries and applies the XP; the Fable celebrates in the reply.
 *
 * "Must save so it doesn't happen twice": the `diaryXp` field (date →
 * already-awarded card ids) records what was already rewarded; if the entry
 * text changes and mentions a NEW card, that new one gives XP.
 */
import { appStore } from '../stores/base'
import { gainXP } from '../stores/personagem'
import { allCards } from './baralho'

/** XP per card mention in the diary (per entry/day). */
export const XP_PER_MENTION = 10

export interface MentionResult {
  names: string[]
  xp: number
  leveledUp: boolean
  newCards: string[]
}

/** Scans the diary, rewards unawarded mentions and applies the XP (with a
 *  level-up, if it lands). Called on interaction with the Fable. */
export function processDiaryMentions(): MentionResult {
  const d = appStore.get()
  const already = d.diaryXp ?? {}
  const deck = allCards()
  const entries = d.diary ?? []

  const newAlready: Record<string, string[]> = { ...already }
  const detected: string[] = []
  let total = 0
  let changed = false

  for (const entry of entries) {
    if (!entry || typeof entry.text !== 'string') continue
    const awarded = already[entry.date] ?? []
    const text = `${entry.title ?? ''}\n${entry.text}`.toLowerCase()
    for (const card of deck) {
      if (!awarded.includes(card.id) && text.includes(card.name.toLowerCase())) {
        newAlready[entry.date] = [...(newAlready[entry.date] ?? [...awarded]), card.id]
        if (!detected.includes(card.name)) detected.push(card.name)
        total += XP_PER_MENTION
        changed = true
      }
    }
  }

  if (!changed) return { names: [], xp: 0, leveledUp: false, newCards: [] }

  // persists the record BEFORE (gainXp re-sets the store preserving this field)
  appStore.set({ ...d, diaryXp: newAlready })
  const r = gainXP(total)
  return { names: detected, xp: total, leveledUp: r.leveledUp, newCards: r.newCards }
}
