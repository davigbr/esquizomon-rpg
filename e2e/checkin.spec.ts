/** E2E — check-in diário (estilo Habitica): modal aparece no 1º acesso do dia,
 *  marcações retroativas dão XP e o dano só incide nas não marcadas. */
import { test, expect } from '@playwright/test'

const hoje = new Date().toISOString().slice(0, 10)
const ontem = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

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
        personagem: { nivel: 1, xp: 0, xpProximo: 80, hp: 50, hpMax: 50, mana: 20, manaMax: 20, esgotado: false, ultimoDia: ontem, esferas: {}, cartas: [], invocacoes: {} },
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

test('check-in: marca retroativamente em ontem e aplica dano só nas não marcadas', async ({ page }) => {
  await semearPendentes(page)
  await page.goto('/#/hoje')

  // modal aparece com as 2 pendentes pré-marcadas
  await expect(page.locator('.checkin-item')).toHaveCount(2)
  await expect(page.locator('.checkin-check')).toHaveCount(2)
  await expect(page.locator('.checkin-check').nth(0)).toBeChecked()
  await expect(page.locator('.checkin-check').nth(1)).toBeChecked()

  // desmarca a 1ª (Meditar) — não foi feita; mantém a 2ª (Relatório)
  await page.locator('.checkin-check').nth(0).uncheck()
  await page.locator('[data-checkin-confirmar]').click()

  // modal fechou
  await expect(page.locator('#modal')).toBeHidden()

  // Relatório concluída em ontem → +10 XP; Meditar perdida → −3 vida
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 10/80')
  await expect(page.locator('[data-s-hp]')).toHaveText('47/50')
})

test('check-in: pular aplica dano de todas as pendentes', async ({ page }) => {
  await semearPendentes(page)
  await page.goto('/#/hoje')

  await expect(page.locator('.checkin-item')).toHaveCount(2)
  await page.locator('[data-checkin-pular]').click()

  await expect(page.locator('#modal')).toBeHidden()
  // nenhuma marcada → XP 0; 2 recorrentes... só a r1 é recorrente (u1 é única, sem dano)
  // dano = 1 recorrente fácil = −3
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 0/80')
  await expect(page.locator('[data-s-hp]')).toHaveText('47/50')
})

test('sem pendentes: nenhum modal aparece no novo dia', async ({ page }) => {
  await page.goto('/#/hoje')
  await expect(page.locator('#modal')).toBeHidden()
  await expect(page.locator('.checkin-item')).toHaveCount(0)
})
