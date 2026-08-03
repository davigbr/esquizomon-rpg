/** Toasts — feedback não-intrusivo (nunca alert/confirm nativos). */

const container = document.getElementById('toast-container')!

export function notificar(msg: string, tipo: 'ok' | 'erro' = 'ok'): void {
  const el = document.createElement('div')
  el.className = `toast${tipo === 'erro' ? ' toast--erro' : ''}`
  el.textContent = msg
  el.addEventListener('click', () => el.remove())
  container.appendChild(el)
  setTimeout(() => el.remove(), 3200)
}
