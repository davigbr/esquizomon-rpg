/** E2E — MODO PRIVACIDADE do diário (2026-10-02): a tela ABRE com todos os
 *  registros ocultos (o texto nem entra no DOM, como apps de banco escondendo as
 *  cifras) e o botão do header (olho) mostra/oculta. */
import { expect, test } from '@playwright/test'

const TEXTO = 'Conteudo secreto do diario'
const TITULO = 'Titulo secreto'

function isoHoje(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Semeia UMA nota no dia de hoje e abre o diário. */
async function comNota(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(({ texto, titulo, hoje }) => {
    localStorage.setItem(
      'esquizomon-rpg:v1',
      JSON.stringify({
        version: 4,
        tasks: [],
        character: { level: 1, xp: 0, xpNext: 80, hp: 50, hpMax: 50, mana: 20, manaMax: 20, exhausted: false, lastDay: hoje, cards: [], invocations: {} },
        settings: { theme: 'dark' },
        log: [],
        conversations: [],
        diary: [],
        notes: [{ id: 'n1', date: hoje, time: '10:30', title: titulo, text: texto, createdAt: new Date().toISOString() }],
      }),
    )
  }, { texto: TEXTO, titulo: TITULO, hoje: isoHoje() })
  await page.goto('/#/diary')
}

test('abre com os registros OCULTOS (texto fora do DOM) e o olho mostra/oculta', async ({ page }) => {
  await comNota(page)

  // --- oculto por padrão: nada de texto no DOM ---
  await expect(page.locator('[data-diary-privacy]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.note-card--private')).toHaveCount(1)
  await expect(page.locator('.note-veil-bar').first()).toBeVisible()
  await expect(page.locator('.diary-veil-hint')).toBeVisible()
  const oculto = await page.content()
  expect(oculto).not.toContain(TEXTO)
  expect(oculto).not.toContain(TITULO)

  // --- mostra ---
  await page.locator('[data-diary-privacy]').click()
  await expect(page.locator('[data-diary-privacy]')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText(TEXTO)).toBeVisible()
  await expect(page.getByText(TITULO)).toBeVisible()
  await expect(page.locator('.note-card--private')).toHaveCount(0)

  // --- oculta de novo: sai do DOM ---
  await page.locator('[data-diary-privacy]').click()
  await expect(page.locator('[data-diary-privacy]')).toHaveAttribute('aria-pressed', 'true')
  expect(await page.content()).not.toContain(TEXTO)
})

test('card oculto não abre a nota (não dá para "espiar" clicando)', async ({ page }) => {
  await comNota(page)
  await page.locator('[data-note]').first().click({ force: true })
  await page.waitForTimeout(200)
  await expect(page.locator('input[data-note-title]')).toHaveCount(0) // sheet não abriu
  await expect(page.locator('[data-diary-privacy]')).toHaveAttribute('aria-pressed', 'true')
})

test('sair do diário e voltar oculta de novo; re-render da MESMA visita mantém revelado', async ({ page }) => {
  await comNota(page)

  // revela
  await page.locator('[data-diary-privacy]').click()
  await expect(page.getByText(TEXTO)).toBeVisible()

  // re-render da mesma visita (salvar uma nota nova) NÃO re-oculta
  const input = page.locator('[data-note-input]')
  await input.fill('Nota nova')
  await input.press('Enter')
  await expect(page.getByText('Nota nova')).toBeVisible()
  await expect(page.getByText(TEXTO)).toBeVisible()

  // sai da rota e volta → oculto outra vez
  await page.goto('/#/today')
  await page.goto('/#/diary')
  await expect(page.locator('[data-diary-privacy]')).toHaveAttribute('aria-pressed', 'true')
  expect(await page.content()).not.toContain(TEXTO)
})
