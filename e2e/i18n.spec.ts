/** Diagnostic: language selector switches pt→en and re-renders. */
import { test, expect } from '@playwright/test'

test('DIAG: troca de idioma pt→en renderiza inglês', async ({ page }) => {
  // garante estado limpo (pt)
  await page.addInitScript(() => localStorage.setItem('esquizomon-rpg:lang', 'pt'))
  await page.goto('/#/today')
  await expect(page.locator('.column h2', { hasText: 'Hábitos' }).first()).toBeVisible()

  // troca para English via config
  await page.goto('/#/settings')
  await page.locator('[data-lang-select]').selectOption('en')
  // setLang faz location.reload() — aguarda o recarregamento
  await page.waitForLoadState('load')

  // confere que está em inglês
  await page.goto('/#/today')
  await expect(page.locator('.column h2', { hasText: 'Habits' }).first()).toBeVisible()
  console.log('[DIAG] EN ok: coluna Habits visível')
})