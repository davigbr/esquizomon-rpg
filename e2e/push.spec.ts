/** E2E — notificações (push) e instalação (Configurações): seção presente,
 *  estado em dev (só PROD tem push), inputs de horário ocultos até ativar,
 *  e botão de instalação não aparece sem beforeinstallprompt (dev). */
import { test, expect } from '@playwright/test'

test('config: seção de notificações e instalação renderiza com aviso local-first', async ({ page }) => {
  await page.goto('/#/settings')

  await expect(page.locator('h3', { hasText: 'Notificações e instalação' })).toBeVisible()

  // aviso honesto: dados não vão pro servidor (classe própria, não colide com .settings-notice)
  const aviso = page.locator('.push-notice')
  await expect(aviso).toContainText('nunca o conteúdo das suas tarefas')

  // botão de instalar o PWA escondido por padrão em dev (sem beforeinstallprompt)
  await expect(page.locator('[data-pwa-install]')).toBeHidden()

  // horários do lembrete: 3 inputs de time, escondidos enquanto notificações desativadas
  await expect(page.locator('[data-push-horario]')).toHaveCount(3)
  await expect(page.locator('[data-push-horarios-wrap]')).toBeHidden()

  // estado em dev: avisa que push só funciona na versão publicada e esconde a ação
  await expect(page.locator('[data-push-status]')).toContainText('versão publicada')
  await expect(page.locator('[data-push-action]')).toBeHidden()
})

test('config: seção notificações não esconde a seção de conta (classes não colidem)', async ({ page }) => {
  await page.goto('/#/settings')

  // o aviso da conta continua sendo o ÚNICO .settings-notice da tela (estrito)
  const notices = page.locator('.settings-notice')
  await expect(notices).toHaveCount(1)
  await expect(page.locator('[data-sync-status]')).toBeVisible()
})