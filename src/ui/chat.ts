/** Fable chat panel — multiple conversations, streaming, collapsible reasoning.
 *  Persistence: each conversation lives in `AppData.conversations` (via appStore). */

import type { AppData, Conversation, AiMessage } from '../core/tipos'
import {
  addMessage,
  appStore,
  updateConversation,
  conversationById,
  createConversation,
  deleteConversation,
} from '../stores/app'
import { sendToAI, AiError, type ChatMessage } from '../ia/cliente'
import { buildSystemPrompt, buildSchizoanalystSystemPrompt } from '../ia/prompt'
import { extractActions, detectInvocationRequest, type AiAction } from '../ia/acoes'
import { collectCommandNotes } from '../ia/notasDeComando'
import { cardName, resolveCardId, cardKindById, typeLabel, allCards } from '../core/baralho'
import { invokeCard } from '../stores/app'
import { invocationCost, fableInvocationCost } from '../core/jogo'
import { playSound } from './audio'
import { notify } from './toast'
import { t } from '../i18n'
import { escapeHtml as escape } from './util'
import { bubble, messageToMarkdown } from './chatRender'
import { openCardModal } from './views/cards'
import { confirm } from './modal'

const PANEL_KEY = 'esquizomon-rpg:chat-painel'
const WIDTH_KEY = 'esquizomon-rpg:chat-largura'
const MIN_WIDTH = 320
const MAX_WIDTH = 900
const DEFAULT_WIDTH = 480

/** Panel UI state (open/closed, active conversation). Persisted separately from conversations. */
interface PanelState {
  open: boolean
  activeConversationId: string | null
}

function loadPanelState(): PanelState {
  try {
    const raw = localStorage.getItem(PANEL_KEY)
    if (!raw) return { open: false, activeConversationId: null }
    const obj = JSON.parse(raw) as Partial<PanelState> & Record<string, unknown>
    return {
      open: obj.open === true,
      activeConversationId: typeof obj.activeConversationId === 'string'
        ? obj.activeConversationId
        : typeof obj.conversaAtivaId === 'string' ? obj.conversaAtivaId : null,
    }
  } catch {
    return { open: false, activeConversationId: null }
  }
}

function savePanelState(state: PanelState): void {
  try {
    localStorage.setItem(PANEL_KEY, JSON.stringify(state))
  } catch {
    /* storage blocked — no panel persistence */
  }
}

function loadWidth(): number {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY))
    if (Number.isFinite(v) && v >= MIN_WIDTH && v <= MAX_WIDTH) return v
  } catch {
    /* storage blocked */
  }
  return DEFAULT_WIDTH
}

function saveWidth(width: number): void {
  try {
    localStorage.setItem(WIDTH_KEY, String(Math.round(width)))
  } catch {
    /* no persistence */
  }
}

function applyWidth(width: number): void {
  if (panel) panel.style.width = `${Math.round(width)}px`
}

let panel: HTMLElement | null = null
let listEl: HTMLElement | null = null
let messagesEl: HTMLElement | null = null
let inputEl: HTMLTextAreaElement | null = null
let formEl: HTMLFormElement | null = null
let state: PanelState = loadPanelState()
let busy = false
/** Conversation renaming: input in place of the header title. */
let renaming = false
let editingTitle = ''

/** Autocomplete of commands (/invocar, /analisar) and unlocked cards. */
interface Suggestion {
  label: string
  detail: string
  insert: () => void
}
const COMMANDS = [
  { name: 'invocar', desc: 'invoca uma carta (custa mana; sem nome = Fábula escolhe, custa mais)' },
  { name: 'analisar', desc: 'análise esquizoanalítica técnica (10 mana)' },
  { name: 'capturas', desc: 'varredura das cartas de captura desbloqueadas (25 mana)' },
] as const
let suggestions: Suggestion[] = []
let suggestionIdx = 0

/** Builds the panel shell (once) and injects into the body. Idempotent. */
export function mountChat(): void {
  if (panel) return
  panel = document.createElement('aside')
  panel.id = 'fabula-panel'
  panel.setAttribute('aria-label', 'Chat com a Fábula')
  panel.style.width = `${loadWidth()}px`
  document.body.appendChild(panel)
  render()
}

