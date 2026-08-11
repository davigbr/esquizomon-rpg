/** E2E — núcleo de tarefas: criar, marcar/desmarcar com XP, hábito, filtros. */
import { test, expect } from '@playwright/test'

test('criar tarefa única, marcar (XP sobe) e desmarcar (XP reverte)', async ({ page }) => {
  await page.goto('/#/hoje')
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 0/80')

  // cria tarefa fácil (1× → +10 XP)
  await page.locator('[data-novo-tipo="unica"]').click()
  await page.locator('input[name="titulo"]').fill('Tarefa E2E')
  await page.locator('select[name="dificuldade"]').selectOption('facil')
  await page.locator('button[type="submit"]').click()

  const card = page.locator('.tarefa-card', { hasText: 'Tarefa E2E' })
  await expect(card).toBeVisible()

  // marca → XP 10/80; card some da lista (vai para concluídas)
  await card.locator('[data-alternar-unica]').click()
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 10/80')
  await expect(card).toBeHidden()

  // filtro Concluídas → card aparece; desmarca → XP reverte
  await page.locator('[data-filtro-concluidas]').click()
  const cardFeita = page.locator('.tarefa-card', { hasText: 'Tarefa E2E' })
  await expect(cardFeita).toBeVisible()
  await cardFeita.locator('[data-alternar-unica]').click()
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 0/80')
})

test('hábito: repetição positiva dá XP e registra no histórico', async ({ page }) => {
  await page.goto('/#/hoje')
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 0/80')

  await page.locator('[data-novo-tipo="habito"]').click()
  await page.locator('input[name="titulo"]').fill('Hábito E2E')
  await page.locator('select[name="dificuldade"]').selectOption('facil')
  await page.locator('button[type="submit"]').click()

  const card = page.locator('.habito-card', { hasText: 'Hábito E2E' })
  await expect(card).toBeVisible()

  // + → XP sobe
  await card.locator('[data-habito="positivo"]').click()
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 10/80')
})

test('recorrente: marca o dia no histórico e desmarca', async ({ page }) => {
  await page.goto('/#/hoje')

  await page.locator('[data-novo-tipo="recorrente"]').click()
  await page.locator('input[name="titulo"]').fill('Diária E2E')
  await page.locator('select[name="dificuldade"]').selectOption('facil')
  await page.locator('button[type="submit"]').click()

  const card = page.locator('.tarefa-card', { hasText: 'Diária E2E' })
  await expect(card).toBeVisible()
  await expect(card.locator('.tarefa-check')).not.toHaveClass(/marcado/)

  // marca → check dourado + XP
  await card.locator('[data-alternar-rec]').click()
  await expect(card.locator('.tarefa-check')).toHaveClass(/marcado/)
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 10/80')

  // desmarca → XP reverte e check volta vazio
  await card.locator('[data-alternar-rec]').click()
  await expect(card.locator('.tarefa-check')).not.toHaveClass(/marcado/)
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 0/80')
})
