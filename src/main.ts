/** Bootstrap — hash router, theme, nav and service worker registration. */

import '@fortawesome/fontawesome-free/css/fontawesome.min.css'
import './style.css'

import { appStore, applyEffectiveTheme, consumeDeath, setTheme, registerDeck, renewDay } from './stores/app'
import { mountToday } from './ui/views/hoje'
import { mountSheet } from './ui/views/ficha'
import { mountCards } from './ui/views/cartas'
import { mountHistory } from './ui/views/historico'
import { mountSettings } from './ui/views/config'
import { mountDiary } from './ui/views/diario'
import { toggleChat, mountChat, reactToStoreChange } from './ui/chat'
import { checkDaily } from './ui/checkin'
import { initAuth } from './sync/auth'
import { initSync, subscribeSync, getLastSync } from './sync/sync'
import { mountAccountButton } from './ui/headerConta'
import { loadDeck } from './core/baralho'
import { onPersistFailure, initialTheme } from './db/storage'
import { notify } from './ui/toast'
import { applyLangAttr, t, LOCALE, getLang } from './i18n'

const root = document.getElementById('app')!
const navLinks = document.querySelectorAll<HTMLAnchorElement>('[data-rota]')

type Route = 'hoje' | 'ficha' | 'cartas' | 'historico' | 'diario' | 'config'

function currentRoute(): Route {
  const hash = location.hash.replace(/^#\/?/, '')
  if (hash === 'ficha' || hash === 'cartas' || hash === 'historico' || hash === 'diario' || hash === 'config') return hash
  return 'hoje'
}

function mountRoute(route: Route): void {
  const data = appStore.get()
  switch (route) {
    case 'hoje':
      mountToday(root, data)
      break
    case 'ficha':
      mountSheet(root, data)
      break
    case 'cartas':
      mountCards(root, data)
      break
    case 'historico':
      mountHistory(root, data)
      break
    case 'diario':
      mountDiary(root, data)
      break
    case 'config':
      mountSettings(root, data)
      break
  }
  navLinks.forEach((a) => a.classList.toggle('active' , a.dataset.rota === route))
}

/* ---------- theme ---------- */

function applyInitialTheme(): void {
  const theme = initialTheme()
  setTheme(theme)
}

// System change (e.g. the user toggled the OS dark/light mode) → reapply
// when the chosen theme is "sistema".
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (appStore.get().settings.theme === 'sistema') applyEffectiveTheme('sistema')
})

/* ---------- status bar (level, HP, XP, mana — fixed on every screen) ---------- */

const statusBar = document.getElementById('status-bar')!

/* previous values to detect change and animate */
let prevStatus = { hp: -1, xp: -1, mana: -1 }

/* bar elements (created once; values updated preserving the node to animate transition) */
let els: {
  level: HTMLElement
  hp: HTMLElement
  hpValue: HTMLElement
  hpBar: HTMLElement
  xp: HTMLElement
  xpValue: HTMLElement
  xpBar: HTMLElement
  mana: HTMLElement
  manaValue: HTMLElement
  manaBar: HTMLElement
  exhausted: HTMLElement | null
} | null = null

/** Applies glow (animation class) to an item and removes it when done. */
function glow(item: HTMLElement, cls: string): void {
  item.classList.remove('status-glow-gain' , 'status-brilho-perda', 'status-brilho-mana')
  void item.offsetWidth // restarts the animation
  item.classList.add(cls)
  item.addEventListener('animationend', () => item.classList.remove(cls), { once: true })
}