function render(): void {
  if (!panel) return
  // The innerHTML below destroys the suggestion dropdown — reset the state.
  suggestions = []
  suggestionIdx = 0
  const data: AppData = appStore.get()
  const conversations = data.conversations ?? []
  // Auto-recovery (real bug 2026-08-12): if the active conversation id is ORPHAN
  // (e.g. import/export replaced the conversations, or old panel), selects the
  // most recent conversation instead of leaving the chat dead (input disabled).
  if (state.activeConversationId && !conversations.some((c) => c.id === state.activeConversationId)) {
    state.activeConversationId = conversations[0]?.id ?? null
    savePanelState(state)
  }
  // Auto-start (usability 2026-08-12, user request): with the panel OPEN and
  // no conversation (e.g. import replaced the data), creates a new one on the
  // spot — the chat never stays dead waiting for the user to find the ✏ button.
  if (state.open && conversations.length === 0) {
    const created = createConversation()
    if (created) {
      state.activeConversationId = created.id
      savePanelState(state)
      notify(t('chat.semConversas'))
    }
  }
  // Re-reads from the store: the auto-start above may have just created a
  // conversation (the `conversations` array at the top is the snapshot BEFORE creation).
  const currentConversations = appStore.get().conversations ?? []
  const conversation = state.activeConversationId
    ? currentConversations.find((c) => c.id === state.activeConversationId) ?? undefined
    : undefined
  const last = conversation?.messages[conversation.messages.length - 1]
  const waiting = busy && last?.role === 'user'

  panel.classList.toggle('open' , state.open)
  document.body.classList.toggle('fable-open' , state.open)

  panel.innerHTML = `
    <div class="fable-resize" data-fabula-resize title="${t('chat.redimensionar')}" aria-label="${t('chat.redimensionarPainel')}"></div>
    <div class="fable-side">
      <button class="btn btn-icon fable-new" data-fabula-nova title="${t('chat.nova')}" aria-label="${t('chat.nova')}">
        <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
      </button>
      <div class="fable-list" data-fabula-lista role="list" aria-label="${t('chat.conversas')}">
        ${currentConversations.length === 0
          ? '<div class="fable-empty-list">Sem conversas</div>'
          : currentConversations.map(conversationItem).join('')}
      </div>
    </div>

    <div class="fable-conversation">
      <header class="fable-header">
        ${renaming && conversation
          ? `<input class="fable-title-input" data-fabula-titulo-input value="${escape(conversation.title ?? '')}" maxlength="60" aria-label="${t('chat.tituloConversa')}" title="${t('chat.tituloDica')}" />`
          : `<div class="fable-title">
          <i class="fa-solid fa-feather" aria-hidden="true"></i>
          <div>
            <strong>Fábula</strong>
            <span class="fable-sub">a Rizomante</span>
          </div>
        </div>`}
        <div class="fable-header-actions">
          <button class="btn btn-icon" data-fabula-renomear title="${t('chat.renomear')}" aria-label="${t('chat.renomear')}" ${conversation ? '' : 'disabled'}>
            <i class="fa-solid fa-pen" aria-hidden="true"></i>
          </button>
          <button class="btn btn-icon" data-fable-delete title="${t('chat.apagar')}" aria-label="${t('chat.apagar')}" ${conversation ? '' : 'disabled'}>
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
          </button>
          <button class="btn btn-icon" data-fable-close aria-label="${t('chat.fecharChat')}" title="${t('chat.fechar')}">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
      </header>

      <div class="fable-messages" data-fabula-mensagens>
        ${!conversation
          ? '<div class="fable-empty">Comece uma conversa com a Fábula. Ela tem acesso às suas tarefas, hábitos, cartas e personagem — e lembra do que foi dito antes.</div>'
          : conversation.messages.length === 0
            ? '<div class="fable-empty">Senta. Como você chega hoje? — e não vale responder "bem" sem me dizer o que "bem" quer dizer.</div>'
            : conversation.messages.map((m, i) => bubble(m, i)).join('')}
        ${waiting ? '<div class="fable-bubble fable-bubble--assistant fable-typing"><span></span><span></span><span></span></div>' : ''}
      </div>

      <form class="fable-form" data-fabula-form>
        <textarea class="fable-input" data-fabula-input rows="1" placeholder="${conversation ? '' : t('chat.crieConversa')}" autocomplete="off" ${!conversation || busy ? 'disabled' : ''}></textarea>
        <button class="btn btn-icon" type="submit" aria-label="${t('chat.enviar')}" ${!conversation || busy ? 'disabled' : ''}><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>
      </form>
      <p class="fable-hint">Comandos: <b>/invocar &lt;carta&gt;</b> (custa mana) · <b>/invocar</b> sem nome (a Fábula escolhe, custa mais) · <b>/analisar</b> (10 mana, análise esquizoanalítica) · <b>/capturas</b> (25 mana, varredura das capturas desbloqueadas). Ou peça no texto: <b>invoca a carta &lt;nome&gt;</b>.</p>
    </div>
  `

  cacheRefs()
  installHandlers(conversation)
  scrollToEnd()
}

