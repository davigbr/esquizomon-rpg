/** Login modal (Netlify Identity) — app-themed, without the official widget.
 *  Tabs: Entrar / Criar conta / Esqueci a senha. After authenticating, triggers
 *  the initial sync (onSessionChange). */

import { closeModal, modalBody, openModal } from './modal'
import { notify } from './toast'
import { consumeConfirmationNotice, createAccount, currentSession, login, logout, recoverPassword } from '../sync/auth'
import { onSessionChange } from '../sync/sync'
import { escapeHtml } from './util'
import { appStore } from '../stores/base'

type Mode = 'entrar' | 'criar' | 'recuperar'

/** Has real usage data saved on this device? (for the sync question) */
function hasLocalData(): boolean {
  const d = appStore.get()
  return (
    d.tasks.length > 0 ||
    (d.diary?.length ?? 0) > 0 ||
    d.log.length > 0 ||
    (d.conversations?.length ?? 0) > 0 ||
    d.character.xp > 0
  )
}

/** Asks which sync direction to persist (2026-08-12): the login found local
 *  data AND the account may have others. Recommends exporting. */
function openSyncChoice(): void {
  openModal(`
    <h2 class="login-title">Sincronizar com a conta</h2>
    <p class="login-sub">Este dispositivo tem dados salvos — e a conta pode ter outros. Qual versão deve ficar?</p>
    <p class="login-hint" login-hint--notice>⚠️ Recomendamos <strong>exportar um backup antes</strong> (Config → Exportar). Assim você não perde nada, aconteça o que acontecer.</p>
    <div class="form-actions" form-actions--column>
      <button class="btn" btn-primary data-sync-local>Manter os dados deste dispositivo</button>
      <button class="btn" data-sync-nuvem>Usar os dados da conta</button>
      <button class="btn" btn--text data-sync-cancelar>Cancelar — quero exportar antes</button>
    </div>
  `)
  const body = document.getElementById('modal-body')!
  body.querySelector('[data-sync-local]')?.addEventListener('click', () => {
    onSessionChange('local')
    notify('Seus dados deste dispositivo foram enviados para a conta.')
    closeModal()
  })
  body.querySelector('[data-sync-nuvem]')?.addEventListener('click', () => {
    onSessionChange('nuvem')
    notify('Os dados da conta foram aplicados neste dispositivo.')
    closeModal()
  })
  body.querySelector('[data-sync-cancelar]')?.addEventListener('click', () => {
    closeModal()
    notify('Sem sincronizar por ora. Exporte um backup na Config quando puder.')
  })
}

function field(label: string, type: string, name: string, autocomplete: string): string {
  return `
    <label class="login-field">
      <span>${label}</span>
      <input type="${type}" name="${name}" autocomplete="${autocomplete}" required />
    </label>`
}

