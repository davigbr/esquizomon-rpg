/** Avatar crop editor (2026-08-12): SQUARE window with a CIRCLE mask (the crop
 *  is always circular) + drag + zoom.
 *  The visible crop is drawn onto a 128×128 canvas and compressed to JPEG —
 *  fits comfortably in localStorage and in the cloud blob. */

import { closeModal, modalBody, openModal } from './modal'
import { setAvatar } from '../stores/app'
import { notify } from './toast'

const WINDOW = 240 // px — size of the crop window (CSS)
/** Side of the square inscribed in the crop circle (what gets saved). */
const SIDE = WINDOW / Math.SQRT2
const OUTPUT = 128 // px — final avatar size
const QUALITY = 0.78

/** Opens the crop editor for the chosen file. */
export function editAvatar(file: File): void {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => openCrop(img, url)
  img.onerror = () => {
    URL.revokeObjectURL(url)
    notify('Imagem inválida — escolha outra.', 'erro')
  }
  img.src = url
}

function openCrop(img: HTMLImageElement, url: string): void {
  const W0 = img.naturalWidth
  const H0 = img.naturalHeight
  // object-fit: cover scales by the LARGER (box/source) → source→box = the SMALLER.
  // Using max here off-centered the crop in non-square photos (real bug).
  const cover = Math.min(W0 / WINDOW, H0 / WINDOW) // px of image per px of window
  const maxZoom = Math.min(4, Math.max(W0, H0) / WINDOW)
  // Min zoom = COVER of the circle: the SMALLER side of the image fills the crop
  // (never shows the window background; square touches the edges). Real bug 3
  // (2026-08-12): it was max(W0,H0) → small image in circle + background leaking.
  const sMin = Math.max(0.25, Math.min(1, (SIDE * cover) / Math.min(W0, H0)))
  const sMax = Math.max(sMin + 0.1, maxZoom)
  let s = sMin
  let dx = 0
  let dy = 0

  openModal(`
    <h2>Recortar avatar</h2>
    <p class="avatar-hint">Arraste para posicionar · use o zoom para ajustar. O corte é sempre circular.</p>
    <div class="avatar-window" data-avatar-janela>
      <img src="${url}" alt="Imagem a recortar" data-avatar-img />
      <div class="avatar-mask" aria-hidden="true"></div>
    </div>
    <div class="avatar-zoom">
      <i class="fa-solid fa-minus" aria-hidden="true"></i>
      <input type="range" min="${sMin.toFixed(2)}" max="${sMax.toFixed(2)}" step="0.01" value="${sMin.toFixed(2)}" data-avatar-zoom aria-label="Zoom do corte" />
      <i class="fa-solid fa-plus" aria-hidden="true"></i>
    </div>
    <div class="form-actions">
      <button class="btn" data-avatar-cancel>Cancelar</button>
      <button class="btn btn-primary" data-avatar-save>Salvar avatar</button>
    </div>
  `)

  const windowEl = modalBody.querySelector<HTMLElement>('[data-avatar-janela]')!
  const imgEl = modalBody.querySelector<HTMLImageElement>('[data-avatar-img]')!
  const zoom = modalBody.querySelector<HTMLInputElement>('[data-avatar-zoom]')!

  /**
   * Visible crop in the ORIGINAL image (px): the square inscribed in the circle.
   * The content is CENTERED on the element (object-fit: cover), so the visible
   * center is cx = W0/2 − (dx/s)·cover — does NOT depend on WINDOW. (Real bug 4,
   * 2026-08-12: the old formula had a spurious term (WINDOW/(2s) − WINDOW/2)
   * that, at min zoom, pushed the element ~34px and leaked the background into
   * the circle.)
   */
  const crop = (): { sx: number; sy: number; sw: number; sh: number } => {
    const sw = Math.min((SIDE / s) * cover, W0, H0)
    const sh = sw
    const cx = W0 / 2 - (dx / s) * cover
    const cy = H0 / 2 - (dy / s) * cover
    const sx = Math.min(Math.max(cx - sw / 2, 0), Math.max(0, W0 - sw))
    const sy = Math.min(Math.max(cy - sh / 2, 0), Math.max(0, H0 - sh))
    return { sx, sy, sw, sh }
  }

  const apply = (): void => {
    imgEl.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`
  }
  apply()

  // drag limits (symmetric around 0): the crop cannot leave the image
  const clamp = (): void => {
    const { sw, sh } = crop()
    const step = s / cover
    dx = Math.min(Math.max(dx, ((sw - W0) / 2) * step), ((W0 - sw) / 2) * step)
    dy = Math.min(Math.max(dy, ((sh - H0) / 2) * step), ((H0 - sh) / 2) * step)
  }

  let dragging = false
  let px0 = 0
  let py0 = 0
  windowEl.addEventListener('pointerdown', (e: PointerEvent) => {
    dragging = true
    px0 = e.clientX
    py0 = e.clientY
    windowEl.setPointerCapture(e.pointerId)
  })
  windowEl.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging) return
    dx += e.clientX - px0
    dy += e.clientY - py0
    px0 = e.clientX
    py0 = e.clientY
    clamp()
    apply()
  })
  windowEl.addEventListener('pointerup', () => {
    dragging = false
  })

  zoom.addEventListener('input', () => {
    s = Number(zoom.value)
    clamp()
    apply()
  })

  const cleanup = (): void => {
    URL.revokeObjectURL(url)
  }

  modalBody.querySelector('[data-avatar-cancel]')!.addEventListener('click', () => {
    cleanup()
    closeModal()
  })
  modalBody.querySelector('[data-avatar-save]')!.addEventListener('click', () => {
    const { sx, sy, sw, sh } = crop()
    const c = document.createElement('canvas')
    c.width = OUTPUT
    c.height = OUTPUT
    const g = c.getContext('2d')
    if (!g) {
      cleanup()
      closeModal()
      notify('Não consegui processar a imagem.', 'erro')
      return
    }
    g.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT, OUTPUT)
    const dataUrl = c.toDataURL('image/jpeg', QUALITY)
    cleanup()
    closeModal()
    setAvatar(dataUrl)
    notify('Avatar salvo!')
  })
}
