/** E2E — tela de morte (esgotado): overlay oculto por padrão e que, ao esgotar
 *  por dano, COBRE a tela inteira (position:fixed) — já ficou solto no fluxo
 *  quando as classes CSS (death-*) não casavam com o markup (morte-*). */
import { test, expect } from '@playwright/test'

function dataLocal(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('morte: overlay oculto por padrão e cobre a tela inteira ao esgotar (bug de CSS 2026-09-05)', async ({ page }) => {
  const hoje = dataLocal()
  await page.addInitScript(
    ({ hoje }) => {
      localStorage.setItem(
        'esquizomon-rpg:v1',
        JSON.stringify({
          version: 3,
          tasks: [{ id: 'r1', type: 'recorrente', title: 'Meditar', difficulty: 'facil', tags: [], agenda: { dias: [] }, history: [], createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' }],
          character: { nivel: 1, xp: 0, xpProximo: 80, hp: 1, hpMax: 50, mana: 20, manaMax: 20, exhausted: false, lastDay: hoje, cartas: ['prefiro-nao'], invocations: {} },
          settings: { tema: 'dark' },
          log: [], conversations: [], diary: [],
        }),
      )
    },
    { hoje },
  )
  await page.goto('/#/today')

  // oculto por padrão (atributo hidden respeitado mesmo com display:grid no CSS)
  await expect(page.locator('#morte-overlay')).toBeHidden()

  // esgota por dano → o app mostra a tela de morte (via stores/app, a MESMA
  // cadeia que o main.ts escuta — importar personagem direto duplicaria a instância)
  await page.evaluate(async () => {
    const { applyDamage } = await import('/src/stores/app')
    applyDamage(50)
  })
  const overlay = page.locator('#morte-overlay')
  await expect(overlay).toBeVisible()

  // cobre a tela INTEIRA (position:fixed; inset:0) — se ficar solto no fluxo,
  // o bounding box NÃO equivale ao viewport.
  const box = await overlay.boundingBox()
  const vp = page.viewportSize() ?? { width: 1, height: 1 }
  expect(box).not.toBeNull()
  expect(box!.x).toBe(0)
  expect(box!.y).toBe(0)
  expect(box!.width).toBeGreaterThanOrEqual(vp.width - 2)
  expect(box!.height).toBeGreaterThanOrEqual(vp.height - 2)

  // a carta perdida é exibida dentro do overlay (id morte-carta)
  await expect(page.locator('#morte-carta img')).toBeVisible()
})