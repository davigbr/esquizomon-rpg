/** Route-change transition: when the tab SWITCHES (by swipe, nav link or
 *  hash), the new view enters with a directional slide+fade — the direction
 *  derives from the TAB ORDER (Hoje → Diário → Cartas → Jogo → Histórico), so
 *  swiping left, clicking the next link or swiping right all animate the right
 *  way. Data-driven re-renders (autosave, sync, XP) never animate — only real
 *  route changes fire hashchange. Also clears any swipe-drag transform. */

const ORDER = ['today', 'diary', 'cards', 'sheet', 'history'] as const

/** `route-in-next`: a próxima aba entra vindo da DIREITA (avanço).
 *  `route-in-prev`: a anterior entra vindo da ESQUERDA (volta). */
export function installRouteTransition(getCurrent: () => string): void {
  const app = () => document.getElementById('app')
  let prev = getCurrent()

  window.addEventListener('hashchange', () => {
    const next = getCurrent()
    // limpa o rastro do arrasto do swipe (transform inline) em qualquer troca
    const el = app()
    if (el) {
      el.style.transition = ''
      el.style.transform = ''
    }
    if (next === prev) return
    const delta = deltaRoute(prev, next)
    prev = next
    if (!delta || delta === 0) return
    if (!el) return
    el.classList.remove('route-in-next', 'route-in-prev')
    void el.offsetWidth // reinicia a animação se a classe já estava lá
    el.classList.add(delta > 0 ? 'route-in-next' : 'route-in-prev')
  })
}

/** +1 = avanço na ordem, −1 = volta, null = fora da cadeia (ex.: settings). */
function deltaRoute(a: string, b: string): number | null {
  const ia = ORDER.indexOf(a as (typeof ORDER)[number])
  const ib = ORDER.indexOf(b as (typeof ORDER)[number])
  if (ia === -1 || ib === -1) return null
  return Math.sign(ib - ia)
}