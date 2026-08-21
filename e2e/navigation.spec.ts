/** E2E — navegação entre rotas e barra de status global. */
import { test, expect } from '@playwright/test'

test('navegação: todas as rotas abrem com conteúdo', async ({ page }) => {
  await page.goto('/#/today')
  await expect(page.locator('main h1')).toBeVisible()

  const rotas: Array<[string, RegExp]> = [
    ['sheet', /Jogo/],
    ['cards', /Cartas/],
    ['history', /Hist[óo]rico/],
    ['diary', /Di[áa]rio/],
    ['settings', /Config/],
  ]
  for (const [rota, titulo] of rotas) {
    await page.locator(`[data-rota="${rota}"]`).click()
    await expect(page).toHaveURL(new RegExp(`#/${rota}$`))
    await expect(page.locator('main h1')).toHaveText(titulo)
  }
  // volta pra Hoje
  await page.locator('[data-rota="today"]').click()
  await expect(page).toHaveURL(/\/#\/today$/)
})

test('barra de status global mostra nível, HP, XP e mana', async ({ page }) => {
  await page.goto('/#/today')
  await expect(page.locator('[data-s-nivel]')).toHaveText('Nv 1')
  await expect(page.locator('[data-s-hp]')).toHaveText('50/50')
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 0/80')
  await expect(page.locator('[data-s-mana]')).toHaveText('Mana 20/20')
})
