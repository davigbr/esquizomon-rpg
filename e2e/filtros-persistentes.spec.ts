/** E2E — FILTROS da tela Hoje (tag / dificuldade / concluídas) persistem ao
 *  RECARREGAR a página. Guardados em chave própria (`esquizomon-rpg:today-filters`),
 *  fora do blob do app — filtro é estado de VISÃO e não viaja no save/sync. */
import { expect, test } from '@playwright/test'

function isoHoje(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Semeia 2 tarefas, uma com a tag `estudo` e outra com `casa`. */
async function semear(page: import('@playwright/test').Page): Promise<void> {
  const hoje = isoHoje()
  await page.addInitScript((h) => {
    const t = (id: string, title: string, tags: string[], difficulty: string) => ({
      id, title, type: 'unica', difficulty, done: false, tags, history: [],
      createdAt: `${h}T10:00:00.000Z`, updatedAt: `${h}T10:00:00.000Z`,
    })
    localStorage.setItem(
      'esquizomon-rpg:v1',
      JSON.stringify({
        version: 4,
        tasks: [t('t1', 'Estudar', ['estudo'], 'facil'), t('t2', 'Mercado', ['casa'], 'dificil')],
        character: { level: 1, xp: 0, xpNext: 80, hp: 50, hpMax: 50, mana: 20, manaMax: 20, exhausted: false, lastDay: h, cards: [], invocations: {} },
        settings: { theme: 'dark' },
        log: [],
        conversations: [],
        diary: [],
      }),
    )
  }, hoje)
  await page.goto('/#/today')
}

const filtrosSalvos = (page: import('@playwright/test').Page): Promise<string | null> =>
  page.evaluate(() => localStorage.getItem('esquizomon-rpg:today-filters'))

test('filtro de TAG persiste no reload (chip ativo e lista filtrada)', async ({ page }) => {
  await semear(page)
  await expect(page.locator('.task-card')).toHaveCount(2)

  await page.locator('[data-filter-tag="estudo"]').click()
  await expect(page.locator('.task-card')).toHaveCount(1)
  await expect(page.locator('.task-card')).toContainText('Estudar')

  // --- reload ---
  await page.reload()
  await expect(page.locator('[data-filter-tag="estudo"]')).toHaveClass(/active/)
  await expect(page.locator('.task-card')).toHaveCount(1)
  await expect(page.locator('.task-card')).toContainText('Estudar')
  expect(JSON.parse((await filtrosSalvos(page)) ?? '{}')).toMatchObject({ tag: 'estudo' })
})

test('filtros de DIFICULDADE e CONCLUÍDAS também persistem no reload', async ({ page }) => {
  await semear(page)

  await page.locator('[data-filter-difficulty]').selectOption('facil')
  await page.locator('[data-filter-done]').click()
  await expect(page.locator('.task-card')).toHaveCount(1) // só a fácil

  await page.reload()
  await expect(page.locator('[data-filter-difficulty]')).toHaveValue('facil')
  await expect(page.locator('[data-filter-done]')).toHaveClass(/active/)
  await expect(page.locator('.task-card')).toHaveCount(1)
  expect(JSON.parse((await filtrosSalvos(page)) ?? '{}')).toMatchObject({ difficulty: 'facil', done: true })

  // limpar filtros também persiste
  await page.locator('[data-clear-filters]').click()
  await page.reload()
  await expect(page.locator('[data-filter-difficulty]')).toHaveValue('')
  await expect(page.locator('[data-filter-done]')).not.toHaveClass(/active/)
  await expect(page.locator('.task-card')).toHaveCount(2)
})

test('tag salva que não existe mais é descartada (não esvazia a tela)', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('esquizomon-rpg:today-filters', JSON.stringify({ tag: 'tag-fantasma', difficulty: '', done: false }))
  })
  await semear(page)

  await expect(page.locator('.task-card')).toHaveCount(2) // nenhum filtro aplicado
  await expect(page.locator('[data-filter-tag].active')).toHaveCount(0)
  expect(JSON.parse((await filtrosSalvos(page)) ?? '{}')).toMatchObject({ tag: null })
})