export function openLoginModal(): void {
  const logged = currentSession()

  openModal(`
    <h2 class="login-title">${logged ? 'Sua conta' : 'Entrar na sua conta'}</h2>
    <p class="login-sub">A conta é opcional: guarda uma cópia dos seus dados na nuvem (sincronização). Sem ela, tudo fica só neste navegador.</p>

    ${logged ? '' : `
    <div class="login-tabs" role="tablist">
      <button type="button" class="login-tab" active data-modo="entrar">Entrar</button>
      <button type="button" class="login-tab" data-modo="criar">Criar conta</button>
    </div>

    <form class="login-form" data-form="entrar">
      ${field('E-mail', 'email', 'email', 'email')}
      ${field('Senha', 'password', 'senha', 'current-password')}
      <button type="button" class="btn" btn--text login-recover data-modo="recuperar">Esqueci a senha</button>
      <button type="submit" class="btn" btn-primary data-enviar>Entrar</button>
    </form>

    <form class="login-form" data-form="criar" hidden>
      ${field('E-mail', 'email', 'email', 'email')}
      ${field('Senha', 'password', 'senha', 'new-password')}
      <small class="login-hint">Use uma senha que você não usa em outros lugares.</small>
      <small class="login-hint" login-hint--notice>📧 Ao criar a conta, enviaremos um <strong>link de confirmação</strong> para o seu e-mail — clique nele para ativar a conta antes de entrar (confira também o spam).</small>
      <button type="submit" class="btn" btn-primary data-enviar>Criar conta</button>
    </form>

    <form class="login-form" data-form="recuperar" hidden>
      ${field('E-mail da conta', 'email', 'email', 'email')}
      <button type="submit" class="btn" btn-primary data-enviar>Enviar link de recuperação</button>
    </form>

    <p class="login-status" data-status></p>
    `}

    ${logged ? `
    <p class="login-account">Você está logado como <strong>${escapeHtml(logged.user.email)}</strong>.</p>
    <div class="form-actions">
      <button class="btn" btn--perigo data-sair>Encerrar sessão</button>
      <button class="btn" btn-primary data-fechar>Fechar</button>
    </div>` : ''}
  `)

  const body = document.getElementById('modal-body')!

  if (logged) {
    body.querySelector<HTMLButtonElement>('[data-sair]')?.addEventListener('click', async () => {
      await logout()
      onSessionChange()
      notify('Sessão encerrada — seus dados seguem salvos neste dispositivo.')
      closeModal()
    })
    body.querySelector<HTMLButtonElement>('[data-fechar]')?.addEventListener('click', () => closeModal())
    return
  }

  const forms = {
    entrar: body.querySelector<HTMLFormElement>('[data-form="entrar"]')!,
    criar: body.querySelector<HTMLFormElement>('[data-form="criar"]')!,
    recuperar: body.querySelector<HTMLFormElement>('[data-form="recuperar"]')!,
  }
  const status = body.querySelector<HTMLElement>('[data-status]')!

  const setStatus = (text: string, error = false): void => {
    status.textContent = text
    status.classList.toggle('login-status--error', error)
  }

  function showForm(m: Mode): void {
    for (const [name, form] of Object.entries(forms)) form.hidden = name !== m
    body.querySelectorAll<HTMLButtonElement>('.login-aba').forEach((b) => b.classList.toggle('active', b.dataset.modo === m))
    status.textContent = ''
  }

  body.querySelectorAll<HTMLButtonElement>('[data-modo]').forEach((b) => {
    b.addEventListener('click', () => showForm(b.dataset.modo as Mode))
  })

  // post-email-confirmation notice (link from the mail)
  const notice = consumeConfirmationNotice()
  if (notice === 'ok') setStatus('E-mail confirmado! Agora é só entrar.')
  else if (notice === 'falhou')
    setStatus('Não foi possível confirmar seu e-mail pelo link — ele pode ter expirado ou já foi usado. Use "Esqueci a senha" para receber um novo.', true)

  const disable = (b: HTMLButtonElement, text: string): void => {
    b.disabled = true
    b.textContent = text
  }
  const enable = (b: HTMLButtonElement, text: string): void => {
    b.disabled = false
    b.textContent = text
  }

  forms.entrar.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const email = (forms.entrar.elements.namedItem('email') as HTMLInputElement).value.trim()
    const password = (forms.entrar.elements.namedItem('senha') as HTMLInputElement).value
    const button = forms.entrar.querySelector<HTMLButtonElement>('[data-enviar]')!
    disable(button, 'Entrando…')
    const r = await login(email, password)
    enable(button, 'Entrar')
    if (!r.ok) return setStatus(r.reason ?? 'Falha ao entrar.', true)
    closeModal()
    if (hasLocalData()) {
      // account may already have data + this device has data → ask
      openSyncChoice()
    } else {
      onSessionChange()
      notify('Sincronização ativada — seus dados ganharam uma cópia na nuvem.')
    }
  })

  forms.criar.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const email = (forms.criar.elements.namedItem('email') as HTMLInputElement).value.trim()
    const password = (forms.criar.elements.namedItem('senha') as HTMLInputElement).value
    const button = forms.criar.querySelector<HTMLButtonElement>('[data-enviar]')!
    disable(button, 'Criando…')
    const r = await createAccount(email, password)
    enable(button, 'Criar conta')
    if (!r.ok) return setStatus(r.reason ?? 'Falha ao criar a conta.', true)
    if (r.needsConfirm) {
      showCreationSuccess(email)
      return
    }
    onSessionChange()
    notify('Conta criada e sincronização ativada!')
    closeModal()
  })

  forms.recuperar.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const email = (forms.recuperar.elements.namedItem('email') as HTMLInputElement).value.trim()
    const button = forms.recuperar.querySelector<HTMLButtonElement>('[data-enviar]')!
    disable(button, 'Enviando…')
    const r = await recoverPassword(email)
    enable(button, 'Enviar link de recuperação')
    if (!r.ok) return setStatus(r.reason ?? 'Falha ao enviar.', true)
    setStatus('Link de recuperação enviado! Confira seu e-mail.')
    showForm('entrar')
  })
}

/** Success screen after creation: the message and ONLY the close option — does
 *  NOT redirect to login (the user still needs to confirm the email). */
function showCreationSuccess(email: string): void {
  openModal(`
    <h2>Conta criada! 🎉</h2>
    <p class="login-hint">Enviamos um link de confirmação para <strong>${escapeHtml(email)}</strong>.</p>
    <p class="login-hint" login-hint--notice>Clique no link do e-mail para ativar a conta antes de entrar — ele pode levar alguns minutos para chegar (confira também o spam).</p>
    <div class="form-actions" form-actions--column>
      <button type="button" class="btn" btn-primary data-fechar-criacao>Fechar</button>
    </div>
  `)
  modalBody.querySelector<HTMLButtonElement>('[data-fechar-criacao]')?.addEventListener('click', () => closeModal())
}
