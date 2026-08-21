/** E2E — diário: criar entrada, editar markdown, autosave, preview (Ver), persistência e import em massa. */
import { test, expect } from '@playwright/test'

const TEXTO = 'linha um\nlinha dois\n\nparágrafo com **negrito** e *itálico*\n\n- item 1\n- item 2'

/** Data LOCAL (YYYY-MM-DD) — o app usa datas locais; toISOString() é UTC e
 *  troca o dia à noite em fusos negativos (flakiness real 2026-08-12). */
function dataLocal(offsetDias = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const hoje = dataLocal()
const ontem = dataLocal(-1)

test('diário: cria entrada, digita markdown, autosave, Ver (preview) e reload', async ({ page }) => {
  await page.goto('/#/diario')
  await page.locator('[data-dayry-new]').click()

  const editor = page.locator('[data-dayry-editor]')
  await expect(editor).toBeVisible()

  // digita markdown (textarea nativo)
  await editor.fill(TEXTO)

  // autosave (debounce 800ms) persiste o texto exato
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const d = JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')
        return d?.diary?.[0]?.text ?? ''
      })
    })
    .toBe(TEXTO)

  // toggle Ver → preview renderiza negrito, itálico e lista
  await page.locator('[data-dayry-toggle]').click()
  await expect(page.locator('[data-dayry-preview] strong')).toHaveText('negrito')
  await expect(page.locator('[data-dayry-preview] em')).toHaveText('itálico')
  await expect(page.locator('[data-dayry-preview] li')).toHaveCount(2)
  await expect(page.locator('[data-dayry-preview]')).toContainText('linha um')

  // toggle Editar → textarea de volta com foco
  await page.locator('[data-dayry-toggle]').click()
  await expect(page.locator('[data-dayry-editor]')).toBeVisible()

  // reload → texto persiste
  await page.reload()
  await expect(page.locator('[data-dayry-editor]')).toHaveValue(TEXTO)
})

test('diário: excluir entrada com confirmação', async ({ page }) => {
  await page.goto('/#/diario')
  await page.locator('[data-dayry-new]').click()
  await page.locator('[data-dayry-editor]').fill('conteúdo que será excluído')
  await expect
    .poll(async () =>
      page.evaluate(() => (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')?.diary ?? []).length),
    )
    .toBe(1)

  await page.locator('[data-dayry-delete]').click()
  await page.locator('[data-modal-confirm]').click()

  await expect(page.locator('[data-dayry-editor]')).toHaveValue('')
  await expect
    .poll(async () =>
      page.evaluate(() => (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')?.diary ?? []).length),
    )
    .toBe(0)
})

test('diário: importa crônicas em massa via markdown (e pula dias que já existem)', async ({ page }) => {
  await page.goto('/#/diario')

  // abre o modal de importação e cola markdown com 2 entradas
  await page.locator('[data-dayry-import]').click()
  const markdown = `## ${ontem}\n**Ontem**\nPrimeira crônica importada.\n\n## ${hoje}\n**Hoje**\nSegunda crônica importada.\n\n- lista\n- markdown`
  await page.locator('[data-import-text]').fill(markdown)
  await page.locator('[data-import-run]').click()

  // modal FECHA e o resumo vem no toast
  await expect(page.locator('#modal')).toBeHidden()
  await expect(page.locator('.toast').last()).toContainText('2 importada')

  // as entradas aparecem na lista e a mais recente fica aberta no editor
  await expect(page.locator('.diary-files')).toContainText('Hoje')
  await expect(page.locator('.diary-files')).toContainText('Ontem')
  await expect(page.locator('[data-dayry-editor]')).toHaveValue(/Segunda crônica importada/)

  // reimportar o mesmo dia → pula (1/dia), modal fecha de novo
  await page.locator('[data-dayry-import]').click()
  await page.locator('[data-import-text]').fill(`## ${hoje}\n**Hoje**\nconteúdo diferente`)
  await page.locator('[data-import-run]').click()
  await expect(page.locator('#modal')).toBeHidden()
  await expect(page.locator('.toast').last()).toContainText('1 pulada')
  await expect(page.locator('.toast').last()).toContainText(hoje)
})
