/** E2E — check-in diário (estilo Habitica): modal "Tarefas de ontem" aparece no
 *  1º acesso do dia, tudo DESMARCADO; o usuário marca o que fez; o dano só
 *  incide nas não marcadas. */
import { test, expect } from '@playwright/test'

/** Data LOCAL (YYYY-MM-DD) — o app usa datas locais; toISOString() é UTC e
 *  troca o dia à noite em fusos negativos (flakiness real 2026-08-12). */
function dataLocal(offsetDias = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const hoje = dataLocal()
const ontem = dataLocal(-1)

/** Estado com ultimoDia = ontem + 1 recorrente e 1 única vencida pendentes. */
async function semearPendentes(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(
    ({ ontem }) => {
      const d = {
        version: 3,
        tasks: [
          { id: 'r1', type: 'recorrente', title: 'Meditar', difficulty: 'facil', tags: [], agenda: { dias: [] }, history: [], createdAt: new Date().toISOString() },
          { id: 'u1', type: 'unica', title: 'Relatório', difficulty: 'facil', tags: [], dueDate: ontem, done: false, history: [], createdAt: new Date().toISOString() },
        ],
        character: { nivel: 1, xp: 0, xpProximo: 80, hp: 50, hpMax: 50, mana: 20, manaMax: 20, exhausted: false, lastDay: ontem, cartas: [], invocations: {} },
        settings: { tema: 'dark' },
        log: [],
        conversations: [],
        diary: [],
      }
      localStorage.setItem('esquizomon-rpg:v1', JSON.stringify(d))
    },
    { ontem },
  )
}

test('check-in: tudo vem desmarcado; marcar um item conclui em ontem e o resto sofre dano', async ({ page }) => {
  await semearPendentes(page)
  await page.goto('/#/today')

  // modal "Tarefas de ontem" com as 2 pendentes DESMARCADAS
  await expect(page.locator('.checkin-item')).toHaveCount(2)
  await expect(page.locator('.checkin-check').nth(0)).not.toBeChecked()
  await expect(page.locator('.checkin-check').nth(1)).not.toBeChecked()

  // marca apenas a 2ª (Relatório) — a 1ª (Meditar) fica sem marcação
  await page.locator('.checkin-check').nth(1).check()
  await page.locator('[data-checkin-confirm]').click()

  // modal fechou
  await expect(page.locator('#modal')).toBeHidden()

  // Relatório concluída em ontem → +10 XP; Meditar perdida → −3 vida
  // (o dano de −3 é cancelado pela regeneração diária de +5% = +3, então fica 50/50)
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 10/80')
  await expect(page.locator('[data-s-hp]')).toHaveText('50/50')
})

test('check-in: confirmar sem marcar nada equivale a pular (dano em todas)', async ({ page }) => {
  await semearPendentes(page)
  await page.goto('/#/today')

  await expect(page.locator('.checkin-item')).toHaveCount(2)
  await page.locator('[data-checkin-confirm]').click()

  await expect(page.locator('#modal')).toBeHidden()
  // nada marked → XP 0; a recorrente Meditar perdida → −3 vida (únicas não dão dano)
  // (dano cancelado pela regeneração diária de +5%; fica 50/50)
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 0/80')
  await expect(page.locator('[data-s-hp]')).toHaveText('50/50')
})

test('sem pendentes: nenhum modal aparece no novo dia', async ({ page }) => {
  await page.goto('/#/today')
  await expect(page.locator('#modal')).toBeHidden()
  await expect(page.locator('.checkin-item')).toHaveCount(0)
})
