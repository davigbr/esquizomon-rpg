import { test, expect } from '@playwright/test'

/** Spec mobile (390×844): menu só de ícones e Fábula como página fullscreen. */
test.use({ viewport: { width: 390, height: 844 } })

test('mobile: navbar vira menu somente de ícones (rótulos escondidos)', async ({ page }) => {
  await page.goto('/#/hoje')
  const rotulo = page.locator('[data-rota="hoje"] .nav-texto')
  await expect(rotulo).toBeHidden()
  await expect(page.locator('[data-rota="hoje"] i')).toBeVisible()
})

test('mobile: Fábula abre como página fullscreen (cobre a tela toda)', async ({ page }) => {
  await page.goto('/#/hoje')
  await page.click('#fabula-toggle')
  await expect(page.locator('#fabula-panel')).toHaveClass(/aberto/)
  // espera a transição de abertura (0.28s) terminar antes de medir
  await expect.poll(async () => (await page.locator('#fabula-panel').boundingBox())?.x ?? -1).toBe(0)
  const box = await page.locator('#fabula-panel').boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBe(0)
  expect(box!.y).toBe(0)
  expect(box!.width).toBeCloseTo(390, 0)
  expect(box!.height).toBeGreaterThanOrEqual(844)
})

test('mobile: nome monstruoso fica ACIMA do nível, tudo centralizado verticalmente', async ({ page }) => {
  await page.addInitScript(() => {
    const hoje = new Date().toISOString().slice(0, 10)
    localStorage.setItem(
      'esquizomon-rpg:v1',
      JSON.stringify({
        versao: 3,
        tarefas: [],
        log: [],
        diario: [],
        conversas: [],
        configuracao: { tema: 'dark', ia: { provider: 'nenhum', modelo: '', apiKey: '' } },
        personagem: {
          nivel: 1, xp: 0, xpProximo: 80, hp: 50, hpMax: 50, mana: 20, manaMax: 20,
          esgotado: false, ultimoDia: hoje, cartas: [], invocacoes: {},
          avatar: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          nomeMonstruoso: 'Devorador de Segundas',
        },
      }),
    )
  })
  await page.goto('/#/hoje')
  // nome monstruoso VISÍVEL, ACIMA do nível (mesma coluna à direita da foto)
  await expect(page.locator('.status-nome')).toBeVisible()
  const nome = await page.locator('.status-nome').boundingBox()
  const avatar = await page.locator('.status-avatar').boundingBox()
  const nivel = await page.locator('.status-item--nivel').boundingBox()
  expect(nome!.y).toBeLessThan(nivel!.y) // nome acima do nível
  expect(nome!.x).toBeCloseTo(nivel!.x, -1) // mesma coluna (à direita da foto)
  // tudo centralizado verticalmente: centro do avatar ≈ centro da coluna nome+nível
  const centroColuna = (nome!.y + nivel!.y + nivel!.height) / 2
  expect(avatar!.y + avatar!.height / 2).toBeCloseTo(centroColuna, 0)
  expect(avatar!.x).toBeLessThan(nome!.x) // foto à ESQUERDA da coluna
  expect(avatar!.width).toBeGreaterThan(40) // bolinha maior no mobile (44px)
})

test('mobile: status bar empilha as barras (vida → XP → mana) com nível à esquerda', async ({ page }) => {
  await page.goto('/#/hoje')
  const hp = await page.locator('.status-item--hp').boundingBox()
  const xp = await page.locator('.status-item--xp').boundingBox()
  const mana = await page.locator('.status-item--mana').boundingBox()
  const nivel = await page.locator('.status-item--nivel').boundingBox()
  expect(hp).not.toBeNull()
  expect(xp).not.toBeNull()
  expect(mana).not.toBeNull()
  expect(nivel).not.toBeNull()
  // empilhadas na mesma coluna, y crescente (vida → XP → mana)
  expect(hp!.x).toBeCloseTo(xp!.x, 0)
  expect(xp!.y).toBeLessThan(mana!.y)
  // nível à esquerda das barras
  expect(nivel!.x).toBeLessThan(hp!.x)
})

test('mobile: seletor de conversas vira faixa horizontal no topo', async ({ page }) => {
  await page.goto('/#/hoje')
  await page.click('#fabula-toggle')
  const lateral = await page.locator('.fabula-lateral').boundingBox()
  expect(lateral).not.toBeNull()
  const conversa = await page.locator('.fabula-conversa').boundingBox()
  expect(conversa).not.toBeNull()
  // lateral no topo, conversa abaixo (coluna, não mais lado a lado)
  expect(lateral!.y).toBeLessThan(conversa!.y)
  expect(lateral!.width).toBeGreaterThan(300)
})
