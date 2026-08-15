/** Editor de corte de avatar (2026-08-12): janela QUADRADA com máscara de
 *  CÍRCULO (o recorte é sempre circular) + arrastar + zoom.
 *  O recorte visível é desenhado num canvas 128×128 e comprimido em JPEG —
 *  cabe folgado no localStorage e no blob da nuvem. */

import { abrirModal, fecharModal, modalBody } from './modal'
import { definirAvatar } from '../stores/app'
import { notificar } from './toast'

const JANELA = 240 // px — tamanho da janela de corte (CSS)
/** Lado do quadrado inscrito no círculo de corte (o que é salvo). */
const LADO = JANELA / Math.SQRT2
const SAIDA = 128 // px — tamanho final do avatar
const QUALIDADE = 0.78

/** Abre o editor de corte para o arquivo escolhido. */
export function editarAvatar(arquivo: File): void {
  const url = URL.createObjectURL(arquivo)
  const img = new Image()
  img.onload = () => abrirCorte(img, url)
  img.onerror = () => {
    URL.revokeObjectURL(url)
    notificar('Imagem inválida — escolha outra.', 'erro')
  }
  img.src = url
}

function abrirCorte(img: HTMLImageElement, url: string): void {
  const W0 = img.naturalWidth
  const H0 = img.naturalHeight
  // object-fit: cover escala pelo MAIOR (box/source) → source→box = o MENOR.
  // Usar max aqui descentralizava o recorte em fotos não-quadradas (bug real).
  const cover = Math.min(W0 / JANELA, H0 / JANELA) // px de imagem por px de janela
  const maxZoom = Math.min(4, Math.max(W0, H0) / JANELA)
  // Zoom mínimo = COVER do círculo: o lado MENOR da imagem preenche o recorte
  // (nunca mostra o fundo da janela; quadrada encosta nas bordas). Bug real 3
  // (2026-08-12): era max(W0,H0) → imagem pequena no círculo + fundo vazando.
  const sMin = Math.max(0.25, Math.min(1, (LADO * cover) / Math.min(W0, H0)))
  const sMax = Math.max(sMin + 0.1, maxZoom)
  let s = sMin
  let dx = 0
  let dy = 0

  abrirModal(`
    <h2>Recortar avatar</h2>
    <p class="avatar-dica">Arraste para posicionar · use o zoom para ajustar. O corte é sempre circular.</p>
    <div class="avatar-janela" data-avatar-janela>
      <img src="${url}" alt="Imagem a recortar" data-avatar-img />
      <div class="avatar-mascara" aria-hidden="true"></div>
    </div>
    <div class="avatar-zoom">
      <i class="fa-solid fa-minus" aria-hidden="true"></i>
      <input type="range" min="${sMin.toFixed(2)}" max="${sMax.toFixed(2)}" step="0.01" value="${sMin.toFixed(2)}" data-avatar-zoom aria-label="Zoom do corte" />
      <i class="fa-solid fa-plus" aria-hidden="true"></i>
    </div>
    <div class="form-acoes">
      <button class="btn" data-avatar-cancelar>Cancelar</button>
      <button class="btn btn-primary" data-avatar-salvar>Salvar avatar</button>
    </div>
  `)

  const janela = modalBody.querySelector<HTMLElement>('[data-avatar-janela]')!
  const imgel = modalBody.querySelector<HTMLImageElement>('[data-avatar-img]')!
  const zoom = modalBody.querySelector<HTMLInputElement>('[data-avatar-zoom]')!

  /**
   * Recorte visível na imagem ORIGINAL (px): o quadrado inscrito no círculo.
   * O conteúdo é CENTRALIZADO no elemento (object-fit: cover), então o centro
   * visível é cx = W0/2 − (dx/s)·cover — NÃO depende de JANELA. (Bug real 4,
   * 2026-08-12: a fórmula antiga tinha um termo espúrio (JANELA/(2s) − JANELA/2)
   * que, no zoom mínimo, empurrava o elemento ~34px e vazava o fundo no círculo.)
   */
  const recorte = (): { sx: number; sy: number; sw: number; sh: number } => {
    const sw = Math.min((LADO / s) * cover, W0, H0)
    const sh = sw
    const cx = W0 / 2 - (dx / s) * cover
    const cy = H0 / 2 - (dy / s) * cover
    const sx = Math.min(Math.max(cx - sw / 2, 0), Math.max(0, W0 - sw))
    const sy = Math.min(Math.max(cy - sh / 2, 0), Math.max(0, H0 - sh))
    return { sx, sy, sw, sh }
  }

  const aplicar = (): void => {
    imgel.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`
  }
  aplicar()

  // limites do arrasto (simétricos em 0): o recorte não pode sair da imagem
  const limitar = (): void => {
    const { sw, sh } = recorte()
    const passo = s / cover
    dx = Math.min(Math.max(dx, ((sw - W0) / 2) * passo), ((W0 - sw) / 2) * passo)
    dy = Math.min(Math.max(dy, ((sh - H0) / 2) * passo), ((H0 - sh) / 2) * passo)
  }

  let arrastando = false
  let px0 = 0
  let py0 = 0
  janela.addEventListener('pointerdown', (e: PointerEvent) => {
    arrastando = true
    px0 = e.clientX
    py0 = e.clientY
    janela.setPointerCapture(e.pointerId)
  })
  janela.addEventListener('pointermove', (e: PointerEvent) => {
    if (!arrastando) return
    dx += e.clientX - px0
    dy += e.clientY - py0
    px0 = e.clientX
    py0 = e.clientY
    limitar()
    aplicar()
  })
  janela.addEventListener('pointerup', () => {
    arrastando = false
  })

  zoom.addEventListener('input', () => {
    s = Number(zoom.value)
    limitar()
    aplicar()
  })

  const limpar = (): void => {
    URL.revokeObjectURL(url)
  }

  modalBody.querySelector('[data-avatar-cancelar]')!.addEventListener('click', () => {
    limpar()
    fecharModal()
  })
  modalBody.querySelector('[data-avatar-salvar]')!.addEventListener('click', () => {
    const { sx, sy, sw, sh } = recorte()
    const c = document.createElement('canvas')
    c.width = SAIDA
    c.height = SAIDA
    const g = c.getContext('2d')
    if (!g) {
      limpar()
      fecharModal()
      notificar('Não consegui processar a imagem.', 'erro')
      return
    }
    g.drawImage(img, sx, sy, sw, sh, 0, 0, SAIDA, SAIDA)
    const dataUrl = c.toDataURL('image/jpeg', QUALIDADE)
    limpar()
    fecharModal()
    definirAvatar(dataUrl)
    notificar('Avatar salvo!')
  })
}