function mountStatusBar(): void {
  const p = appStore.get().character
  const pctHp = Math.round((p.hp / p.hpMax) * 100)
  const pctXp = Math.min(100, Math.round((p.xp / p.xpNext) * 100))
  const pctMana = Math.round((p.mana / p.manaMax) * 100)

  // detects changes to animate (first render doesn't animate)
  const hpBefore = prevStatus.hp
  const xpBefore = prevStatus.xp
  const manaBefore = prevStatus.mana
  const hpChanged = hpBefore >= 0 && p.hp !== hpBefore
  const xpChanged = xpBefore >= 0 && p.xp !== xpBefore
  const manaChanged = manaBefore >= 0 && p.mana !== manaBefore
  prevStatus = { hp: p.hp, xp: p.xp, mana: p.mana }

  // 1st time: builds the structure (from then on only updates values, so the transition animates)
  if (!els) {
    statusBar.innerHTML = `
      <div class="status-identity">
        <div class="status-identity-info">
          <span class="status-name"></span>
          <div class="status-item status-item--nivel" title="${t('status.nivel')}"><i class="fa-solid fa-arrow-trend-up" aria-hidden="true"></i><span data-s-nivel></span></div>
        </div>
      </div>
      <div class="status-barras">
        <div class="status-item status-item--hp" title="${t('status.vida')}"><i class="fa-solid fa-heart" aria-hidden="true"></i><span data-s-hp></span><div class="status-track"><div class="status-fill status-fill--hp" data-b-hp></div></div></div>
        <div class="status-item status-item--xp" title="${t('status.xp')}"><i class="fa-solid fa-star" aria-hidden="true"></i><span data-s-xp></span><div class="status-track"><div class="status-fill status-fill--xp" data-b-xp></div></div></div>
        <div class="status-item status-item--mana" title="${t('status.mana')}"><i class="fa-solid fa-droplet" aria-hidden="true"></i><span data-s-mana></span><div class="status-track"><div class="status-fill status-fill--mana" data-b-mana></div></div></div>
      </div>
      <div class="status-item status-item--depleted" title="${t('status.esgotado')}" data-s-esgotado style="display:none"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>${t('status.esgotado')}</span></div>
      <div class="status-item status-item--sync" data-s-sync title="Última sincronização"></div>
    `
    const q = (s: string) => statusBar.querySelector<HTMLElement>(s)!
    els = {
      level: q('[data-s-nivel]'),
      hp: statusBar.querySelector('.status-item--hp')!,
      hpValue: q('[data-s-hp]'),
      hpBar: q('[data-b-hp]'),
      xp: statusBar.querySelector('.status-item--xp')!,
      xpValue: q('[data-s-xp]'),
      xpBar: q('[data-b-xp]'),
      mana: statusBar.querySelector('.status-item--mana')!,
      manaValue: q('[data-s-mana]'),
      manaBar: q('[data-b-mana]'),
      exhausted: statusBar.querySelector('[data-s-esgotado]'),
    }
  }

  // 2. updates values (CSS transition animates the width)
  els.level.textContent = `Nv ${p.level}`
  els.hpValue.textContent = `${p.hp}/${p.hpMax}`
  els.hpBar.style.width = `${pctHp}%`
  els.xpValue.textContent = `XP ${p.xp}/${p.xpNext}`
  els.xpBar.style.width = `${pctXp}%`
  els.manaValue.textContent = `Mana ${p.mana}/${p.manaMax}`
  els.manaBar.style.width = `${pctMana}%`
  if (els.exhausted) els.exhausted.style.display = p.exhausted ? 'inline-flex' : 'none'

  // avatar: created/removed dynamically (upload happens after the 1st render)
  const avatarEl = statusBar.querySelector<HTMLImageElement>('.status-avatar')
  const currentAvatar = p.avatar
  // monster name: fills the FIXED span of the markup (display none if empty)
  const nameSpan = statusBar.querySelector<HTMLElement>('.status-name')
  if (nameSpan) {
    const name = p.monsterName?.trim() ?? ''
    nameSpan.textContent = name
    nameSpan.style.display = name ? '' : 'none'
  }
  const identity = statusBar.querySelector<HTMLElement>('.status-identity')
  const infoEl = statusBar.querySelector<HTMLElement>('.status-identity-info')
  if (currentAvatar && !avatarEl) {
    const img = document.createElement('img')
    img.className = 'status-avatar' 
    img.alt = t('status.avatar')
    img.src = currentAvatar
    // inserts BEFORE the top (level) — inline, to the left; order via flex `order`
    identity?.insertBefore(img, infoEl)
  } else if (!currentAvatar && avatarEl) {
    avatarEl.remove()
  } else if (currentAvatar && avatarEl && avatarEl.getAttribute('src') !== currentAvatar) {
    avatarEl.setAttribute('src', currentAvatar)
  }

  // 3. glow on changes
  if (hpChanged) glow(els.hp, p.hp > hpBefore ? 'status-brilho-ganho' : 'status-brilho-perda')
  if (xpChanged) glow(els.xp, 'status-brilho-ganho')
  if (manaChanged) glow(els.mana, 'status-brilho-mana')
}

