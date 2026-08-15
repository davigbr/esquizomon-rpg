/* Probe: nome visível no mobile (abaixo da foto) + desktop (ao lado) */
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(() => {
    const hoje = new Date().toISOString().slice(0, 10)
    localStorage.setItem('esquizomon-rpg:v1', JSON.stringify({
      versao: 6, configuracao: { tema: 'dark' },
      tarefas: [], log: [], conversas: [], diario: [],
      personagem: { nivel: 3, xp: 0, hp: 50, hpMax: 50, mana: 20, manaMax: 20, esgotado: false, ultimoDia: hoje, cartas: ['ninho-enclausurado'], invocacoes: {}, nomeMonstruoso: 'Devorador de Segundas' },
    }))
  })
  await page.goto('http://localhost:5176/#/hoje')
  await page.waitForSelector('.status-nome', { state: 'attached' })
  const nome = await page.evaluate(() => {
    const el = document.querySelector('.status-nome')
    const r = el.getBoundingClientRect()
    const avatar = document.querySelector('.status-avatar')
    const ar = avatar ? avatar.getBoundingClientRect() : null
    return {
      visivel: r.width > 0 && r.height > 0,
      texto: el.textContent,
      nome: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      avatar: ar ? { x: Math.round(ar.x), y: Math.round(ar.y), w: Math.round(ar.width), h: Math.round(ar.height) } : null,
    }
  })
  console.log(JSON.stringify({ viewport: viewport.width, ...nome }))
  await page.close()
}
await browser.close()