function conversationItem(c: Conversation): string {
  const active = c.id === state.activeConversationId
  const preview = c.messages[c.messages.length - 1]?.content ?? 'Nova conversa'
  return `<button class="fable-item ${active ? 'fable-item--active' : ''}" data-conversa="${escape(c.id)}" role="listitem" title="${escape(c.title)}">
    <span class="fable-item-title">${escape(c.title || 'Sem título')}</span>
    <span class="fable-item-preview">${escape(preview.slice(0, 40))}</span>
  </button>`
}

function cacheRefs(): void {
  if (!panel) return
  listEl = panel.querySelector('[data-fabula-lista]')
  messagesEl = panel.querySelector('[data-fabula-mensagens]')
  inputEl = panel.querySelector('[data-fabula-input]')
  formEl = panel.querySelector('[data-fabula-form]')
}

function installHandlers(conversation: Conversation | undefined): void {
  if (!panel) return
  panel.querySelector('[data-fable-close]')!.addEventListener('click', () => toggleChat(false))
  panel.querySelector('[data-fabula-nova]')!.addEventListener('click', () => newConversation())
  const renameBtn = panel.querySelector<HTMLButtonElement>('[data-fabula-renomear]')
  if (renameBtn && conversation) {
    renameBtn.addEventListener('click', () => startRenaming(conversation.id))
  }
  // Copy per message: delegation on the container (each bubble has its own button)
  messagesEl?.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-fabula-copiar-msg]')
    if (target) {
      const idx = Number(target.dataset.fabulaCopiarMsg)
      const m = currentConversation()?.messages[idx]
      if (m) void copyMessage(m)
      return
    }
    // card thumbnail → same gallery modal
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-fabula-carta]')
    if (card) {
      const id = card.dataset.fabulaCarta ?? ''
      if (!id) return
      if (appStore.get().character.cards.includes(id)) {
        openCardModal(id)
      } else {
        notify(t('chat.cartaBloqueada'))
      }
    }
  })
  // Rename input: Enter saves, Escape cancels, blur saves (with guard).
  const titleInput = panel.querySelector<HTMLInputElement>('[data-fabula-titulo-input]')
  if (titleInput) {
    const finishRenaming = () => {
      const fresh = titleInput.value.trim()
      const c = currentConversation()
      renaming = false
      if (c && fresh && fresh !== editingTitle) updateConversation(c.id, { title: fresh })
      editingTitle = ''
      render()
    }
    titleInput.addEventListener('keydown', (e) => {
      const ev = e as KeyboardEvent
      if (ev.key === 'Enter') {
        ev.preventDefault()
        finishRenaming()
      } else if (ev.key === 'Escape') {
        titleInput.value = editingTitle // cancels: back to the original title
        finishRenaming()
      }
    })
    titleInput.addEventListener('blur', finishRenaming)
  }
  const deleteBtn = panel.querySelector('[data-fable-delete]') as HTMLButtonElement | null
  if (deleteBtn && conversation) {
    deleteBtn.addEventListener('click', () => void deleteCurrentConversation())
  }
  listEl?.querySelectorAll<HTMLButtonElement>('[data-conversa]').forEach((btn) => {
    btn.addEventListener('click', () => selectConversation(btn.dataset.conversa ?? ''))
  })
  installResize()
  if (formEl && inputEl && conversation) {
    // Enter sends / Shift+Enter breaks line — but with suggestions open,
    // Enter/Tab/Arrows navigate and complete the command (autocomplete).
    inputEl.addEventListener('keydown', (e) => {
      const ev = e as KeyboardEvent
      if (suggestions.length > 0) {
        if (ev.key === 'ArrowDown') {
          ev.preventDefault()
          moveSuggestion(1)
        } else if (ev.key === 'ArrowUp') {
          ev.preventDefault()
          moveSuggestion(-1)
        } else if (ev.key === 'Enter' || ev.key === 'Tab') {
          ev.preventDefault()
          applySuggestion()
        } else if (ev.key === 'Escape') {
          ev.preventDefault()
          closeSuggestions()
        }
        return
      }
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault()
        formEl?.requestSubmit()
      }
    })
    // Textarea auto-resize + autocomplete of commands/cards
    inputEl.addEventListener('input', () => {
      inputEl!.style.height = 'auto'
      inputEl!.style.height = Math.min(inputEl!.scrollHeight, 200) + 'px'
      updateSuggestions()
    })
    // Closes the suggestions on blur (small delay so the item click completes)
    inputEl.addEventListener('blur', () => {
      setTimeout(() => closeSuggestions(), 150)
    })
    formEl.addEventListener('submit', (e) => {
      e.preventDefault()
      const text = inputEl!.value.trim()
      if (!text || busy) return
      inputEl!.value = ''
      inputEl!.style.height = 'auto'
      closeSuggestions()
      void send(text)
    })
  }
}