/* ---------- death screen (fully depleted) ---------- */

const deathOverlay = document.getElementById('morte-overlay')!
const deathCard = document.getElementById('morte-carta')!
const deathContinue = document.getElementById('morte-continuar')!

function showDeath(cardId: string, cardName: string): void {
  deathCard.innerHTML = cardId
    ? `<img src="/images/cards/${cardId}.png" alt="${cardName}" /><span>${cardName}</span>`
    : `<span>${t('status.cartaPerdida')}</span>`
  deathOverlay.hidden = false
  deathContinue.focus()
}

deathContinue.addEventListener('click', () => {
  deathOverlay.hidden = true
})

/* ---------- router ---------- */

window.addEventListener('hashchange', () => mountRoute(currentRoute()))

/* re-render on state change, keeping the current route */
appStore.subscribe(() => {
  mountStatusBar()
  mountRoute(currentRoute())
  // death: shows the depleted screen with the lost card (once)
  const death = consumeDeath()
  if (death && deathOverlay.hidden) showDeath(death.cardId, death.cardName)
  // the chat reads from appStore — re-renders to reflect external changes
  reactToStoreChange()
})

/* ---------- Fable chat (side panel) ---------- */

document.getElementById('fabula-toggle')!.addEventListener('click', () => {
  mountChat()
  toggleChat()
})

/* ---------- account in the header (login/sync) ---------- */

mountAccountButton()

/* ---------- new day ---------- */

renewDay()
checkDaily()

/* ---------- account & sync (optional — the app runs offline) ---------- */

/** "Last sync" item in the status bar (desktop, to the right). */
function updateSyncStatus(): void {
  const el = document.querySelector<HTMLElement>('[data-s-sync]')
  if (!el) return
  const lastTs = getLastSync()
  if (lastTs) {
    const d = new Date(lastTs)
    const hour = d.toLocaleTimeString(LOCALE[getLang()], { hour: '2-digit', minute: '2-digit' })
    el.innerHTML = `<i class="fa-solid fa-cloud" aria-hidden="true"></i><span>${hour}</span>`
    el.title = `${t('sync.ultima')}: ${d.toLocaleString(LOCALE[getLang()])}`
  } else {
    el.innerHTML = '<i class="fa-solid fa-cloud" aria-hidden="true"></i><span>—</span>'
    el.title = t('sync.nunca')
  }
}

void initAuth().then(() => initSync())

/* ---------- persistence failure warning (quota full / storage blocked) ---------- */

onPersistFailure((reason) => notify(reason, 'erro'))

/* ---------- deck (loads the deck and draws the initial cards) ---------- */

void loadDeck()
  .then((cards) => registerDeck(cards))
  .catch(() => {
    /* deck unavailable — the gallery warns */
  })

/* ---------- service worker (production) ---------- */

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}

applyInitialTheme()
applyLangAttr()
mountStatusBar()
subscribeSync(updateSyncStatus)
updateSyncStatus()
mountRoute(currentRoute())
