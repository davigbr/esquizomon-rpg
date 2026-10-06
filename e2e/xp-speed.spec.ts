/** E2E — velocidade de progressão do XP (Configurações): Lento (÷2), Normal e
 *  Rápido (×2). Aplica-se a TODAS as ações que geram XP (tarefa única,
 *  recorrente, hábito positivo, nota/menção no diário). NÃO é retroativo e o
 *  dano de hábito negativo fica FORA (decisão do usuário 2026-10-01). */
import { test, expect } from '@playwright/test'

type Speed = 'slow' | 'normal' | 'fast'

/** Define a velocidade no estado ANTES do app carregar (contexto limpo) e abre
 *  a rota. Fica valendo em qualquer navegação seguinte: reaplica o campo. */
async function comVelocidade(
  page: import('@playwright/test').Page,
  speed: Speed,
  rota = '/#/today',
): Promise<void> {
  await page.addInitScript((v) => {
    const key = 'esquizomon-rpg:v1'
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') ?? { version: 4, tasks: [], settings: {} }
    raw.settings = { ...(raw.settings ?? {}), xpSpeed: v }
    localStorage.setItem(key, JSON.stringify(raw))
  }, speed)
  await page.goto(rota)
}

/** Lê um campo do estado salvo. */
function readState(page: import('@playwright/test').Page, path: string): Promise<unknown> {
  return page.evaluate((p) => {
    const d = JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')
    return p.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], d)
  }, path)
}

/** Cria uma tarefa única da dificuldade dada. */
async function criarTarefa(page: import('@playwright/test').Page, titulo: string, dif = 'facil'): Promise<void> {
  await page.locator('[data-new-type="unica"]').click()
  await page.locator('input[name="title"]').fill(titulo)
  await page.locator('select[name="difficulty"]').selectOption(dif)
  await page.locator('button[type="submit"]').click()
}

test('lento: XP da tarefa é dividido por 2 — e desmarcar reverte o valor certo', async ({ page }) => {
  await comVelocidade(page, 'slow')
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 0/80')

  // fácil = 10 base → 5 no lento
  await criarTarefa(page, 'Tarefa devagar')
  const card = page.locator('.task-card', { hasText: 'Tarefa devagar' })
  await card.locator('[data-toggle-once]').click()
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 5/80')
  // o histórico registra o valor JÁ com a velocidade
  await expect
    .poll(() => readState(page, 'log.0.text'))
    .toContain('(+5 XP)')

  // desmarca → reverte exatamente 5 (não sobra XP)
  await page.locator('[data-filter-done]').click()
  await page.locator('.task-card', { hasText: 'Tarefa devagar' }).locator('[data-toggle-once]').click()
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 0/80')
})

test('rápido: XP da tarefa é multiplicado por 2 (recorrente e hábito também)', async ({ page }) => {
  await comVelocidade(page, 'fast')

  // única fácil: 10 → 20
  await criarTarefa(page, 'Tarefa veloz')
  await page.locator('.task-card', { hasText: 'Tarefa veloz' }).locator('[data-toggle-once]').click()
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 20/80')

  // recorrente média: 15 → 30 → 50 no total
  await page.locator('[data-new-type="recorrente"]').click()
  await page.locator('input[name="title"]').fill('Recorrente veloz')
  await page.locator('select[name="difficulty"]').selectOption('media')
  await page.locator('button[type="submit"]').click()
  await page.locator('.task-card', { hasText: 'Recorrente veloz' }).locator('[data-toggle-rec]').click()
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 50/80')

  // hábito positivo fácil: 10 → 20 → 70
  await page.locator('[data-new-type="habito"]').click()
  await page.locator('input[name="title"]').fill('Hábito veloz')
  await page.locator('select[name="difficulty"]').selectOption('facil')
  await page.locator('select[name="sign"]').selectOption('ambos')
  await page.locator('button[type="submit"]').click()
  await page.locator('.habit-card', { hasText: 'Hábito veloz' }).locator('[data-habit="positivo"]').click()
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 70/80')
})

test('diário: nota vale 5 ÷2 = 2 no lento (arredonda para baixo)', async ({ page }) => {
  await comVelocidade(page, 'slow', '/#/diary')
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 0/80')

  const input = page.locator('[data-note-input]')
  await input.fill('Nota devagar')
  await input.press('Enter')
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 2/80')
})

test('lento: dano de hábito negativo NÃO muda (fora do escopo da velocidade)', async ({ page }) => {
  await comVelocidade(page, 'slow')
  await expect(page.locator('[data-s-hp]')).toHaveText('50/50')

  await page.locator('[data-new-type="habito"]').click()
  await page.locator('input[name="title"]').fill('Hábito extremo devagar')
  await page.locator('select[name="difficulty"]').selectOption('extrema')
  await page.locator('select[name="sign"]').selectOption('ambos')
  await page.locator('button[type="submit"]').click()

  // dano continua 12 (como no normal) e o XP positivo (25 → 12) é o único afetado
  await page.locator('.habit-card', { hasText: 'Hábito extremo devagar' }).locator('[data-habit="negativo"]').click()
  await expect(page.locator('[data-s-hp]')).toHaveText('38/50')
  await expect.poll(() => readState(page, 'log.0.text')).toContain('(−12 vida)')
})

test('jogo: tabela de XP e regra do diário refletem a velocidade + linha da velocidade', async ({ page }) => {
  await comVelocidade(page, 'fast', '/#/sheet')

  // fácil/média/difícil/extrema = 10/15/20/25 → ×2
  const linhas = page.locator('[data-xp-table] tbody tr')
  await expect(linhas.nth(0)).toContainText('+20')
  await expect(linhas.nth(1)).toContainText('+30')
  await expect(linhas.nth(2)).toContainText('+40')
  await expect(linhas.nth(3)).toContainText('+50')
  await expect(page.locator('[data-xp-speed-line]')).toContainText('Rápido (×2)')
  // a regra do diário usa os valores já escalados (5→10 e 10→20)
  await expect(page.locator('.rules-list')).toContainText('+10 XP')
  await expect(page.locator('.rules-list')).toContainText('+20 XP por menção')

  // e no lento metade (arredonda para baixo: 15 → 7)
  await page.goto('/#/settings')
  await page.locator('[data-xp-speed]').selectOption('slow')
  await page.goto('/#/sheet')
  await expect(page.locator('[data-xp-table] tbody tr').nth(1)).toContainText('+7')
  await expect(page.locator('[data-xp-speed-line]')).toContainText('Lento (÷2)')
})

test('config: trocar a velocidade persiste e NÃO é retroativo', async ({ page }) => {
  await page.goto('/#/today')
  // ganha 10 no normal
  await criarTarefa(page, 'Tarefa normal')
  await page.locator('.task-card', { hasText: 'Tarefa normal' }).locator('[data-toggle-once]').click()
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 10/80')

  // troca para rápido na UI de Configurações
  await page.goto('/#/settings')
  await page.locator('[data-xp-speed]').selectOption('fast')
  await expect(page.locator('[data-xp-speed]')).toHaveValue('fast')

  // o XP já ganho não muda (não é retroativo) …
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 10/80')
  await page.goto('/#/today')
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 10/80')
  // … e a escolha ficou salva (sincroniza com a conta)
  expect(await readState(page, 'settings.xpSpeed')).toBe('fast')

  // a próxima conclusão já vale ×2 (15 → 30 = 40 no total, com os 10 antigos)
  await criarTarefa(page, 'Tarefa depois')
  await page.locator('.task-card', { hasText: 'Tarefa depois' }).locator('[data-toggle-once]').click()
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 30/80')
})
