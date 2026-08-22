/** Esquizomon deck — `src/data/deck.json` (65 cards), single statically imported
 *  source (gallery, IA context, citation detection). */

import deck from '../data/deck.json'
import { t } from '../i18n'

// Diagnostic hook: exposes the deck to console scripts (data correction
// in production — 2026-08-12). Harmless.
if (typeof window !== 'undefined') {
  ;(window as unknown as { esquizomonDeck?: Card[] }).esquizomonDeck = deck as Card[]
}

export type CardType = 'monstro' | 'captura' | 'alianca'

export interface Card {
  id: string
  name: string
  type: CardType
}

/** The full deck, already loaded (static import). Keeps the async signature
 *  so whoever calls `await loadDeck()` doesn't break. */
export async function loadDeck(): Promise<Card[]> {
  return deck as Card[]
}

/** The full deck, synchronously (same static import — used by autocomplete). */
export function allCards(): Card[] {
  return deck as Card[]
}

/** Draws N distinct ids among the available cards (excluding already-chosen ones). */
export function drawIds(cards: Card[], n: number, exclude: string[] = []): string[] {
  const available = cards.map((c) => c.id).filter((id) => !exclude.includes(id))
  const shuffled = [...available].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(n, shuffled.length))
}

/** Rarity weight per type: monster is 6× more common than alliance; capture 2×
 *  (2026-08-17 — raised from 3× to 6× to draw more monsters). */
export function rarityWeight(c: Card): number {
  return c.type === 'monstro' ? 6 : c.type === 'captura' ? 2 : 1
}

/** Draws N ids weighted by rarity, without repeating already-chosen ones —
 *  used in level unlocks (2026-08-12). */
export function drawWeightedIds(cards: Card[], n: number, exclude: string[] = []): string[] {
  const available = cards.filter((c) => !exclude.includes(c.id))
  const chosen: string[] = []
  const drawOne = (): Card | undefined => {
    const total = available.reduce((s, c) => s + rarityWeight(c), 0)
    if (total <= 0) return undefined
    let r = Math.random() * total
    for (const c of available) {
      r -= rarityWeight(c)
      if (r < 0) return c
    }
    return available[available.length - 1]
  }
  while (chosen.length < Math.min(n, available.length)) {
    const c = drawOne()
    if (!c) break
    chosen.push(c.id)
    available.splice(available.indexOf(c), 1)
  }
  return chosen
}

/** Draws the initial cards: exactly 5 monsters + 1 capture + 1 alliance. */
export function drawInitialIds(cards: Card[]): string[] {
  const of = (type: CardType) => cards.filter((c) => c.type === type)
  const monsters = drawIds(of('monstro'), 5)
  const captures = drawIds(of('captura'), 1)
  const alliances = drawIds(of('alianca'), 1)
  return [...monsters, ...captures, ...alliances]
}

export function kindOf(card: Card | undefined): CardType {
  return card?.type ?? 'monstro'
}

/** Label of the card type. */
export function typeLabel(type: CardType): string {
  switch (type) {
    case 'monstro':
      return t('cards.monsterType')
    case 'captura':
      return t('cards.captureType')
    case 'alianca':
      return t('cards.allianceType')
  }
}

/** Resonates the term the Fable used in the marker: id (slug) or card name. */
export function resolveCardId(term: string): string | null {
  const t = term.trim().toLocaleLowerCase('pt-BR')
  const card = (deck as Card[]).find((c) => c.id === t || c.name.toLocaleLowerCase('pt-BR') === t)
  return card?.id ?? null
}

/** Card name by id (for notes/toasts). */
export function cardName(id: string): string {
  return (deck as Card[]).find((c) => c.id === id)?.name ?? id
}

/** Card kind by id (to compute invocation cost). */
export function cardKindById(id: string): CardType {
  return (deck as Card[]).find((c) => c.id === id)?.type ?? 'monstro'
}
