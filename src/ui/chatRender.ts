/**
 * Rendering of the chat message content: the bubble (user/assistant),
 * markdown + clickable card thumbnail, and the pure markdown for copy/paste.
 * Isolated from DOM/panel — pure functions (data → HTML/markdown).
 */
import type { AiMessage } from '../core/tipos'
import { cardName, resolveCardId } from '../core/baralho'
import { renderMarkdown } from './editorMd'
import { escapeHtml as escape } from './util'

/** The bubble of a message. */
export function bubble(m: AiMessage, idx: number): string {
  const copyBtn = `<button type="button" class="fable-copy-msg" data-fabula-copiar-msg="${idx}" title="Copiar mensagem em markdown" aria-label="Copiar mensagem em markdown"><i class="fa-solid fa-copy" aria-hidden="true"></i></button>`
  if (m.role === 'user') {
    return `<div class="fable-bubble fable-bubble--user">${copyBtn}<span class="fable-bubble-text">${escape(m.content)}</span></div>`
  }
  const reasoning = m.reasoning
    ? `<details class="fable-reasoning">
        <summary><i class="fa-solid fa-brain" aria-hidden="true"></i> Raciocínio</summary>
        <pre>${escape(m.reasoning)}</pre>
      </details>`
    : ''
  return `<div class="fable-bubble fable-bubble--assistant">${copyBtn}<span class="fable-bubble-text">${renderContent(m.content)}</span>${reasoning}</div>`
}

/** Renders the assistant bubble content: markdown + `[[carta:<id>]]`
 *  becomes the CLICKABLE thumbnail (opens the gallery modal). */
export function renderContent(content: string): string {
  const rendered = content.trim() ? renderMarkdown(content) : ''
  const withCards = rendered.replace(/\[\[carta:([\w-]+)\]\]/g, (_match, id: string) => {
    if (resolveCardId(id) !== id) return _match
    const name = cardName(id)
    return `<button type="button" class="fable-card-btn" data-fabula-carta="${escape(id)}" title="Ver carta: ${escape(name)}" aria-label="Ver carta: ${escape(name)}"><img class="fable-card" src="/images/cards/${escape(id)}.png" alt="${escape(name)}" loading="lazy" /></button>`
  })
  // a lone thumbnail inside a paragraph can't load the <p> margins
  return withCards.replace(/<p>(\s*<button class="fable-card-btn" .*?<\/button>\s*)<\/p>/gs, '$1')
}

/** Generates the markdown of ONE message to paste into any editor (Obsidian etc.).
 *  `[[carta:<id>]]` becomes the card name in italics — outside the app it makes no sense. */
export function messageToMarkdown(m: AiMessage): string {
  return m.content.replace(/\[\[carta:([\w-]+)\]\]/g, (_match, id: string) => {
    if (resolveCardId(id) !== id) return _match
    return `*${cardName(id)}*`
  })
}