/** Horizontal drag on the panel's left edge — resizes the width. */
function installResize(): void {
  if (!panel) return
  const handle = panel.querySelector<HTMLElement>('[data-fabula-resize]')
  if (!handle) return

  handle.addEventListener('pointerdown', (eDown) => {
    if (!panel) return
    eDown.preventDefault()
    handle.setPointerCapture(eDown.pointerId)
    const startX = eDown.clientX
    const initialWidth = panel.getBoundingClientRect().width
    document.body.classList.add('fable-resizing' )

    const move = (eMove: PointerEvent) => {
      if (!panel) return
      // Dragging LEFT increases the panel (left edge is the "front" of the resize)
      const dx = startX - eMove.clientX
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, initialWidth + dx))
      applyWidth(next)
    }

    const end = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', end)
      handle.removeEventListener('pointercancel', end)
      document.body.classList.remove('fable-resizing' )
      if (panel) saveWidth(panel.getBoundingClientRect().width)
    }

    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
  })
}

/** Updates the suggestion dropdown per the input (up to the caret):
 *  "/" + start of command → lists the commands; "/invocar " + text → lists the
 *  unlocked cards. Closes if it doesn't look like a command. */
function updateSuggestions(): void {
  if (!panel || !inputEl) return
  const value = inputEl.value
  const caret = inputEl.selectionStart ?? value.length
  const prefix = value.slice(0, caret)
  const mCommand = prefix.match(/^\/([a-z-]*)$/i)
  const mCard = prefix.match(/^\/invocar\s+(.*)$/i)
  const data = appStore.get()
  const unlocked = new Set(data.character.cards)
  let items: Suggestion[] = []
  if (mCommand) {
    const base = mCommand[1].toLowerCase()
    // Only suggests PREFIXES — the exact command (/invocar, /analisar) doesn't
    // open the dropdown, or Enter would complete in a loop instead of sending.
    items = COMMANDS.filter((c) => c.name.startsWith(base) && c.name !== base).map((c) => ({
      label: `/${c.name}`,
      detail: c.desc,
      insert: () => {
        inputEl!.value = `/${c.name} `
        inputEl!.focus()
        updateSuggestions() // after "/invocar ", lists the cards
      },
    }))
  } else if (mCard) {
    const q = mCard[1].toLocaleLowerCase('pt-BR')
    items = allCards()
      .filter((c) => unlocked.has(c.id))
      .filter((c) => c.name.toLocaleLowerCase('pt-BR').includes(q))
      .slice(0, 8)
      .map((c) => ({
        label: c.name,
        detail: `${typeLabel(c.type)} · invocada ${data.character.invocations[c.id] ?? 0}×`,
        insert: () => {
          inputEl!.value = `/invocar ${c.name}`
          inputEl!.focus()
          closeSuggestions()
        },
      }))
  }
  renderSuggestions(items)
}

