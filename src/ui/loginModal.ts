/** Modal de login (Netlify Identity) — tema do app, sem o widget oficial.
 *  Abas: Entrar / Criar conta / Esqueci a senha. Após autenticar, dispara a
 *  sincronização inicial (aposMudancaSessao). */

import { abrirModal, fecharModal } from './modal'
import { notificar } from './toast'
import { consumirAvisoConfirmacao, criarConta, login, recuperarSenha, sair, sessaoAtual } from '../sync/auth'
import { aposMudancaSessao } from '../sync/sync'
import { escapar } from './util'

type Modo = 'entrar' | 'criar' | 'recuperar'

function campo(label: string, tipo: string, nome: string, autocomplete: string): string {
  return `
    <label class="login-campo">
      <span>${label}</span>
      <input type="${tipo}" name="${nome}" autocomplete="${autocomplete}" required />
    </label>`
}

export function abrirLoginModal(): void {
  const jaLogado = sessaoAtual()

  abrirModal(`
    <h2 class="login-titulo">${jaLogado ? 'Sua conta' : 'Entrar na sua conta'}</h2>
    <p class="login-sub">A conta é opcional: guarda uma cópia dos seus dados na nuvem (sincronização). Sem ela, tudo fica só neste navegador.</p>

    ${jaLogado ? '' : `
    <div class="login-abas" role="tablist">
      <button type="button" class="login-aba ativa" data-modo="entrar">Entrar</button>
      <button type="button" class="login-aba" data-modo="criar">Criar conta</button>
    </div>

    <form class="login-form" data-form="entrar">
      ${campo('E-mail', 'email', 'email', 'email')}
      ${campo('Senha', 'password', 'senha', 'current-password')}
      <button type="button" class="btn btn--texto login-recuperar" data-modo="recuperar">Esqueci a senha</button>
      <button type="submit" class="btn btn-primary" data-enviar>Entrar</button>
    </form>

    <form class="login-form" data-form="criar" hidden>
      ${campo('E-mail', 'email', 'email', 'email')}
      ${campo('Senha', 'password', 'senha', 'new-password')}
      <small class="login-dica">Use uma senha que você não usa em outros lugares.</small>
      <button type="submit" class="btn btn-primary" data-enviar>Criar conta</button>
    </form>

    <form class="login-form" data-form="recuperar" hidden>
      ${campo('E-mail da conta', 'email', 'email', 'email')}
      <button type="submit" class="btn btn-primary" data-enviar>Enviar link de recuperação</button>
    </form>

    <p class="login-status" data-status></p>
    `}

    ${jaLogado ? `
    <p class="login-conta">Você está logado como <strong>${escapar(jaLogado.usuario.email)}</strong>.</p>
    <div class="form-acoes">
      <button class="btn btn--perigo" data-sair>Encerrar sessão</button>
      <button class="btn btn-primary" data-fechar>Fechar</button>
    </div>` : ''}
  `)

  const body = document.getElementById('modal-body')!

  if (jaLogado) {
    body.querySelector<HTMLButtonElement>('[data-sair]')?.addEventListener('click', async () => {
      await sair()
      aposMudancaSessao()
      notificar('Sessão encerrada — seus dados seguem salvos neste dispositivo.')
      fecharModal()
    })
    body.querySelector<HTMLButtonElement>('[data-fechar]')?.addEventListener('click', () => fecharModal())
    return
  }

  const forms = {
    entrar: body.querySelector<HTMLFormElement>('[data-form="entrar"]')!,
    criar: body.querySelector<HTMLFormElement>('[data-form="criar"]')!,
    recuperar: body.querySelector<HTMLFormElement>('[data-form="recuperar"]')!,
  }
  const status = body.querySelector<HTMLElement>('[data-status]')!

  const avisar = (texto: string, erro = false): void => {
    status.textContent = texto
    status.classList.toggle('login-status--erro', erro)
  }

  function mostrarFormulario(m: Modo): void {
    for (const [nome, form] of Object.entries(forms)) form.hidden = nome !== m
    body.querySelectorAll<HTMLButtonElement>('.login-aba').forEach((b) => b.classList.toggle('ativa', b.dataset.modo === m))
    status.textContent = ''
  }

  body.querySelectorAll<HTMLButtonElement>('[data-modo]').forEach((b) => {
    b.addEventListener('click', () => mostrarFormulario(b.dataset.modo as Modo))
  })

  // aviso pós-confirmação de email (link do correio)
  if (consumirAvisoConfirmacao()) avisar('E-mail confirmado! Agora é só entrar.')

  const ocupar = (b: HTMLButtonElement, texto: string): void => {
    b.disabled = true
    b.textContent = texto
  }
  const liberar = (b: HTMLButtonElement, texto: string): void => {
    b.disabled = false
    b.textContent = texto
  }

  forms.entrar.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const email = (forms.entrar.elements.namedItem('email') as HTMLInputElement).value.trim()
    const senha = (forms.entrar.elements.namedItem('senha') as HTMLInputElement).value
    const botao = forms.entrar.querySelector<HTMLButtonElement>('[data-enviar]')!
    ocupar(botao, 'Entrando…')
    const r = await login(email, senha)
    liberar(botao, 'Entrar')
    if (!r.ok) return avisar(r.motivo ?? 'Falha ao entrar.', true)
    aposMudancaSessao()
    notificar('Sincronização ativada — seus dados ganharam uma cópia na nuvem.')
    fecharModal()
  })

  forms.criar.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const email = (forms.criar.elements.namedItem('email') as HTMLInputElement).value.trim()
    const senha = (forms.criar.elements.namedItem('senha') as HTMLInputElement).value
    const botao = forms.criar.querySelector<HTMLButtonElement>('[data-enviar]')!
    ocupar(botao, 'Criando…')
    const r = await criarConta(email, senha)
    liberar(botao, 'Criar conta')
    if (!r.ok) return avisar(r.motivo ?? 'Falha ao criar a conta.', true)
    if (r.precisaConfirmar) {
      avisar('Conta criada! Confirme seu e-mail pelo link que enviamos para entrar.')
      mostrarFormulario('entrar')
      return
    }
    aposMudancaSessao()
    notificar('Conta criada e sincronização ativada!')
    fecharModal()
  })

  forms.recuperar.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const email = (forms.recuperar.elements.namedItem('email') as HTMLInputElement).value.trim()
    const botao = forms.recuperar.querySelector<HTMLButtonElement>('[data-enviar]')!
    ocupar(botao, 'Enviando…')
    const r = await recuperarSenha(email)
    liberar(botao, 'Enviar link de recuperação')
    if (!r.ok) return avisar(r.motivo ?? 'Falha ao enviar.', true)
    avisar('Link de recuperação enviado! Confira seu e-mail.')
    mostrarFormulario('entrar')
  })
}
