/** Diagnostic: language selector switches pt→en and re-renders (incl. icon-only nav). */
import { test, expect } from '@playwright/test'

test('DIAG: troca de idioma pt→en renderiza inglês', async ({ page }) => {
  // estado limpo (pt) — só na 1ª navegação da sessão
  await page.goto('/#/today')
  await page.evaluate(() => localStorage.setItem('esquizomon-rpg:lang', 'pt'))
  await page.reload()
  await expect(page.locator('.column h2', { hasText: 'Hábitos' }).first()).toBeVisible()

  // troca para English via config
  await page.goto('/#/settings')
  await page.locator('[data-lang-select]').selectOption('en')
  // setLang faz location.reload() e re-renderiza — espera o boot terminar
  await page.waitForTimeout(1000)

  // confere que está em inglês
  await page.goto('/#/today')
  await expect(page.locator('.column h2', { hasText: 'Habits' }).first()).toBeVisible()
  console.log('[DIAG] EN ok: coluna Habits visível')

  // ícone de settings não deve virar texto "settings" (somente-ícone)
  const gearBtn = page.locator('[data-rota="settings"]')
  await expect(gearBtn.locator('i.fa-gear')).toBeVisible()
  await expect(gearBtn).toHaveText('')
  // tooltip traduzido
  await expect(gearBtn).toHaveAttribute('title', 'Settings')
  await expect(gearBtn).toHaveAttribute('aria-label', 'Settings')
})