function renderSuggestions(items: Suggestion[]): void {
  suggestions = items
  suggestionIdx = 0
  const existing = panel?.querySelector<HTMLElement>('[data-fabula-sugestoes]')
  if (items.length === 0) {
    existing?.remove()
    return
  }
  let el = existing
  if (!el) {
    el = document.createElement('div')
    el.className = 'fable-suggestions' 
    el.dataset.fabulaSugestoes = ''
    el.setAttribute('role', 'listbox')
    el.setAttribute('aria-label', 'Comandos e cartas')
    panel!.appendChild(el)
  }
  el.innerHTML = items
    .map(
      (s, i) =>
        `<button type="button" class="fable-suggestion${i === suggestionIdx ? ' fable-suggestion--active' : ''}" data-fabula-sugestao="${i}" role="option" aria-selected="${i === suggestionIdx}">
          <span class="fable-suggestion-label">${escape(s.label)}</span>
          <span class="fable-suggestion-detail">${escape(s.detail)}</span>
        </button>`,
    )
    .join('')
  el.querySelectorAll<HTMLButtonElement>('[data-fabula-sugestao]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault() // keeps focus on the input; the blur doesn't close before the click
      const idx = Number(btn.dataset.fabulaSugestao)
      suggestions[idx]?.insert()
    })
  })
}

function moveSuggestion(delta: number): void {
  if (suggestions.length === 0) return
  suggestionIdx = (suggestionIdx + delta + suggestions.length) % suggestions.length
  panel?.querySelectorAll<HTMLButtonElement>('[data-fabula-sugestao]').forEach((btn, i) => {
    btn.classList.toggle('fable-suggestion--active' , i === suggestionIdx)
    btn.setAttribute('aria-selected', String(i === suggestionIdx))
  })
}

function applySuggestion(): void {
  suggestions[suggestionIdx]?.insert()
}

function closeSuggestions(): void {
  suggestions = []
  suggestionIdx = 0
  panel?.querySelector('[data-fabula-sugestoes]')?.remove()
}

function scrollToEnd(): void {
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight
}

async function copyMessage(m: AiMessage): Promise<void> {
  const ok = await copyToClipboard(messageToMarkdown(m))
  notify(ok ? t('chat.copiada') : t('chat.copiaFalhou'), ok ? 'ok' : 'erro')
}

/** Clipboard API with fallback (textarea + execCommand) for contexts without permission. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

/** Opens/closes the panel. */
export function toggleChat(open?: boolean): void {
  if (!panel) mountChat()
  if (!panel) return
  const willOpen = open ?? !state.open
  state.open = willOpen
  savePanelState(state)
  render()
  if (willOpen) inputEl?.focus()
}

function selectConversation(id: string): void {
  if (!id) return
  renaming = false
  state.activeConversationId = id
  savePanelState(state)
  render()
}

function newConversation(): void {
  renaming = false
  const c = createConversation()
  state.activeConversationId = c.id
  state.open = true
  savePanelState(state)
  render()
}

/** Opens the rename input in the header, with the current title selected. */
function startRenaming(id: string): void {
  const c = conversationById(id)
  if (!c) return
  editingTitle = c.title ?? ''
  renaming = true
  render()
  const input = panel?.querySelector<HTMLInputElement>('[data-fabula-titulo-input]')
  input?.focus()
  input?.select()
}

