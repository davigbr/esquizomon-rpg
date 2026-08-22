/** Login modal (Netlify Identity) — app-themed, without the official widget.
 *  Tabs: Entrar / Criar conta / Esqueci a senha. After authenticating, triggers
 *  the initial sync (onSessionChange). */

import { closeModal, modalBody, openModal } from './modal'
import { notify } from './toast'
import { consumeConfirmationNotice, createAccount, currentSession, login, logout, recoverPassword } from '../sync/auth'
import { onSessionChange } from '../sync/sync'
import { escapeHtml } from './util'
import { appStore } from '../stores/base'
import { t } from '../i18n'

type Mode = 'login' | 'signup' | 'recover'

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
    <h2 class="login-title">${t('login.syncTitle')}</h2>
    <p class="login-sub">${t('login.syncSub')}</p>
    <p class="login-hint login-hint--notice">${t('login.syncRecomm')}</p>
    <div class="form-actions form-actions--column">
      <button class="btn btn-primary" data-sync-local>${t('login.syncKeepLocal')}</button>
      <button class="btn" data-sync-cloud>${t('login.syncUseAccount')}</button>
      <button class="btn btn--text" data-sync-cancel>${t('login.syncCancel')}</button>
    </div>
  `)
  const body = document.getElementById('modal-body')!
  body.querySelector('[data-sync-local]')?.addEventListener('click', () => {
    onSessionChange('local')
    notify(t('login.sentLocal'))
    closeModal()
  })
  body.querySelector('[data-sync-cloud]')?.addEventListener('click', () => {
    onSessionChange('nuvem')
    notify(t('login.appliedAccount'))
    closeModal()
  })
  body.querySelector('[data-sync-cancel]')?.addEventListener('click', () => {
    closeModal()
    notify(t('login.noSync'))
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
    <h2 class="login-title">${logged ? t('login.yourAccount') : t('login.login')}</h2>
    <p class="login-sub">${t('login.sub')}</p>

    ${logged ? '' : `
    <div class="login-tabs" role="tablist">
      <button type="button" class="login-tab active" data-mode="login">${t('login.login')}</button>
      <button type="button" class="login-tab" data-mode="signup">${t('login.createAccount')}</button>
    </div>

    <form class="login-form" data-form="login">
      ${field(t('login.emailLabel'), 'email', 'email', 'email')}
      ${field(t('login.passwordLabel'), 'password', 'password', 'current-password')}
      <button type="button" class="btn btn--text login-recover" data-mode="recover">${t('login.forgot')}</button>
      <button type="submit" class="btn btn-primary" data-submit>${t('login.login')}</button>
    </form>

    <form class="login-form" data-form="signup" hidden>
      ${field(t('login.emailLabel'), 'email', 'email', 'email')}
      ${field(t('login.passwordLabel'), 'password', 'password', 'new-password')}
      <small class="login-hint">${t('login.passwordHint')}</small>
      <small class="login-hint login-hint--notice">${t('login.confirmHint')}</small>
      <button type="submit" class="btn btn-primary" data-submit>${t('login.createAccount')}</button>
    </form>

    <form class="login-form" data-form="recover" hidden>
      ${field(t('login.accountEmailLabel'), 'email', 'email', 'email')}
      <button type="submit" class="btn btn-primary" data-submit>${t('login.sendLink')}</button>
    </form>

    <p class="login-status" data-status></p>
    `}

    ${logged ? `
    <p class="login-account">${t('login.loggedInAs')} <strong>${escapeHtml(logged.user.email)}</strong>.</p>
    <div class="form-actions">
      <button class="btn btn--perigo" data-logout>${t('login.endSession')}</button>
      <button class="btn btn-primary" data-close>${t('login.close')}</button>
    </div>` : ''}
  `)

  const body = document.getElementById('modal-body')!

  if (logged) {
    body.querySelector<HTMLButtonElement>('[data-logout]')?.addEventListener('click', async () => {
      await logout()
      onSessionChange()
      notify(t('login.sessionEnded'))
      closeModal()
    })
    body.querySelector<HTMLButtonElement>('[data-close]')?.addEventListener('click', () => closeModal())
    return
  }

  const forms = {
    login: body.querySelector<HTMLFormElement>('[data-form="login"]')!,
    signup: body.querySelector<HTMLFormElement>('[data-form="signup"]')!,
    recover: body.querySelector<HTMLFormElement>('[data-form="recover"]')!,
  }
  const status = body.querySelector<HTMLElement>('[data-status]')!

  const setStatus = (text: string, error = false): void => {
    status.textContent = text
    status.classList.toggle('login-status--error' , error)
  }

  function showForm(m: Mode): void {
    for (const [name, form] of Object.entries(forms)) form.hidden = name !== m
    body.querySelectorAll<HTMLButtonElement>('.login-tab').forEach((b) => b.classList.toggle('active' , b.dataset.mode === m))
    status.textContent = ''
  }

  body.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
    b.addEventListener('click', () => showForm(b.dataset.mode as Mode))
  })

  // post-email-confirmation notice (link from the mail)
  const notice = consumeConfirmationNotice()
  if (notice === 'ok') setStatus(t('login.emailConfirmed'))
  else if (notice === 'falhou')
    setStatus(t('login.confirmFailed'), true)

  const disable = (b: HTMLButtonElement, text: string): void => {
    b.disabled = true
    b.textContent = text
  }
  const enable = (b: HTMLButtonElement, text: string): void => {
    b.disabled = false
    b.textContent = text
  }

  forms.login.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const email = (forms.login.elements.namedItem('email') as HTMLInputElement).value.trim()
    const password = (forms.login.elements.namedItem('password') as HTMLInputElement).value
    const button = forms.login.querySelector<HTMLButtonElement>('[data-submit]')!
    disable(button, t('login.loggingIn'))
    const r = await login(email, password)
    enable(button, t('login.login'))
    if (!r.ok) return setStatus(r.reason ?? t('login.loginFailed'), true)
    closeModal()
    if (hasLocalData()) {
      // account may already have data + this device has data → ask
      openSyncChoice()
    } else {
      onSessionChange()
      notify(t('login.syncActivated'))
    }
  })

  forms.signup.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const email = (forms.signup.elements.namedItem('email') as HTMLInputElement).value.trim()
    const password = (forms.signup.elements.namedItem('password') as HTMLInputElement).value
    const button = forms.signup.querySelector<HTMLButtonElement>('[data-submit]')!
    disable(button, t('login.creating'))
    const r = await createAccount(email, password)
    enable(button, t('login.createAccount'))
    if (!r.ok) return setStatus(r.reason ?? t('login.createFailed'), true)
    if (r.needsConfirm) {
      showCreationSuccess(email)
      return
    }
    onSessionChange()
    notify(t('login.accountCreatedSync'))
    closeModal()
  })

  forms.recover.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const email = (forms.recover.elements.namedItem('email') as HTMLInputElement).value.trim()
    const button = forms.recover.querySelector<HTMLButtonElement>('[data-submit]')!
    disable(button, t('login.sending'))
    const r = await recoverPassword(email)
    enable(button, t('login.sendLink'))
    if (!r.ok) return setStatus(r.reason ?? t('login.sendFailed'), true)
    setStatus(t('login.linkSent'))
    showForm('login')
  })
}

/** Success screen after creation: the message and ONLY the close option — does
 *  NOT redirect to login (the user still needs to confirm the email). */
function showCreationSuccess(email: string): void {
  openModal(`
    <h2>${t('login.accountCreated')}</h2>
    <p class="login-hint">${t('login.weSentLink')} <strong>${escapeHtml(email)}</strong>.</p>
    <p class="login-hint login-hint--notice">${t('login.clickLink')}</p>
    <div class="form-actions form-actions--column">
      <button type="button" class="btn btn-primary" data-close-create>${t('login.close')}</button>
    </div>
  `)
  modalBody.querySelector<HTMLButtonElement>('[data-close-create]')?.addEventListener('click', () => closeModal())
}
