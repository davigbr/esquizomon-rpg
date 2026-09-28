/** Horizontal swipe navigation between tabs (mobile): swipe LEFT = next tab,
 *  swipe RIGHT = previous tab (Hoje → Diário → Cartas → Jogo → Histórico).
 *  Guards: modal aberto, chat da Fábula aberto, overlay de morte e gestos
 *  dominantemente verticais (deixa o scroll da página agir). */

const ORDER = ['today', 'diary', 'cards', 'sheet', 'history'] as const

/** Distância horizontal mínima para virar swipe (px). */
const SWIPE_DX = 64
/** O gesto precisa ser claramente horizontal (dx > 1.6×|dy|). */
const RATIO = 1.6
/** Arrastar lento demais não conta como swipe (ms). */
const MAX_DURATION = 600

export function installSwipeNavigation(getCurrent: () => string): void {
  let x0 = 0
  let y0 = 0
  let t0 = 0
  let tracking = false

  document.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1 || blocked()) {
        tracking = false
        return
      }
      x0 = e.touches[0].clientX
      y0 = e.touches[0].clientY
      t0 = performance.now()
      tracking = true
    },
    { passive: true },
  )

  document.addEventListener(
    'touchmove',
    (e) => {
      if (!tracking) return
      const dy = e.touches[0].clientY - y0
      const dx = e.touches[0].clientX - x0
      // movimento claramente vertical → deixa o scroll agir (não é swipe)
      if (Math.abs(dy) > 24 && Math.abs(dy) > Math.abs(dx)) tracking = false
    },
    { passive: true },
  )

  document.addEventListener(
    'touchend',
    (e) => {
      if (!tracking) return
      tracking = false
      const t = e.changedTouches[0]
      const dx = t.clientX - x0
      const dy = t.clientY - y0
      if (Math.abs(dx) < SWIPE_DX) return
      if (Math.abs(dx) < Math.abs(dy) * RATIO) return
      if (performance.now() - t0 > MAX_DURATION) return
      const next = ORDER[ORDER.indexOf(getCurrent() as (typeof ORDER)[number]) + (dx < 0 ? 1 : -1)]
      if (!next) return
      if (location.hash === `#/${next}`) return
      location.hash = `#/${next}`
    },
    { passive: true },
  )
}

/** Não navega por swipe quando uma camada modal está por cima. */
function blocked(): boolean {
  const modal = document.getElementById('modal')
  if (modal && !modal.hidden) return true
  const morte = document.getElementById('morte-overlay')
  if (morte && !morte.hidden) return true
  if (document.body.classList.contains('fable-open')) return true
  return false
}