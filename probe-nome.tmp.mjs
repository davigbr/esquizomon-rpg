/* Probe: o nome monstruoso aparece na status bar? (desktop + mobile) */
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
  await page.waitForSelector('.status-nome')
  const estado = await page.evaluate(() => {
    const el = document.querySelector('.status-nome')
    if (!el) return { existe: false }
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      existe: true,
      texto: el.textContent,
      display: cs.display,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      temAvatar: !!document.querySelector('.status-avatar'),
    }
  })
  console.log(JSON.stringify({ viewport: viewport.width, ...estado }))
  await page.close()
}
await browser.close()