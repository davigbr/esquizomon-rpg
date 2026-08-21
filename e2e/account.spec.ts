/** E2E — conta e sincronização (Config): seção visível offline, aviso sobre
 *  dados locais, modal de login abre e falha graciosamente sem servidor. */
import { test, expect } from '@playwright/test'

test('config: seção conta mostra aviso de dados locais e status offline', async ({ page }) => {
  await page.goto('/#/settings')

  // seção presente com o aviso honesto sobre dados locais
  await expect(page.locator('h3', { hasText: 'Conta e sincronização' })).toBeVisible()
  const aviso = page.locator('.settings-notice')
  await expect(aviso).toContainText('Seus dados moram neste navegador')
  await expect(aviso).toContainText('podem ser perdidos')

  // sem login: status offline e botão de entrar habilitado, sincronizar desabilitado
  await expect(page.locator('[data-sync-status]')).toHaveText('Offline — dados só neste dispositivo')
  await expect(page.locator('[data-login]')).toBeVisible()
  await expect(page.locator('[data-syncnow]')).toBeDisabled()
})

test('config: modal de login abre com abas e falha graciosamente offline', async ({ page }) => {
  await page.goto('/#/settings')
  await page.locator('[data-login]').click()

  const modal = page.locator('#modal')
  await expect(modal).toBeVisible()
  await expect(page.locator('.login-tab')).toHaveCount(2)
  await expect(page.locator('[data-form="login"]')).toBeVisible()
  await expect(page.locator('[data-form="signup"]')).toBeHidden()

  // troca para a aba de criar conta
  await page.locator('.login-tab[data-mode="signup"]').click()
  await expect(page.locator('[data-form="signup"]')).toBeVisible()

  // submit do login sem servidor → mensagem de erro amigável (não trava)
  await page.locator('.login-tab[data-mode="login"]').click()
  await page.locator('[data-form="login"] input[name="email"]').fill('teste@teste.com')
  await page.locator('[data-form="login"] input[name="password"]').fill('senha123')
  await page.locator('[data-form="login"] button[type="submit"]').click()
  await expect(page.locator('[data-status]')).toContainText('Falha na autenticação')
})
