/** Account button in the header: without login shows the cloud icon; logged in,
 *  shows the PROFILE icon (the full email lives in the tooltip — the text in
 *  the button overflowed the box). Click opens the account/login modal. Reacts
 *  automatically to session changes. */

import { currentSession, subscribeSession } from '../sync/auth'
import { openLoginModal } from './loginModal'
import { escapeHtml } from './util'

export function mountAccountButton(): void {
  const btn = document.getElementById('conta-toggle')
  if (!btn) return

  const render = (): void => {
    const s = currentSession()
    if (s) {
      btn.innerHTML =
        '<i class="fa-solid fa-circle-user" aria-hidden="true"></i>'
      btn.title = `Conta: ${s.user.email}`
      btn.setAttribute('aria-label', `Conta: ${escapeHtml(s.user.email)}`)
      btn.classList.add('logged' )
    } else {
      btn.innerHTML = '<i class="fa-solid fa-cloud" aria-hidden="true"></i>'
      btn.title = 'Entrar / criar conta (sincronização opcional)'
      btn.classList.remove('logged' )
    }
  }

  render()
  subscribeSession(render)
  btn.addEventListener('click', () => openLoginModal())
}
