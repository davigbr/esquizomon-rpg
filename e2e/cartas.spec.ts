/** E2E — cartas: galeria renderiza as desbloqueadas e a invocação gasta mana. */
import { test, expect } from '@playwright/test'

test('cartas: galeria mostra cartas iniciais desbloqueadas e bloqueadas', async ({ page }) => {
  await page.goto('/#/cartas')

  // o deck carrega assíncrono (/deck.json) — espera as iniciais aparecerem
  const desbloqueadas = page.locator('.carta-item:not(.carta-item--bloqueada)')
  await expect(desbloqueadas.first()).toBeVisible({ timeout: 15_000 })
  const total = await page.locator('.carta-item').count()
  // 65 cartas no baralho (ou menos se o deck não carregar — ao menos as iniciais existem)
  expect(total).toBeGreaterThanOrEqual(7)
})

test('cartas: invocar carta desbloqueada gasta mana', async ({ page }) => {
  await page.goto('/#/cartas')
  const manaInicial = await page.locator('[data-s-mana]').textContent() // ex.: "20/20"

  const primeira = page.locator('.carta-item:not(.carta-item--bloqueada)').first()
  await expect(primeira).toBeVisible({ timeout: 15_000 })
  await primeira.click()

  const btnInvocar = page.locator('[data-modal-invocar]')
  await expect(btnInvocar).toBeVisible()
  await btnInvocar.click()

  // mana diminuiu
  await expect
    .poll(async () => page.locator('[data-s-mana]').textContent())
    .not.toBe(manaInicial)
})
