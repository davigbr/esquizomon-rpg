/** Modal genérico prometido — Escape/backdrop fecham; foco devolvido a quem abriu. */

const overlay = document.getElementById('modal')!
const body = document.getElementById('modal-body')!
const closeBtn = document.getElementById('modal-close')!
const botaoOriginal = document.activeElement as HTMLElement | null

export function abrirModal(html: string): void {
  body.innerHTML = html
  overlay.hidden = false
  const primeiro = body.querySelector<HTMLElement>('[autofocus], input, select, textarea, button')
  primeiro?.focus()
}

export function fecharModal(): void {
  overlay.hidden = true
  body.innerHTML = ''
  botaoOriginal?.focus()
}

closeBtn.addEventListener('click', fecharModal)
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) fecharModal()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !overlay.hidden) fecharModal()
})

/** Confirmação prometida — resolve true apenas se o usuário confirmar. */
export function confirmar(msg: string, rotulo = 'Confirmar'): Promise<boolean> {
  return new Promise((resolve) => {
    const onFechar = () => {
      fecharModal()
      document.removeEventListener('keydown', handler)
      resolve(false)
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar()
    }
    abrirModal(`
      <h2>Confirmar</h2>
      <p style="color:var(--text-secondary);font-size:14px;margin:0 0 20px">${msg}</p>
      <div class="form-acoes">
        <button class="btn" data-modal-cancelar>Cancelar</button>
        <button class="btn btn-primary" data-modal-confirmar>${rotulo}</button>
      </div>
    `)
    body.querySelector('[data-modal-confirmar]')!.addEventListener('click', () => {
      document.removeEventListener('keydown', handler)
      fecharModal()
      resolve(true)
    })
    body.querySelector('[data-modal-cancelar]')!.addEventListener('click', onFechar)
    document.addEventListener('keydown', handler)
  })
}
