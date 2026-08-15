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
        versao: 3,
        tarefas: [
          { id: 'r1', tipo: 'recorrente', titulo: 'Meditar', dificuldade: 'facil', tags: [], agenda: { dias: [] }, historico: [], criadaEm: new Date().toISOString() },
          { id: 'u1', tipo: 'unica', titulo: 'Relatório', dificuldade: 'facil', tags: [], dueDate: ontem, concluida: false, historico: [], criadaEm: new Date().toISOString() },
        ],
        personagem: { nivel: 1, xp: 0, xpProximo: 80, hp: 50, hpMax: 50, mana: 20, manaMax: 20, esgotado: false, ultimoDia: ontem, cartas: [], invocacoes: {} },
        configuracao: { tema: 'dark' },
        log: [],
        conversas: [],
        diario: [],
      }
      localStorage.setItem('esquizomon-rpg:v1', JSON.stringify(d))
    },
    { ontem },
  )
}

test('check-in: tudo vem desmarcado; marcar um item conclui em ontem e o resto sofre dano', async ({ page }) => {
  await semearPendentes(page)
  await page.goto('/#/hoje')

  // modal "Tarefas de ontem" com as 2 pendentes DESMARCADAS
  await expect(page.locator('.checkin-item')).toHaveCount(2)
  await expect(page.locator('.checkin-check').nth(0)).not.toBeChecked()
  await expect(page.locator('.checkin-check').nth(1)).not.toBeChecked()

  // marca apenas a 2ª (Relatório) — a 1ª (Meditar) fica sem marcação
  await page.locator('.checkin-check').nth(1).check()
  await page.locator('[data-checkin-confirmar]').click()

  // modal fechou
  await expect(page.locator('#modal')).toBeHidden()

  // Relatório concluída em ontem → +10 XP; Meditar perdida → −3 vida
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 10/80')
  await expect(page.locator('[data-s-hp]')).toHaveText('47/50')
})

test('check-in: confirmar sem marcar nada equivale a pular (dano em todas)', async ({ page }) => {
  await semearPendentes(page)
  await page.goto('/#/hoje')

  await expect(page.locator('.checkin-item')).toHaveCount(2)
  await page.locator('[data-checkin-confirmar]').click()

  await expect(page.locator('#modal')).toBeHidden()
  // nada marcado → XP 0; a recorrente Meditar perdida → −3 vida (únicas não dão dano)
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 0/80')
  await expect(page.locator('[data-s-hp]')).toHaveText('47/50')
})

test('sem pendentes: nenhum modal aparece no novo dia', async ({ page }) => {
  await page.goto('/#/hoje')
  await expect(page.locator('#modal')).toBeHidden()
  await expect(page.locator('.checkin-item')).toHaveCount(0)
})