async function deleteCurrentConversation(): Promise<void> {
  const id = state.activeConversationId
  if (!id) return
  renaming = false
  const ok = await confirm(t('chat.confirmarApagar'), t('chat.apagar'))
  if (!ok) return
  deleteConversation(id)
  // Selects the most recent remaining conversation (or none).
  const remaining = (appStore.get().conversations ?? []).filter((c) => c.id !== id)
  state.activeConversationId = remaining[0]?.id ?? null
  savePanelState(state)
  render()
  notify(t('chat.apagada'))
}

function currentConversation(): Conversation | undefined {
  if (!state.activeConversationId) return undefined
  return conversationById(state.activeConversationId)
}

/** Sends the user message. */
async function send(text: string): Promise<void> {
  const conversation = currentConversation()
  if (!conversation) return
  const data: AppData = appStore.get()
  const ai = data.settings.ai
  if (!ai || ai.provider === 'nenhum' || !ai.apiKey.trim()) {
    notify(t('chat.configureIa'), 'erro')
    return
  }

  // 0. commands (/) — the logic (flags, scheduled discount and system notes)
  // lives in `notasDeComando`; the CRUDE command text goes to the history and
  // to the Fable, and the app orchestrates the action on top (mana, invocation).
  const notes = collectCommandNotes(text, data)

  // 1. push user (crude text — the command appears as typed)
  const userMsg: AiMessage = { role: 'user', content: text, ts: new Date().toISOString() }
  addMessage(conversation.id, userMsg)
  // Ensures the active conversation is the one we're editing (re-ordered by updatedAt).
  state.activeConversationId = conversation.id
  savePanelState(state)
  render()

  // 2. prepares the history for the AI — ⚠️ RE-READS the conversation AFTER the
  // push: the snapshot captured at the start does NOT have the current message
  // (addMessage recreates the object) — the AI answered without seeing what the
  // user typed (real bug: "each message starts the conversation from zero").
  const updated = currentConversation() ?? conversation
  const systemPrompt = notes.analysisRequested
    ? buildSchizoanalystSystemPrompt(data)
    : buildSystemPrompt(data)
  const history: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...updated.messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  // 3. invocation request: executes in the APP (deterministic) and informs the
  // Fable via a system message — doesn't depend on the model emitting the marker.
  const invocationRequest = detectInvocationRequest(text)
  const invocationNote = invocationRequest ? prepareInvocation(invocationRequest) : null
  if (invocationNote) history.push({ role: 'system', content: invocationNote.note })

  // 3b. notes of the (/) commands + diary mention reward — ready from the
  // notasDeComando module (the Fable reads the diary on interaction and celebrates).
  if (notes.mentionsNotice) notify(notes.mentionsNotice)
  history.push(...notes.system)

  // 4. streaming
  let response = ''
  let reasoning = ''
  busy = true
  render()
  try {
    await sendToAI(ai, history, {
      onContent: (delta) => {
        response += delta
        // In-place update (no full re-render) to avoid losing focus / lag
        const area = messagesEl
        if (!area) return
        let last = area.querySelector<HTMLElement>('.fable-bubble--assistant[data-stream="1"]')
        if (!last) {
          last = document.createElement('div')
          last.className = 'fable-bubble fable-bubble--assistant' 
          last.dataset.stream = '1'
          area.appendChild(last)
        }
        // Preserves the <details> of reasoning if it already exists; if not, builds later.
        const reasoningEl = last.querySelector<HTMLElement>('.fable-reasoning')
        // Shows without the markers ([[acao:...]] and [[carta:...]]) — streaming shows the crude text
        last.textContent = response.replace(/\[\[(?:acao|carta):[\s\S]*?\]\]/g, '')
        if (reasoningEl) last.appendChild(reasoningEl)
        area.scrollTop = area.scrollHeight
      },
      onReasoning: (delta) => {
        reasoning += delta
        // The reasoning goes into a <details> at the end of the bubble; it's
        // inserted only when the content starts (onContent callback above).
        const area = messagesEl
        if (!area) return
        const last = area.querySelector<HTMLElement>('.fable-bubble--assistant[data-stream="1"]')
        if (!last) return
        let reasoningEl = last.querySelector<HTMLElement>('.fable-reasoning')
        if (!reasoningEl) {
          const det = document.createElement('details')
          det.className = 'fable-reasoning' 
          det.open = true // visible while writing
          const sum = document.createElement('summary')
          sum.innerHTML = '<i class="fa-solid fa-brain" aria-hidden="true"></i> Raciocínio'
          const pre = document.createElement('pre')
          det.appendChild(sum)
          det.appendChild(pre)
          last.appendChild(det)
          reasoningEl = det
        }
        const pre = reasoningEl.querySelector('pre')
        if (pre) pre.textContent = reasoning
        area.scrollTop = area.scrollHeight
      },
    })
    // Response arrived: charges the commands' mana NOW (failure on return doesn't charge)
    if (notes.pendingDiscount) {
      const p = appStore.get().character
      appStore.set({ ...appStore.get(), character: { ...p, mana: p.mana - notes.pendingDiscount.cost } })
      notify(`${notes.pendingDiscount.label} (−${notes.pendingDiscount.cost} mana)`)
      playSound('analise')
      notes.pendingDiscount = null
    }
    // Empty model response (e.g. only reasoning, or silent refusal): shows an
    // error instead of saving an empty bubble (real bug 2026-08-12).
    if (!response.trim()) {
      notify(t('chat.semResposta'), 'erro')
      return
    }
    // 4. executes the Fable's actions (marker [[acao:...]]) and saves the message.
    // Rule (2026-08-12): the marker ONLY executes when the turn is the Fable's
    // CHOICE (/invocar without a name); echo of the marker after app invocation
    // or a self-emitted marker is ignored (mana intact).
    const { text: cleanText, actions } = extractActions(response)
    let finalContent = cleanText
    let cardInvokedThisTurn: string | null = invocationNote?.cardId ?? null
    for (const action of actions) {
      const exec = executeAction(action, { appAlreadyInvoked: invocationNote !== null, fableChoice: notes.fableChoice })
      if (exec.note) finalContent += `\n\n${exec.note}`
      if (exec.cardId) cardInvokedThisTurn = exec.cardId
    }
    // Ensures the card thumbnail: if there was an invocation this turn (direct
    // request OR Fable's choice) and the response didn't bring the marker,
    // appends it at the end.
    if (cardInvokedThisTurn && !finalContent.includes(`[[carta:${cardInvokedThisTurn}]]`)) {
      finalContent += `\n\n[[carta:${cardInvokedThisTurn}]]`
    }
    const assistantMsg: AiMessage = {
      role: 'assistant',
      content: finalContent,
      reasoning: reasoning || undefined,
      ts: new Date().toISOString(),
    }
    addMessage(conversation.id, assistantMsg)
  } catch (err) {
    // failure on return → does NOT charge the commands' mana
    notes.pendingDiscount = null
    const msg = err instanceof AiError ? err.message : 'Não consegui falar com a IA.'
    notify(msg, 'erro')
    if (response) {
      // Persists what arrived so the user doesn't lose it.
      const partial: AiMessage = {
        role: 'assistant',
        content: response,
        reasoning: reasoning || undefined,
        ts: new Date().toISOString(),
      }
      addMessage(conversation.id, partial)
    }
  } finally {
    busy = false
    render()
  }
}

