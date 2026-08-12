/** E2E — Fábula: resumo "Sobre você" salva, prompt injeta {resumo}/{diario}/cartas,
 *  marcador [[acao:invocar]] é parseado, e citar carta desbloqueada no diário dá XP. */
import { test, expect } from '@playwright/test'

const hoje = new Date().toISOString().slice(0, 10)

/** Estado com a carta Ninho Enclausurado desbloqueada + mana sobrando. */
async function semear(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(
    ({ hoje }) => {
      const d = {
        versao: 3,
        tarefas: [],
        personagem: {
          nivel: 1, xp: 0, xpProximo: 80, hp: 50, hpMax: 50, mana: 20, manaMax: 20,
          esgotado: false, ultimoDia: hoje, esferas: {},
          cartas: ['ninho-enclausurado'], invocacoes: {},
        },
        configuracao: { tema: 'dark' },
        log: [],
        conversas: [],
        diario: [],
      }
      localStorage.setItem('esquizomon-rpg:v1', JSON.stringify(d))
    },
    { hoje },
  )
}

test('config: "Sobre você" salva o resumo e persiste no reload', async ({ page }) => {
  await page.goto('/#/config')
  const campo = page.locator('[data-resumo]')
  await expect(campo).toBeVisible()
  await campo.fill('Mestrando em psicologia, atendo, escrevo, treino calistenia.')
  await campo.blur()

  await expect
    .poll(() =>
      page.evaluate(() => (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')?.configuracao?.resumo ?? '')),
    )
    .toBe('Mestrando em psicologia, atendo, escrevo, treino calistenia.')

  await page.reload()
  await expect(page.locator('[data-resumo]')).toHaveValue('Mestrando em psicologia, atendo, escrevo, treino calistenia.')
})

test('fabula: prompt injeta {resumo}, cartas desbloqueadas e o protocolo de invocação', async ({ page }) => {
  await semear(page)
  await page.goto('/#/config')
  await page.locator('[data-resumo]').fill('Vivo com a Aline e duas gatas.')
  await page.locator('[data-resumo]').blur()
  await page.goto('/#/diario')
  await page.locator('[data-diario-novo]').click()
  await page.locator('[data-diario-editor]').fill('Hoje lembrei do Ninho Enclausurado.')
  await page.keyboard.press('Tab')

  const prompt = await page.evaluate(async () => {
    const { montarSystemPrompt } = await import('/src/ia/prompt')
    const { appStore } = await import('/src/stores/app')
    return montarSystemPrompt(appStore.get())
  })
  expect(prompt).toContain('Rizomante')
  expect(prompt).toContain('Vivo com a Aline e duas gatas.')
  expect(prompt).toContain('ninho-enclausurado → Ninho Enclausurado')
  expect(prompt).toContain('AÇÕES DISPONÍVEIS')
  expect(prompt).toContain('[[acao:')
})

test('fabula: marcador [[acao:invocar]] é extraído e removido do texto', async ({ page }) => {
  await page.goto('/#/hoje')
  const res = await page.evaluate(async () => {
    const { extrairAcoes } = await import('/src/ia/acoes')
    return extrairAcoes(
      'A carta chega como um alívio.\n[[acao:{"tipo":"invocar","carta":"ninho-enclausurado"}]]',
    )
  })
  expect(res.texto).toBe('A carta chega como um alívio.')
  expect(res.acoes).toHaveLength(1)
  expect(res.acoes[0]).toEqual({ tipo: 'invocar', carta: 'ninho-enclausurado' })

  // marcador malformado é removido sem executar
  const invalido = await page.evaluate(async () => {
    const { extrairAcoes } = await import('/src/ia/acoes')
    return extrairAcoes('texto [[acao:{{quebrado]] resto')
  })
  expect(invalido.acoes).toHaveLength(0)
  expect(invalido.texto).toBe('texto  resto')
})

test('fabula: invocarCarta (via chat) desconta mana e registra', async ({ page }) => {
  await semear(page)
  await page.goto('/#/hoje')
  await expect(page.locator('[data-s-mana]')).toHaveText('Mana 20/20')

  const res = await page.evaluate(async () => {
    const { invocarCarta } = await import('/src/stores/app')
    const ok = invocarCarta('ninho-enclausurado') // captura → custo 4
    const mana = (await import('/src/stores/app')).appStore.get().personagem.mana
    return { ok: ok.ok, mana }
  })
  expect(res.ok).toBe(true)
  expect(res.mana).toBe(16)

  // sem mana → recusa
  const semMana = await page.evaluate(async () => {
    const mod = await import('/src/stores/app')
    mod.appStore.set({ ...mod.appStore.get(), personagem: { ...mod.appStore.get().personagem, mana: 1 } })
    return mod.invocarCarta('ninho-enclausurado')
  })
  expect(semMana.ok).toBe(false)
})

test('diário: citar carta desbloqueada dá +5 XP (uma vez por carta; bloqueada não conta)', async ({ page }) => {
  await semear(page)
  await page.goto('/#/diario')
  await page.locator('[data-diario-novo]').click()
  await page.locator('[data-diario-editor]').fill('Hoje lembrei do Ninho Enclausurado e do seu conceito.')
  await page.keyboard.press('Tab')

  // autosave → XP 5/80 e recompensa registrada na entrada
  await expect
    .poll(() => page.locator('[data-s-xp]').textContent())
    .toBe('XP 5/80')
  await expect
    .poll(() =>
      page.evaluate(() =>
        (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')?.diario?.[0]?.recompensas ?? []).join(',')),
    )
    .toBe('ninho-enclausurado')

  // editar de novo mantendo a citação → sem XP dobrado
  await page.locator('[data-diario-editor]').fill('Hoje lembrei do Ninho Enclausurado de novo.')
  await page.keyboard.press('Tab')
  await page.waitForTimeout(1200)
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 5/80')

  // carta BLOQUEADA (Internato de Ferro, não está em cartas[]) → sem XP
  await page.locator('[data-diario-editor]').fill('O Internato de Ferro também me visitou.')
  await page.keyboard.press('Tab')
  await page.waitForTimeout(1200)
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 5/80')
})
