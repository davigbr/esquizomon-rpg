/** Cards view — Esquizomon deck gallery with per-level unlock and modal.
 *  ⚠️ Invocation became EXCLUSIVE to the chat (2026-08-12): ask the Fable. */

import type { AppData } from '../../core/tipos'
import { allCards, type Card, type CardType, kindOf, loadDeck, typeLabel } from '../../core/baralho'
import { fullDeckLevel, invocationCost } from '../../core/jogo'
import { appStore } from '../../stores/app'
import { modalBody, openModal } from '../modal'
import { notify } from '../toast'
import { escapeHtml } from '../util'
import { t } from '../../i18n'

let deckCache: Card[] | null = null
let filterType: CardType | '' = ''

/** Type order in the gallery: monsters first, then captures, finally alliances. */
const TYPE_ORDER: Record<CardType, number> = { monstro: 0, captura: 1, alianca: 2 }

export async function mountCards(root: HTMLElement, data: AppData): Promise<void> {
  if (!deckCache) {
    try {
      deckCache = await loadDeck()
    } catch {
      root.innerHTML = `<div class="empty"><strong>${t('cartas.erroCarregar')}</strong></div>`
      return
    }
    // the deck just arrived — the store may have changed (initial draw) while we waited
    data = appStore.get()
  }
  const deck = deckCache
  const unlocked = new Set(data.character.cards)
  const total = deck.length

  const list = (filterType ? deck.filter((c) => c.type === filterType) : deck)
    .sort((a, b) => {
      // always unlocked first; within each group, monsters → captures → alliances
      const da = unlocked.has(a.id) ? 0 : 1
      const db = unlocked.has(b.id) ? 0 : 1
      return da - db || TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
    })

  root.innerHTML = `
    <header class="view-header">
      <h1>${t('cartas.titulo')}</h1>
      <p class="view-sub">${t('cartas.sub', {n: unlocked.size, total: total, lv: fullDeckLevel()})}</p>
    </header>

    <div class="filters">
      <button class="filter-chip${filterType === '' ? ' active' : ''}" data-filter-type="">${t('cartas.todas')}</button>
      <button class="filter-chip${filterType === 'monstro' ? ' active' : ''}" data-filter-type="monstro">${t('cartas.monstros')}</button>
      <button class="filter-chip${filterType === 'captura' ? ' active' : ''}" data-filter-type="captura">${t('cartas.capturas')}</button>
      <button class="filter-chip${filterType === 'alianca' ? ' active' : ''}" data-filter-type="alianca">${t('cartas.aliancas')}</button>
    </div>

    <div class="cards-grid">
      ${list.map((c) => cardCard(c, unlocked.has(c.id))).join('')}
    </div>
  `

  root.querySelectorAll('[data-filter-type]').forEach((chip) => {
    chip.addEventListener('click', () => {
      filterType = (chip.getAttribute('data-filter-type') ?? '') as CardType | ''
      void mountCards(root, appStore.get())
    })
  })

  root.querySelectorAll('[data-carta]').forEach((item) => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-carta')!
      // locked cards stay hidden — no modal reveals the card
      if (!appStore.get().character.cards.includes(id)) {
        notify(t('cartas.bloqueada'))
        return
      }
      openCardModal(id)
    })
  })
}

function cardCard(c: Card, unlocked: boolean): string {
  const invocations = appStore.get().character.invocations[c.id] ?? 0
  const cost = invocationCost(kindOf(c), invocations)
  return `
    <div class="card-item${unlocked ? '' : ' card-item--blocked'}" data-carta="${escapeHtml(c.id)}" title="${unlocked ? `${t('cartas.ver')} ${c.name}` : `${c.name} — ${t('cartas.bloqueada')}`}">
      ${unlocked
        ? `<div class="card-figure"><img class="card-img" src="/images/cards/${escapeHtml(c.id)}.png" alt="${escapeHtml(c.name)}" loading="lazy" /><span class="card-view"><i class="fa-solid fa-eye" aria-hidden="true"></i> ${t('cartas.ver')}</span></div>`
        : `<div class="card-lock"><i class="fa-solid fa-lock" aria-hidden="true"></i><span class="card-lock-name">${escapeHtml(c.name)}</span></div>`}
      <div class="card-footer">
        <span class="badge badge--${c.type}">${typeLabel(c.type)}</span>
        ${unlocked ? `<span class="card-cost" title="${t('cartas.custoInvocacao')}"><i class="fa-solid fa-droplet" aria-hidden="true"></i> ${cost}</span>` : ''}
      </div>
    </div>
  `
}

/** Opens the modal for a card (navigates among unlocked ones). Exported because
 *  the CHAT thumbnail also opens the modal (2026-08-12). */
export function openCardModal(id: string): void {
  const deck = allCards()
  const data = appStore.get()
  // only unlocked cards navigate the modal
  const unlocked = deck.filter((c) => data.character.cards.includes(c.id))
  const index = unlocked.findIndex((c) => c.id === id)
  const card = unlocked[index] ?? deck.find((c) => c.id === id)
  if (!card) return
  const prev = unlocked[index - 1]
  const next = unlocked[index + 1]
  const invocations = data.character.invocations[id] ?? 0
  const cost = invocationCost(kindOf(card), invocations)

  openModal(`
    <div class="card-modal">
      <button class="card-modal-arrow" data-modal-prev aria-label="${t('cartas.anterior')}" ${prev ? '' : 'disabled'}>
        <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
      </button>
      <div class="card-modal-center">
        <img class="card-modal-img" src="/images/cards/${escapeHtml(id)}.png" alt="${escapeHtml(card.name)}" />
        <div class="card-modal-info">
          <span class="badge badge--${card.type}">${typeLabel(card.type)}</span>
          <h2>${escapeHtml(card.name)}</h2>
          <p class="card-modal-cost"><i class="fa-solid fa-droplet" aria-hidden="true"></i> ${cost} ${t('cartas.mana')}${invocations > 0 ? t('cartas.invocada', {n: invocations}) : ''}</p>
          <p class="settings-hint">${t('cartas.hintInvocacao')}</p>
        </div>
      </div>
      <button class="card-modal-arrow" data-modal-next aria-label="${t('cartas.proxima')}" ${next ? '' : 'disabled'}>
        <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  `)

  modalBody.querySelector('[data-modal-prev]')?.addEventListener('click', () => {
    if (prev) openCardModal(prev.id)
  })
  modalBody.querySelector('[data-modal-next]')?.addEventListener('click', () => {
    if (next) openCardModal(next.id)
  })
}
