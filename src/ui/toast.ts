/** Toasts — non-intrusive feedback (never native alert/confirm). */

const container = document.getElementById('toast-container')!

export function notify(msg: string, kind: 'ok' | 'erro' = 'ok'): void {
  const el = document.createElement('div')
  el.className = `toast${kind === 'erro' ? ' --error' : ''}`
  el.textContent = msg
  el.addEventListener('click', () => el.remove())
  container.appendChild(el)
  setTimeout(() => el.remove(), 4500)
}

/** Toast with HTML (e.g. card thumbnail) — msg must be already-escaped HTML where needed. */
export function notifyHtml(html: string, kind: 'ok' | 'erro' = 'ok'): void {
  const el = document.createElement('div')
  el.className = `toast${kind === 'erro' ? ' --error' : ''}`
  el.innerHTML = html
  el.addEventListener('click', () => el.remove())
  container.appendChild(el)
  setTimeout(() => el.remove(), 5500)
}

/** Toast with card thumbnails (unlock/invocation). `ids` are resolved by the deck. */
export async function notifyCards(ids: string[], text: string): Promise<void> {
  const { loadDeck } = await import('../core/baralho')
  const deck = await loadDeck().catch(() => null)
  const cards = (deck ?? []).filter((c) => ids.includes(c.id))
  const minis = cards
    .map(
      (c) =>
        `<span class="toast-carta" title="${c.name}"><img src="/images/cards/${c.id}.png" alt="${c.name}" /><em>${c.name}</em></span>`,
    )
    .join('')
  notifyHtml(`<strong>${text}</strong><span class="toast-cartas">${minis}</span>`)
}
