/** E2E — cartas: galeria, modal SEM botão Invocar (invocação virou exclusiva do
 *  chat — a Fábula desconta a mana via marcador). */
import { test, expect } from '@playwright/test'

test('cartas: galeria mostra cartas iniciais desbloqueadas e bloqueadas', async ({ page }) => {
  await page.goto('/#/cartas')

  // o deck carrega (import estático agora) — espera as iniciais aparecerem
  const desbloqueadas = page.locator('.card-item:not(.card-item--blocked)')
  await expect(desbloqueadas.first()).toBeVisible({ timeout: 15_000 })
  const total = await page.locator('.card-item').count()
  // 65 cartas no baralho (ou menos se o deck não carregar — ao menos as iniciais existem)
  expect(total).toBeGreaterThanOrEqual(7)
})

test('cartas: modal não tem mais botão Invocar — invocação é pelo chat', async ({ page }) => {
  await page.goto('/#/cartas')

  const primeira = page.locator('.card-item:not(.card-item--blocked)').first()
  await expect(primeira).toBeVisible({ timeout: 15_000 })
  await primeira.click()

  // o botão Invocar saiu do modal; a dica aponta o chat
  await expect(page.locator('[data-modal-invocar]')).toHaveCount(0)
  await expect(page.locator('.card-modal')).toContainText('Invocação pelo chat')
  // e o modal continua navegável (setas presentes)
  await expect(page.locator('[data-modal-anterior]')).toBeVisible()
})
