/** Generic promised modal — Escape/backdrop close; focus returned to the opener. */

const overlay = document.getElementById('modal')!
export const modalBody = document.getElementById('modal-body')!
const closeBtn = document.getElementById('modal-close')!
const origButton = document.activeElement as HTMLElement | null

export function openModal(html: string): void {
  modalBody.innerHTML = html
  overlay.hidden = false
  const first = modalBody.querySelector<HTMLElement>('[autofocus], input, select, textarea, button')
  first?.focus()
}

export function closeModal(): void {
  overlay.hidden = true
  modalBody.innerHTML = ''
  origButton?.focus()
}

closeBtn.addEventListener('click', closeModal)
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) closeModal()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !overlay.hidden) closeModal()
})

/** Promised confirmation — resolves true only if the user confirms. */
export function confirm(msg: string, label = 'Confirmar'): Promise<boolean> {
  return new Promise((resolve) => {
    const onClose = () => {
      closeModal()
      document.removeEventListener('keydown', handler)
      resolve(false)
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    openModal(`
      <h2>Confirmar</h2>
      <p style="color:var(--text-secondary);font-size:14px;margin:0 0 20px">${msg}</p>
      <div class="form-actions">
        <button class="btn" data-modal-cancelar>Cancelar</button>
        <button class="btn btn-primary" data-modal-confirmar>${label}</button>
      </div>
    `)
    modalBody.querySelector('[data-modal-confirmar]')!.addEventListener('click', () => {
      document.removeEventListener('keydown', handler)
      closeModal()
      resolve(true)
    })
    modalBody.querySelector('[data-modal-cancelar]')!.addEventListener('click', onClose)
    document.addEventListener('keydown', handler)
  })
}
