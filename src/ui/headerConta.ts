/** Botão de conta no header: sem login mostra o ícone de nuvem; logado,
 *  mostra o e-mail (curto). Clique abre o modal de conta/login. Reage
 *  automaticamente a mudanças de sessão. */

import { inscreverSessao, sessaoAtual } from '../sync/auth'
import { abrirLoginModal } from './loginModal'
import { escapar } from './util'

/** Parte antes do "@" — curto o suficiente para o header; se ainda assim
 *  passar, o CSS corta com ellipsis. */
function emailCurto(email: string): string {
  const local = email.split('@')[0] ?? email
  return local.length <= 18 ? local : `${local.slice(0, 16)}…`
}

export function montarBotaoConta(): void {
  const btn = document.getElementById('conta-toggle')
  if (!btn) return

  const renderizar = (): void => {
    const s = sessaoAtual()
    if (s) {
      btn.innerHTML = `<span class="header-conta-email" title="${escapar(s.usuario.email)}">${escapar(emailCurto(s.usuario.email))}</span>`
      btn.title = `Conta: ${s.usuario.email}`
      btn.classList.add('logado')
    } else {
      btn.innerHTML = '<i class="fa-solid fa-cloud" aria-hidden="true"></i>'
      btn.title = 'Entrar / criar conta (sincronização opcional)'
      btn.classList.remove('logado')
    }
  }

  renderizar()
  inscreverSessao(renderizar)
  btn.addEventListener('click', () => abrirLoginModal())
}
