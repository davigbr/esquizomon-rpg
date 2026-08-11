/** E2E — diário: criar entrada, editar markdown, autosave, preview (Ver) e persistência. */
import { test, expect } from '@playwright/test'

const TEXTO = 'linha um\nlinha dois\n\nparágrafo com **negrito** e *itálico*\n\n- item 1\n- item 2'

test('diário: cria entrada, digita markdown, autosave, Ver (preview) e reload', async ({ page }) => {
  await page.goto('/#/diario')
  await page.locator('[data-diario-novo]').click()

  const editor = page.locator('[data-diario-editor]')
  await expect(editor).toBeVisible()

  // digita markdown (textarea nativo)
  await editor.fill(TEXTO)

  // autosave (debounce 800ms) persiste o texto exato
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const d = JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')
        return d?.diario?.[0]?.texto ?? ''
      })
    })
    .toBe(TEXTO)

  // toggle Ver → preview renderiza negrito, itálico e lista
  await page.locator('[data-diario-toggle]').click()
  await expect(page.locator('[data-diario-preview] strong')).toHaveText('negrito')
  await expect(page.locator('[data-diario-preview] em')).toHaveText('itálico')
  await expect(page.locator('[data-diario-preview] li')).toHaveCount(2)
  await expect(page.locator('[data-diario-preview]')).toContainText('linha um')

  // toggle Editar → textarea de volta com foco
  await page.locator('[data-diario-toggle]').click()
  await expect(page.locator('[data-diario-editor]')).toBeVisible()

  // reload → texto persiste
  await page.reload()
  await expect(page.locator('[data-diario-editor]')).toHaveValue(TEXTO)
})

test('diário: excluir entrada com confirmação', async ({ page }) => {
  await page.goto('/#/diario')
  await page.locator('[data-diario-novo]').click()
  await page.locator('[data-diario-editor]').fill('conteúdo que será excluído')
  await expect
    .poll(async () =>
      page.evaluate(() => (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')?.diario ?? []).length),
    )
    .toBe(1)

  await page.locator('[data-diario-excluir]').click()
  await page.locator('[data-modal-confirmar]').click()

  await expect(page.locator('[data-diario-editor]')).toHaveValue('')
  await expect
    .poll(async () =>
      page.evaluate(() => (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')?.diario ?? []).length),
    )
    .toBe(0)
})
