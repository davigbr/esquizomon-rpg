/** Toasts — feedback não-intrusivo (nunca alert/confirm nativos). */

const container = document.getElementById('toast-container')!

export function notificar(msg: string, tipo: 'ok' | 'erro' = 'ok'): void {
  const el = document.createElement('div')
  el.className = `toast${tipo === 'erro' ? ' toast--erro' : ''}`
  el.textContent = msg
  el.addEventListener('click', () => el.remove())
  container.appendChild(el)
  setTimeout(() => el.remove(), 4500)
}

/** Toast com HTML (ex.: miniatura de carta) — msg deve ser HTML já escapado onde necessário. */
export function notificarHtml(html: string, tipo: 'ok' | 'erro' = 'ok'): void {
  const el = document.createElement('div')
  el.className = `toast${tipo === 'erro' ? ' toast--erro' : ''}`
  el.innerHTML = html
  el.addEventListener('click', () => el.remove())
  container.appendChild(el)
  setTimeout(() => el.remove(), 5500)
}

/** Toast com miniaturas das cartas (desbloqueio/invocação). `ids` são resolvidos pelo deck. */
export async function notificarCartas(ids: string[], texto: string): Promise<void> {
  const { carregarDeck } = await import('../core/baralho')
  const deck = await carregarDeck().catch(() => null)
  const cartas = (deck ?? []).filter((c) => ids.includes(c.id))
  const minis = cartas
    .map(
      (c) =>
        `<span class="toast-carta" title="${c.name}"><img src="/images/cards/${c.id}.png" alt="${c.name}" /><em>${c.name}</em></span>`,
    )
    .join('')
  notificarHtml(`<strong>${texto}</strong><span class="toast-cartas">${minis}</span>`)
}
