/** Botão de conta no header: sem login mostra o ícone de nuvem; logado,
 *  mostra o ícone de PERFIL (o e-mail completo fica no tooltip — texto no
 *  botão estourava a caixa). Clique abre o modal de conta/login. Reage
 *  automaticamente a mudanças de sessão. */

import { inscreverSessao, sessaoAtual } from '../sync/auth'
import { abrirLoginModal } from './loginModal'
import { escapar } from './util'

export function montarBotaoConta(): void {
  const btn = document.getElementById('conta-toggle')
  if (!btn) return

  const renderizar = (): void => {
    const s = sessaoAtual()
    if (s) {
      btn.innerHTML =
        '<i class="fa-solid fa-circle-user" aria-hidden="true"></i>'
      btn.title = `Conta: ${s.usuario.email}`
      btn.setAttribute('aria-label', `Conta: ${escapar(s.usuario.email)}`)
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
