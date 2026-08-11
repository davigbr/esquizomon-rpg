/** E2E — navegação entre rotas e barra de status global. */
import { test, expect } from '@playwright/test'

test('navegação: todas as rotas abrem com conteúdo', async ({ page }) => {
  await page.goto('/#/hoje')
  await expect(page.locator('main h1')).toBeVisible()

  const rotas: Array<[string, RegExp]> = [
    ['ficha', /Jogo/],
    ['cartas', /Cartas/],
    ['historico', /Hist[óo]rico/],
    ['diario', /Di[áa]rio/],
    ['config', /Config/],
  ]
  for (const [rota, titulo] of rotas) {
    await page.locator(`[data-rota="${rota}"]`).click()
    await expect(page).toHaveURL(new RegExp(`#/${rota}$`))
    await expect(page.locator('main h1')).toHaveText(titulo)
  }
  // volta pra Hoje
  await page.locator('[data-rota="hoje"]').click()
  await expect(page).toHaveURL(/#\/hoje$/)
})

test('barra de status global mostra nível, HP, XP e mana', async ({ page }) => {
  await page.goto('/#/hoje')
  await expect(page.locator('[data-s-nivel]')).toHaveText('Nv 1')
  await expect(page.locator('[data-s-hp]')).toHaveText('50/50')
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 0/80')
  await expect(page.locator('[data-s-mana]')).toHaveText('Mana 20/20')
})
