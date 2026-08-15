/* Probe: no zoom MÍNIMO, o círculo mostra a IMAGEM em toda a borda (sem fundo)? */
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5176/#/config');

// imagem retrato listrada 300x420 (vermelho/verde/azul)
const b64 = await page.evaluate(() => {
  const c = document.createElement('canvas')
  c.width = 300
  c.height = 420
  const g = c.getContext('2d')
  g.fillStyle = '#ff0000'
  g.fillRect(0, 0, 300, 140)
  g.fillStyle = '#00ff00'
  g.fillRect(0, 140, 300, 140)
  g.fillStyle = '#0000ff'
  g.fillRect(0, 280, 300, 140)
  return c.toDataURL('image/png').split(',')[1]
})

await page.locator('[data-avatar-escolher]').click()
await page.locator('[data-avatar-arquivo]').setInputFiles({
  name: 'teste.png',
  mimeType: 'image/png',
  buffer: Buffer.from(b64, 'base64'),
})
await page.waitForSelector('[data-avatar-janela]')

// leva o zoom ao MÍNIMO e amostra a borda do círculo (lado esquerdo do círculo)
const res = await page.evaluate(() => {
  const janela = document.querySelector('[data-avatar-janela]')
  const zoom = document.querySelector('[data-avatar-zoom]')
  zoom.value = zoom.min
  zoom.dispatchEvent(new Event('input'))
  zoom.dispatchEvent(new Event('change'))
  const img = document.querySelector('[data-avatar-img]')
  const jr = janela.getBoundingClientRect()
  const ir = img.getBoundingClientRect()
  // círculo inscrito: centro da janela, raio = 169.7/2 = 84.85
  const cx = jr.x + jr.width / 2
  const cy = jr.y + jr.height / 2
  const r = 84.85
  const c = document.createElement('canvas')
  c.width = jr.width
  c.height = jr.height
  const g = c.getContext('2d')
  // desenha o que está na tela dentro da janela (copia via drawWindow não existe;
  // aproxima: desenha a própria imagem com o transform)
  return {
    zoom: zoom.value,
    imgRect: { x: Math.round(ir.x), y: Math.round(ir.y), w: Math.round(ir.width), h: Math.round(ir.height) },
    janela: { x: Math.round(jr.x), y: Math.round(jr.y), w: Math.round(jr.width), h: Math.round(jr.height) },
    circ: { cx: Math.round(cx), cy: Math.round(cy), r: Math.round(r) },
  }
})
console.log(JSON.stringify(res, null, 2))
await browser.close()
