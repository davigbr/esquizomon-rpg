import { test, expect } from '@playwright/test'

/** Spec mobile (390×844): menu só de ícones e Fábula como página fullscreen. */
test.use({ viewport: { width: 390, height: 844 } })

test('mobile: swipe esquerdo/direito alterna entre as abas (Hoje→Diário→Cartas→Jogo→Histórico)', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page)
  async function swipe(dx: number): Promise<void> {
    const y = 400
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y, id: 1 }] })
    for (let x = 300; Math.abs(x - 300) < Math.abs(dx); x += dx / 4) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] })
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 + dx, y, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(150)
  }

  await page.goto('/#/today')
  await swipe(-200)
  await expect(page).toHaveURL(/#\/diary$/)
  await swipe(-200)
  await expect(page).toHaveURL(/#\/cards$/)
  await swipe(-200)
  await expect(page).toHaveURL(/#\/sheet$/)
  await swipe(-200)
  await expect(page).toHaveURL(/#\/history$/)
  // volta
  await swipe(200)
  await expect(page).toHaveURL(/#\/sheet$/)
  await swipe(200)
  await expect(page).toHaveURL(/#\/cards$/)
})

test('mobile: swipe NÃO navega com modal aberto, com a Fábula aberta ou em gesto vertical', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page)
  async function swipe(dx: number, dy = 0): Promise<void> {
    const y = 400
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y, id: 1 }] })
    for (let i = 1; i <= 4; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 + (dx * i) / 4, y: y + (dy * i) / 4, id: 1 }] })
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(150)
  }

  await page.goto('/#/today')
  // gesto DOMINANTEMENTE vertical (scroll) não navega
  await swipe(120, 260)
  await expect(page).toHaveURL(/#\/today$/)
  // chama a Fábula → swipe não navega
  await page.click('#fabula-toggle')
  await swipe(-200)
  await expect(page).toHaveURL(/#\/today$/)
  // fecha pelo botão do próprio painel (fullscreen cobre o nav no mobile)
  await page.click('[data-fable-close]')
  await expect(page.locator('#fabula-panel')).not.toHaveClass(/open/)
  await page.waitForTimeout(400)
  // modal aberto (diário → crônica) → swipe não navega
  await page.goto('/#/diary')
  await page.locator('[data-dayry-cronica]').first().click()
  await expect(page.locator('#modal')).toBeVisible()
  await swipe(-200)
  await expect(page).toHaveURL(/#\/diary$/)
})

test('mobile: navbar vira menu somente de ícones (rótulos escondidos)', async ({ page }) => {
  await page.goto('/#/today')
  const rotulo = page.locator('[data-rota="today"] .nav-text')
  await expect(rotulo).toBeHidden()
  await expect(page.locator('[data-rota="today"] i')).toBeVisible()
})

test('mobile: Fábula abre como página fullscreen (cobre a tela toda)', async ({ page }) => {
  await page.goto('/#/today')
  await page.click('#fabula-toggle')
  await expect(page.locator('#fabula-panel')).toHaveClass(/open/)
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
        version: 3,
        tasks: [],
        log: [],
        diary: [],
        conversations: [],
        settings: { tema: 'dark', ai: { provider: 'nenhum', model: '', apiKey: '' } },
        character: {
          nivel: 1, xp: 0, xpProximo: 80, hp: 50, hpMax: 50, mana: 20, manaMax: 20,
          exhausted: false, lastDay: hoje, cartas: [], invocations: {},
          avatar: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          monsterName: 'Devorador de Segundas',
        },
      }),
    )
  })
  await page.goto('/#/today')
  // nome monstruoso VISÍVEL, ACIMA do nível (mesma column à direita da foto)
  await expect(page.locator('.status-name')).toBeVisible()
  const nome = await page.locator('.status-name').boundingBox()
  const avatar = await page.locator('.status-avatar').boundingBox()
  const nivel = await page.locator('.status-item--nivel').boundingBox()
  expect(nome!.y).toBeLessThan(nivel!.y) // nome acima do nível
  expect(nome!.x).toBeCloseTo(nivel!.x, -1) // mesma column (à direita da foto)
  // tudo centralizado verticalmente: centro do avatar ≈ centro da column nome+nível
  const centroColuna = (nome!.y + nivel!.y + nivel!.height) / 2
  expect(avatar!.y + avatar!.height / 2).toBeCloseTo(centroColuna, 0)
  expect(avatar!.x).toBeLessThan(nome!.x) // foto à ESQUERDA da column
  expect(avatar!.width).toBeGreaterThan(40) // bolinha maior no mobile (44px)
})

test('mobile: status bar empilha as barras (vida → XP → mana) com nível à esquerda', async ({ page }) => {
  await page.goto('/#/today')
  const hp = await page.locator('.status-item--hp').boundingBox()
  const xp = await page.locator('.status-item--xp').boundingBox()
  const mana = await page.locator('.status-item--mana').boundingBox()
  const nivel = await page.locator('.status-item--nivel').boundingBox()
  expect(hp).not.toBeNull()
  expect(xp).not.toBeNull()
  expect(mana).not.toBeNull()
  expect(nivel).not.toBeNull()
  // empilhadas na mesma column, y crescente (vida → XP → mana)
  expect(hp!.x).toBeCloseTo(xp!.x, 0)
  expect(xp!.y).toBeLessThan(mana!.y)
  // nível à esquerda das barras
  expect(nivel!.x).toBeLessThan(hp!.x)
})

test('mobile: seletor de conversas vira faixa horizontal no topo', async ({ page }) => {
  await page.goto('/#/today')
  await page.click('#fabula-toggle')
  const lateral = await page.locator('.fable-side').boundingBox()
  expect(lateral).not.toBeNull()
  const conversa = await page.locator('.fable-conversation').boundingBox()
  expect(conversa).not.toBeNull()
  // lateral no topo, conversa abaixo (column, não mais lado a lado)
  expect(lateral!.y).toBeLessThan(conversa!.y)
  expect(lateral!.width).toBeGreaterThan(300)
})