/** Executes an action proposed by the Fable and returns the note to append + the
 *  invoked card (for the thumbnail). Rules (2026-08-12): the app is the only
 *  invocation door — the marker ONLY executes when the turn is the Fable's
 *  CHOICE (/invocar without a name, premium cost ×1.5); an echoed marker after
 *  app invocation, or self-emitted, is ignored without spending mana. */
function executeAction(
  action: AiAction,
  ctx: { appAlreadyInvoked: boolean; fableChoice: boolean },
): { note: string; cardId: string | null } {
  if (action.type !== 'invocar') return { note: '', cardId: null }
  if (ctx.appAlreadyInvoked) return { note: '', cardId: null } // marker echo — app already executed
  // Marker outside the Fable-choice turn (mention, misread request):
  // NEVER executes — mana intact, friendly warning.
  if (!ctx.fableChoice) {
    return { note: '⚡ Invocação só por pedido explícito: use "invoca a carta <nome>" ou o comando /invocar.', cardId: null }
  }
  const id = resolveCardId(action.card)
  if (!id) return { note: '⚡ Invocação não realizada: carta não encontrada.', cardId: null }
  const p = appStore.get().character
  const name = cardName(id)
  if (!p.cards.includes(id)) {
    return { note: `⚡ A carta ${name} ainda está bloqueada — não invocada.`, cardId: null }
  }
  const cost = ctx.fableChoice
    ? fableInvocationCost(cardKindById(id), p.invocations[id] ?? 0)
    : invocationCost(cardKindById(id), p.invocations[id] ?? 0)
  if (p.mana < cost) {
    return { note: `⚡ Invocação não realizada: mana insuficiente (precisa de ${cost}).`, cardId: null }
  }
  const result = invokeCard(id, cost)
  if (!result.ok) {
    return { note: `⚡ Invocação não realizada: ${result.reason ?? 'não foi possível.'}`, cardId: null }
  }
  return {
    note: `⚡ Invocação executada: ${name} (−${cost} mana)${ctx.fableChoice ? ' — escolhida pela Fábula (custo premium)' : ''}.`,
    cardId: id,
  }
}

