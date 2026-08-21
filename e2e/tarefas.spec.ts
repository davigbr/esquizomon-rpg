/** E2E — núcleo de tasks: criar, marcar/desmarcar com XP, hábito, filters. */
import { test, expect } from '@playwright/test'

test('criar tarefa única, marcar (XP sobe) e desmarcar (XP reverte)', async ({ page }) => {
  await page.goto('/#/hoje')
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 0/80')

  // cria tarefa fácil (1× → +10 XP)
  await page.locator('[data-novo-tipo="unica"]').click()
  await page.locator('input[name="titulo"]').fill('Tarefa E2E')
  await page.locator('select[name="dificuldade"]').selectOption('facil')
  await page.locator('button[type="submit"]').click()

  const card = page.locator('.task-card', { hasText: 'Tarefa E2E' })
  await expect(card).toBeVisible()

  // marca → XP 10/80; card some da lista (vai para concluídas)
  await card.locator('[data-alternar-unica]').click()
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 10/80')
  await expect(card).toBeHidden()

  // filtro Concluídas → card aparece; desmarca → XP reverte
  await page.locator('[data-filtro-concluidas]').click()
  const cardFeita = page.locator('.task-card', { hasText: 'Tarefa E2E' })
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

  const card = page.locator('.habit-card', { hasText: 'Hábito E2E' })
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

  const card = page.locator('.task-card', { hasText: 'Diária E2E' })
  await expect(card).toBeVisible()
  await expect(card.locator('.task-check')).not.toHaveClass(/marked/)

  // marca → check dourado + XP
  await card.locator('[data-alternar-rec]').click()
  await expect(card.locator('.task-check')).toHaveClass(/marked/)
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 10/80')

  // desmarca → XP reverte e check volta empty
  await card.locator('[data-alternar-rec]').click()
  await expect(card.locator('.task-check')).not.toHaveClass(/marked/)
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 0/80')
})

test('hábito: repetição negativa EXTREMA tira 12 de vida (dano escala com a dificuldade)', async ({ page }) => {
  await page.goto('/#/hoje')
  await expect(page.locator('[data-s-hp]')).toHaveText('50/50')

  // cria hábito de dificuldade extrema (×2.5 → danoDe = 12)
  await page.locator('[data-novo-tipo="habito"]').click()
  await page.locator('input[name="titulo"]').fill('Hábito extremo E2E')
  await page.locator('select[name="dificuldade"]').selectOption('extrema')
  await page.locator('select[name="sinal"]').selectOption('ambos')
  await page.locator('button[type="submit"]').click()

  const card = page.locator('.habit-card', { hasText: 'Hábito extremo E2E' })
  await expect(card).toBeVisible()

  // − → 50 − 12 = 38, e o log registra o dano por dificuldade
  await card.locator('[data-habito="negativo"]').click()
  await expect(page.locator('[data-s-hp]')).toHaveText('38/50')
  await expect
    .poll(() =>
      page.evaluate(() => (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')?.log?.[0]?.text ?? '')),
    )
    .toContain('(−12 vida)')
})

test('hábito: negativo marcado em ontem persiste e aparece ativo ao voltar para aquele dia', async ({ page }) => {
  await page.goto('/#/hoje')

  // cria hábito com sinais ambos
  await page.locator('[data-novo-tipo="habito"]').click()
  await page.locator('input[name="titulo"]').fill('Hábito ontem E2E')
  await page.locator('select[name="dificuldade"]').selectOption('facil')
  await page.locator('select[name="sinal"]').selectOption('ambos')
  await page.locator('button[type="submit"]').click()

  // volta para ontem (navega o seletor de dia)
  await page.locator('[data-dia-anterior]').click()
  const card = page.locator('.habit-card', { hasText: 'Hábito ontem E2E' })
  await expect(card).toBeVisible()
  const negBtn = card.locator('[data-habito="negativo"]')
  // nada marcado em ontem → botão negativo NÃO ativo
  await expect(negBtn).not.toHaveClass(/active/)

  // marca negativo em ontem (retroativo) → botão fica ativo
  await negBtn.click()
  await expect(negBtn).toHaveClass(/active/)

  // o dado foi persistido (negativeHistory) com a data de ONTEM
  const yesterday = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')
        const t = (data.tasks ?? []).find((x: { title?: string }) => x.title === 'Hábito ontem E2E')
        return t?.negativeHistory ?? []
      }),
    )
    .toEqual(expect.arrayContaining([yesterday]))

  // volta pra hoje e retorna a ontem: o estado negativo DEVE continuar ativo
  await page.locator('[data-dia-seguinte]').click()
  await page.locator('[data-dia-anterior]').click()
  const cardVolta = page.locator('.habit-card', { hasText: 'Hábito ontem E2E' })
  await expect(cardVolta.locator('[data-habito="negativo"]')).toHaveClass(/active/)
})
