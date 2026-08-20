/** E2E — conta e sincronização (Config): seção visível offline, aviso sobre
 *  dados locais, modal de login abre e falha graciosamente sem servidor. */
import { test, expect } from '@playwright/test'

test('config: seção conta mostra aviso de dados locais e status offline', async ({ page }) => {
  await page.goto('/#/config')

  // seção presente com o aviso honesto sobre dados locais
  await expect(page.locator('h3', { hasText: 'Conta e sincronização' })).toBeVisible()
  const aviso = page.locator('.settings-notice')
  await expect(aviso).toContainText('Seus dados moram neste navegador')
  await expect(aviso).toContainText('podem ser perdidos')

  // sem login: status offline e botão de entrar habilitado, sincronizar desabilitado
  await expect(page.locator('[data-sync-status]')).toHaveText('Offline — dados só neste dispositivo')
  await expect(page.locator('[data-entrar]')).toBeVisible()
  await expect(page.locator('[data-sincronizar]')).toBeDisabled()
})

test('config: modal de login abre com abas e falha graciosamente offline', async ({ page }) => {
  await page.goto('/#/config')
  await page.locator('[data-entrar]').click()

  const modal = page.locator('#modal')
  await expect(modal).toBeVisible()
  await expect(page.locator('.login-tab')).toHaveCount(2)
  await expect(page.locator('[data-form="entrar"]')).toBeVisible()
  await expect(page.locator('[data-form="criar"]')).toBeHidden()

  // troca para a aba de criar conta
  await page.locator('.login-tab[data-modo="criar"]').click()
  await expect(page.locator('[data-form="criar"]')).toBeVisible()

  // submit do login sem servidor → mensagem de erro amigável (não trava)
  await page.locator('.login-tab[data-modo="entrar"]').click()
  await page.locator('[data-form="entrar"] input[name="email"]').fill('teste@teste.com')
  await page.locator('[data-form="entrar"] input[name="senha"]').fill('senha123')
  await page.locator('[data-form="entrar"] button[type="submit"]').click()
  await expect(page.locator('[data-status]')).toContainText('Falha na autenticação')
})