/** Prepares the user-requested invocation: executes in the app (mana, log, toast)
 *  and returns the system note the Fable must respect in the response.
 *  cardId = effectively invoked card (for the thumbnail); null if there was no
 *  invocation (blocked/no mana/unknown). Returns null if the term isn't a known
 *  card (lets the Fable handle it). */
function prepareInvocation(term: string): { note: string; cardId: string | null } | null {
  // Article tolerance: "invoca o Ninho Enclausurado" resolves the same ("invoca a carta X")
  const id = resolveCardId(term) ?? resolveCardId(term.replace(/^(o|a|os|as)\s+/i, ''))
  if (!id) return null
  const name = cardName(id)
  const p = appStore.get().character
  if (!p.cards.includes(id)) {
    return {
      note: `O jogador pediu a carta "${name}", que ainda está BLOQUEADA. Diga que ela não se revelou ainda e desperte a curiosidade. NÃO invoque.`,
      cardId: null,
    }
  }
  const cost = invocationCost(cardKindById(id), p.invocations[id] ?? 0)
  if (p.mana < cost) {
    return {
      note: `O jogador pediu a carta "${name}" mas a mana (${p.mana}/${p.manaMax}) não cobre o custo (${cost}). Recuse com delicadeza ("guarde suas forças — amanhã a mana volta"), SEM invocar.`,
      cardId: null,
    }
  }
  const result = invokeCard(id)
  if (!result.ok) {
    return { note: `Não foi possível invocar "${name}": ${result.reason ?? 'erro desconhecido'}.`, cardId: null }
  }
  notify(`Carta invocada: ${name} (−${cost} mana)`)
  return {
    note: `A carta "${name}" FOI invocada agora (custou ${cost} mana; restam ${p.mana - cost}). Responda de forma EXTENSA e compreensiva sobre essa carta: elabore os possíveis efeitos dela na vida do jogador — o que ela torna visível, o que pode mudar na rotina dele, o que observar, como compor com ela como monstro/apoio. NÃO seja lacônico nem enigmático. Use a carta como apoio pra pergunta do jogador e devolva a pergunta a ele no fim. NÃO repita o marcador de ação; inclua sim o marcador [[carta:${id}]] (a interface mostra a miniatura).`,
    cardId: id,
  }
}

/** Called when appStore changes — re-renders to reflect external changes
 *  (e.g. the user configured the AI in another tab/window). Doesn't touch local state. */
export function reactToStoreChange(): void {
  if (panel) render()
}
