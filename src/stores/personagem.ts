/** Sets (or removes) the character avatar — already-compressed JPEG data URL
 *  (128px, ~5KB) from the crop editor. */
export function setAvatar(avatar: string | null): void {
  const p = appStore.get().character
  appStore.set({
    ...appStore.get(),
    character: { ...p, avatar: avatar ?? undefined },
  })
}

/** Sets the monster name of the character (bold next to the avatar, desktop). */
export function setMonsterName(name: string): void {
  const p = appStore.get().character
  const clean = name.trim().slice(0, 40) || undefined
  appStore.set({
    ...appStore.get(),
    character: { ...p, monsterName: clean },
  })
}

/** Character domain: XP, level, cards, mana, damage and death. */

import type { Character } from '../core/tipos'
import { cardsPerLevel, invocationCost, hpMaxFor, manaMaxFor, xpNextFor } from '../core/jogo'
import type { Card } from '../core/baralho'
import { drawInitialIds, drawWeightedIds, allCards } from '../core/baralho'
import { appStore, addLog } from './base'
import type { Result } from './base'
import { playSound } from '../ui/audio'

/* Deck loaded + unlock queue (the deck arrives async on boot). */
export let loadedDeck: Card[] | null = null
let pendingUnlock = 0
/** Death event pending to be shown by the UI (lost card). */
let pendingDeath: { cardId: string; cardName: string } | null = null

/** Consumes the death event (once) — the UI shows the depleted screen and the lost card. */
export function consumeDeath(): { cardId: string; cardName: string } | null {
  const d = pendingDeath
  pendingDeath = null
  return d
}

/** Registers the death (just depleted) and loses 1 card from the collection.
 *  Order matters: `pendingDeath` is set BEFORE the cards set, so the subscribe
 *  fired by the removal already finds the event and shows the overlay. */
function registerDeath(): void {
  const data = appStore.get()
  const p = data.character
  if (p.cards.length > 0) {
    const lost = p.cards[Math.floor(Math.random() * p.cards.length)]
    const card = loadedDeck?.find((c) => c.id === lost)
    pendingDeath = { cardId: lost, cardName: card?.name ?? lost }
    appStore.set({ ...data, character: { ...p, cards: p.cards.filter((id) => id !== lost) } })
    addLog('carta', `Esgotou — perdeu a carta: ${card?.name ?? lost}`)
  } else {
    pendingDeath = { cardId: '', cardName: '' }
    addLog('dano', 'Esgotou — sem cartas para perder')
  }
  addLog('dano', 'Ficou esgotado (vida zerada)')
}

/** Registers the loaded deck; draws the initial cards and processes pending unlocks. */
export function registerDeck(cards: Card[]): void {
  loadedDeck = cards
  const data = appStore.get()
  const p = data.character
  if (p.cards.length === 0 && !p.exhausted) {
    // first run: 5 monsters + 1 capture + 1 alliance
    const initial = drawInitialIds(cards)
    appStore.set({ ...appStore.get(), character: { ...p, cards: initial } })
    const names = cards.filter((c) => initial.includes(c.id)).map((c) => c.name)
    addLog('carta', `Começou o jogo com ${initial.length} cartas: ${names.join(', ')}`)
  }
  if (pendingUnlock > 0) {
    const n = pendingUnlock
    pendingUnlock = 0
    unlockCards(n)
  }
}

/** Draws and adds n new cards to the character; returns the unlocked ids. */
function unlockCards(n: number): string[] {
  const data = appStore.get()
  const p = data.character
  if (!loadedDeck) {
    pendingUnlock += n
    return []
  }
  const added = drawWeightedIds(loadedDeck, n, p.cards)
  if (added.length === 0) return []
  appStore.set({
    ...data,
    character: { ...p, cards: [...p.cards, ...added] },
  })
  const names = loadedDeck.filter((c) => added.includes(c.id)).map((c) => c.name)
  addLog('carta', `Desbloqueou: ${names.join(', ')}`)
  return added
}

/** Applies XP to the character; returns whether it leveled up and new cards. */
export function gainXP(amount: number): { leveledUp: boolean; level: number; newCards: string[] } {
  const p = appStore.get().character
  let xp = p.xp + amount
  let { level } = p
  let xpNext = p.xpNext
  let leveledUp = false
  let levels = 0
  while (xp >= xpNext) {
    xp -= xpNext
    level += 1
    xpNext = xpNextFor(level)
    leveledUp = true
    levels += 1
  }
  const character: Character = {
    ...p,
    xp,
    xpNext,
    level,
    hpMax: hpMaxFor(level),
    manaMax: manaMaxFor(level),
  }
  if (leveledUp) {
    // leveling up restores HP and mana
    character.hp = character.hpMax
    character.mana = character.manaMax
    character.exhausted = false
  }
  appStore.set({ ...appStore.get(), character })
  const newCards = leveledUp ? unlockCards(levels * cardsPerLevel()) : []
  if (leveledUp) addLog('nivel', `Subiu para o nível ${level} (máximos restaurados)`)
  if (leveledUp) playSound('nivel')
  return { leveledUp, level, newCards }
}

/** Invokes an unlocked card: spends mana (cost grows per invocation up to the cap).
 *  `costOverride` allows charging a different cost (e.g. premium from the Fable). */
export function invokeCard(id: string, costOverride?: number): Result {
  const data = appStore.get()
  const p = data.character
  const card = loadedDeck?.find((c) => c.id === id)
  if (!card) return { ok: false, reason: 'Carta não encontrada.' }
  if (!p.cards.includes(id)) return { ok: false, reason: 'Esta carta ainda está bloqueada.' }
  const cost = costOverride ?? invocationCost(card.type, p.invocations[id] ?? 0)
  if (p.mana < cost) return { ok: false, reason: `Mana insuficiente — precisa de ${cost}.` }
  appStore.set({
    ...data,
    character: {
      ...p,
      mana: p.mana - cost,
      invocations: { ...p.invocations, [id]: (p.invocations[id] ?? 0) + 1 },
    },
  })
  addLog('invocacao', `Invocou: ${card.name} (−${cost} mana)`)
  playSound('invocar')
  return { ok: true }
}

/** Applies damage to the character (no-op in relaxed mode). Returns whether depleted. */
export function applyDamage(amount: number): { exhausted: boolean } {
  const data = appStore.get()
  if (data.settings.relaxedMode) return { exhausted: false }
  const p = data.character
  if (p.exhausted) return { exhausted: true }
  const hp = Math.max(0, p.hp - amount)
  const exhausted = hp <= 0
  appStore.set({
    ...data,
    character: { ...p, hp, exhausted: p.exhausted || exhausted },
  })
  if (exhausted) registerDeath()
  return { exhausted }
}

/** Heals up to the max (no-op above the cap). Returns how much was healed. */
export function heal(amount: number): number {
  const p = appStore.get().character
  const before = p.hp
  const hp = Math.min(p.hpMax, p.hp + Math.max(0, Math.floor(amount)))
  if (hp === before) return 0
  appStore.set({ ...appStore.get(), character: { ...p, hp } })
  return hp - before
}

/** Re-draws ALL unlocked cards (same total), respecting each type's odds
 *  (monster 6×, capture 2×, alliance 1×). Destructive — the UI asks for
 *  confirmation before calling. */
export function rerollDeck(): { before: number } {
  const p = appStore.get().character
  const before = p.cards.length
  const drawn = drawWeightedIds(allCards(), before)
  appStore.set({ ...appStore.get(), character: { ...p, cards: drawn } })
  addLog('carta', `Rerolou o baralho: ${before} cartas re-sorteadas.`)
  return { before }
}
