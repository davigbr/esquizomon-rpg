/** E2E — diário (timeline): captura de notas rápidas (várias por dia, XP 1×/dia,
 *  menção de carta dá XP no save), crônica diária (modal markdown, autosave,
 *  preview, exclusão) e import em massa. */
import { test, expect } from '@playwright/test'

const TEXTO = 'linha um\nlinha dois\n\nparágrafo com **negrito** e *itálico*\n\n- item 1\n- item 2'

/** Data LOCAL (YYYY-MM-DD) — o app usa datas locais; toISOString() é UTC e
 *  troca o dia à noite em fusos negativos (flakiness real 2026-08-12). */
function dataLocal(offsetDias = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const hoje = dataLocal()
const ontem = dataLocal(-1)

/** Lê um campo do estado salvo (localStorage do app). */
function readState(page: import('@playwright/test').Page, path: string): Promise<unknown> {
  return page.evaluate((p) => {
    const d = JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')
    return p.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], d)
  }, path)
}

test('diário: captura várias notas no mesmo dia (Enter salva, campo limpa e mantém o foco)', async ({ page }) => {
  await page.goto('/#/diary')
  const input = page.locator('[data-note-input]')

  await input.fill('Primeira nota da manhã')
  await input.press('Enter')
  const card = page.locator('[data-note]').first()
  await expect(card).toContainText('Primeira nota da manhã')
  // campo limpo e ainda focado — captura em sequência
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()

  // segunda nota do MESMO dia
  await input.fill('Lembrete: ligar pro orientador')
  await input.press('Enter')
  await expect(page.locator('[data-note]')).toHaveCount(2)
  await expect(page.locator('[data-note]').first()).toContainText('Lembrete: ligar pro orientador')
  // empilha na seção de HOJE
  const notaEmHoje = page.locator('.note-card').first().locator('xpath=ancestor::*[@data-day]')
  await expect(notaEmHoje).toHaveAttribute('data-day', hoje)

  // persiste no reload
  await page.reload()
  await expect(page.locator('[data-note]')).toHaveCount(2)
})

test('diário: XP +5 POR NOTA — múltiplas notas no mesmo dia somam (editar a mesma nota não re-rende)', async ({ page }) => {
  await page.goto('/#/diary')
  const input = page.locator('[data-note-input]')

  await input.fill('nota um')
  await input.press('Enter')
  await expect.poll(() => readState(page, 'character.xp')).toBe(5)

  // segunda nota do MESMO dia também rende
  await input.fill('nota dois')
  await input.press('Enter')
  await expect.poll(() => readState(page, 'character.xp')).toBe(10)

  // terceira nota → 15
  await input.fill('nota três')
  await input.press('Enter')
  await expect.poll(() => readState(page, 'character.xp')).toBe(15)

  // editar a MESMA nota não re-rende (dedup por registro)
  await page.locator('[data-note]').first().click()
  await page.locator('[data-note-edit]').fill('nota três editada')
  await page.locator('[data-note-save]').click()
  await page.waitForTimeout(300)
  expect(await readState(page, 'character.xp')).toBe(15)
})

test('diário: menção de carta numa NOTA dá +XP no save (e não dobra no mesmo dia)', async ({ page }) => {
  // aguarda o baralho carregar (main.ts carrega async no boot)
  await page.goto('/#/diary')
  await expect
    .poll(() => page.evaluate(async () => (await import('/src/core/baralho')).allCards().length))
    .toBeGreaterThan(0)

  const input = page.locator('[data-note-input]')
  await input.fill('Ninho Enclausurado me visitou na rua.')
  await input.press('Enter')
  // +5 do registro + 10 da menção
  await expect.poll(() => readState(page, 'character.xp')).toBe(15)

  // re-salvar a MESMA nota (edição) → não dobra (dedup diaryXp por dia)
  await page.locator('[data-note]').first().click()
  await page.locator('[data-note-edit]').fill('Ninho Enclausurado, de novo, na rua.')
  await page.locator('[data-note-save]').click()
  await page.waitForTimeout(300)
  expect(await readState(page, 'character.xp')).toBe(15)
})

test('diário: edita e exclui uma nota pela sheet', async ({ page }) => {
  await page.goto('/#/diary')
  await page.locator('[data-note-input]').fill('nota temporária')
  await page.locator('[data-note-input]').press('Enter')

  // edita
  await page.locator('[data-note]').first().click()
  await page.locator('[data-note-edit]').fill('nota editada')
  await page.locator('[data-note-save]').click()
  await expect(page.locator('#modal')).toBeHidden()
  await expect(page.locator('[data-note]').first()).toContainText('nota editada')
  await expect.poll(() => readState(page, 'notes.0.text')).toBe('nota editada')

  // exclui com confirmação
  await page.locator('[data-note]').first().click()
  await page.locator('[data-note-delete]').click()
  await page.locator('[data-modal-confirm]').click()
  await expect(page.locator('#modal')).toBeHidden()
  await expect(page.locator('[data-note]')).toHaveCount(0)
  expect(await readState(page, 'notes.length')).toBe(0)
})

test('diário: crônica via modal — markdown, autosave, preview (Ver) e reload', async ({ page }) => {
  await page.goto('/#/diary')
  await page.locator('[data-dayry-cronica]').first().click()
  const editor = page.locator('[data-dayry-editor]')
  await expect(editor).toBeVisible()

  await editor.fill(TEXTO)
  await page.locator('[data-dayry-save]').click()
  await expect(page.locator('#modal')).toBeHidden()

  // persiste como entrada do dia (autosave de 800ms + save explícito)
  await expect.poll(() => readState(page, 'diary.0.text')).toBe(TEXTO)

  // card da crônica aparece no dia com o snippet
  await expect(page.locator('[data-dayry-cronica-card]').first()).toContainText('negrito')

  // reabre e usa Ver (preview renderiza markdown)
  await page.locator('[data-dayry-cronica-card]').first().click()
  await page.locator('[data-dayry-toggle]').click()
  await expect(page.locator('[data-dayry-preview] strong')).toHaveText('negrito')
  await expect(page.locator('[data-dayry-preview] em')).toHaveText('itálico')
  await expect(page.locator('[data-dayry-preview] li')).toHaveCount(2)
})

test('diário: excluir crônica com confirmação', async ({ page }) => {
  await page.goto('/#/diary')
  await page.locator('[data-dayry-cronica]').first().click()
  await page.locator('[data-dayry-editor]').fill('conteúdo que será excluído')
  await page.locator('[data-dayry-save]').click()
  await expect.poll(() => readState(page, 'diary.length')).toBe(1)

  await page.locator('[data-dayry-cronica-card]').first().click()
  await page.locator('[data-dayry-delete]').click()
  await page.locator('[data-modal-confirm]').click()
  await expect(page.locator('#modal')).toBeHidden()
  await expect(page.locator('[data-dayry-cronica-card]')).toHaveCount(0)
  await expect.poll(() => readState(page, 'diary.length')).toBe(0)
})

test('diário: importa crônicas em massa via markdown (e pula dias que já existem)', async ({ page }) => {
  await page.goto('/#/diary')

  await page.locator('[data-dayry-import]').click()
  const markdown = `## ${ontem}\n**Ontem**\nPrimeira crônica importada.\n\n## ${hoje}\n**Hoje**\nSegunda crônica importada.\n\n- lista\n- markdown`
  await page.locator('[data-import-text]').fill(markdown)
  await page.locator('[data-import-run]').click()

  // modal FECHA e o resumo vem no toast
  await expect(page.locator('#modal')).toBeHidden()
  await expect(page.locator('.toast').last()).toContainText('2 importada')

  // as crônicas viram cards na timeline (uma por dia importado)
  await expect(page.locator('[data-dayry-cronica-card]')).toHaveCount(2)
  await expect(page.locator('.diary-timeline')).toContainText('Primeira crônica importada')

  // reimportar o mesmo dia → pula (1/dia), modal fecha de novo
  await page.locator('[data-dayry-import]').click()
  await page.locator('[data-import-text]').fill(`## ${hoje}\n**Hoje**\nconteúdo diferente`)
  await page.locator('[data-import-run]').click()
  await expect(page.locator('#modal')).toBeHidden()
  await expect(page.locator('.toast').last()).toContainText('1 pulada')
  await expect(page.locator('.toast').last()).toContainText(hoje)
})

test('diário: crônica salva SEM título e sem IA — o título vira a DATA', async ({ page }) => {
  await page.goto('/#/diary')
  await page.locator('[data-dayry-cronica]').first().click()
  await page.locator('[data-dayry-editor]').fill('Dia comum, sem título na crônica.')
  await page.locator('[data-dayry-save]').click()
  const dataTitulo = `${hoje.slice(8, 10)}/${hoje.slice(5, 7)}/${hoje.slice(0, 4)}`
  await expect.poll(() => readState(page, 'diary.0.title')).toBe(dataTitulo)
})

test('diário: crônica sem título COM IA ligada — título vira UMA palavra da IA', async ({ page }) => {
  await page.addInitScript((h) => {
    localStorage.setItem(
      'esquizomon-rpg:v1',
      JSON.stringify({
        version: 3,
        tasks: [],
        character: {
          nivel: 1, xp: 0, xpProximo: 80, hp: 50, hpMax: 50, mana: 20, manaMax: 20,
          exhausted: false, lastDay: h, cartas: [], invocations: {},
        },
        settings: { tema: 'dark', ai: { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'chave-teste', systemPrompt: '' } },
        log: [],
        conversations: [],
        diary: [],
        notes: [],
      }),
    )
  }, hoje)
  await page.route('**/api/ia', (rota) => {
    const body = JSON.parse(rota.request().postData() ?? '{}')
    if (body.stream === false) {
      void rota.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: 'Vórtice' } }] }),
      })
    } else {
      void rota.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: [DONE]\n\n' })
    }
  })
  await page.goto('/#/diary')
  await page.locator('[data-dayry-cronica]').first().click()
  await page.locator('[data-dayry-editor]').fill('Acordei tarde, escrevi, atendi.')
  await page.locator('[data-dayry-save]').click()
  await expect.poll(() => readState(page, 'diary.0.title')).toBe('Vórtice')
  // feedback do título sugerido
  await expect(page.locator('.toast').last()).toContainText('Título sugerido')
})

test('diário: crônica sem título COM IA mas falha na resposta — título vira a DATA', async ({ page }) => {
  await page.addInitScript((h) => {
    localStorage.setItem(
      'esquizomon-rpg:v1',
      JSON.stringify({
        version: 3,
        tasks: [],
        character: {
          nivel: 1, xp: 0, xpProximo: 80, hp: 50, hpMax: 50, mana: 20, manaMax: 20,
          exhausted: false, lastDay: h, cartas: [], invocations: {},
        },
        settings: { tema: 'dark', ai: { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'chave-teste', systemPrompt: '' } },
        log: [],
        conversations: [],
        diary: [],
        notes: [],
      }),
    )
  }, hoje)
  await page.route('**/api/ia', (rota) => {
    void rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'boom' } }) })
  })
  await page.goto('/#/diary')
  await page.locator('[data-dayry-cronica]').first().click()
  await page.locator('[data-dayry-editor]').fill('Texto que vai receber a data como título.')
  await page.locator('[data-dayry-save]').click()
  const dataTitulo = `${hoje.slice(8, 10)}/${hoje.slice(5, 7)}/${hoje.slice(0, 4)}`
  await expect.poll(() => readState(page, 'diary.0.title')).toBe(dataTitulo)
})

test('diário: caret do editor de crônica NÃO pula pro início após autosave/re-render (bug 2026-09-27)', async ({ page }) => {
  await page.goto('/#/diary')
  await page.locator('[data-dayry-cronica]').first().click()
  const editor = page.locator('[data-dayry-editor]')
  await editor.click()
  await page.keyboard.type('xyz')
  await expect.poll(() => editor.evaluate((t) => (t as HTMLTextAreaElement).selectionStart)).toBe(3)
  // espera o autosave (800ms) + re-render
  await page.waitForTimeout(1600)
  await expect.poll(() => editor.evaluate((t) => (t as HTMLTextAreaElement).selectionStart)).toBe(3)
  await expect.poll(() => editor.evaluate((t) => (t as HTMLTextAreaElement).value)).toBe('xyz')
})

test('diário: o campo de captura mantém o foco e o valor através de um re-render COM dados novos (bug 2026-09-09)', async ({ page }) => {
  await page.goto('/#/diary')
  const input = page.locator('[data-note-input]')
  await input.fill('rascunho sendo digitado…')
  await expect(input).toBeFocused()

  // re-render externo com dado REAL novo (ex.: XP de outra tarefa/sync)
  await page.evaluate(async () => {
    const { appStore } = await import('/src/stores/app')
    const d = appStore.get()
    appStore.set({ ...d, character: { ...d.character, xp: (d.character?.xp ?? 0) + 1 } })
  })
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('rascunho sendo digitado…')
})

test('diário: nota captura a cidade via geolocalização do browser (granted)', async ({ page }) => {
  await page.goto('/#/diary')
  const origin = new URL(page.url()).origin
  await page.context().grantPermissions(['geolocation'], { origin })
  await page.context().setGeolocation({ latitude: -30.0346, longitude: -51.2177 }) // Porto Alegre
  // geocodificação reversa simulada (BigDataCloud)
  await page.route('**/reverse-geocode-client*', (rota) =>
    rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ city: 'Porto Alegre' }) }),
  )

  const input = page.locator('[data-note-input]')
  await input.fill('Reunião com o grupo')
  await input.press('Enter')

  // cidade anexada ao estado e renderizada no card
  await expect.poll(() => readState(page, 'notes.0.cidade')).toBe('Porto Alegre')
  await expect(page.locator('[data-note]').first().locator('.note-cidade')).toContainText('Porto Alegre')
  // só a cidade é guardada — coordenadas NÃO ficam no estado
  const e = (await readState(page, 'notes.0')) as Record<string, unknown>
  expect('latitude' in e).toBe(false)
  expect('longitude' in e).toBe(false)
})

test('diário: localização negada → registro fica sem cidade (sem prompt repetido)', async ({ page }) => {
  await page.goto('/#/diary')
  // geocodificação disponível, mas SEM permissão concedida → getCurrentPosition
  // dispara PERMISSION_DENIED e o app não consulta nada, nem repete o prompt
  await page.route('**/reverse-geocode-client*', (rota) =>
    rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ city: 'Porto Alegre' }) }),
  )
  const input = page.locator('[data-note-input]')
  await input.fill('Sem permissão de localização')
  await input.press('Enter')

  await expect(page.locator('[data-note]').first()).toContainText('Sem permissão de localização')
  await expect(page.locator('[data-note]').first().locator('.note-cidade')).toHaveCount(0)
  await expect.poll(() => readState(page, 'notes.0.cidade')).toBe(undefined)
})

test('diário: editar a cidade de uma nota pelo sheet (e editar o texto NÂO apaga a cidade)', async ({ page }) => {
  await page.goto('/#/diary')
  await page.context().grantPermissions(['geolocation'], { origin: new URL(page.url()).origin })
  await page.context().setGeolocation({ latitude: -30.0346, longitude: -51.2177 })
  await page.route('**/reverse-geocode-client*', (rota) =>
    rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ city: 'Porto Alegre' }) }),
  )
  const input = page.locator('[data-note-input]')
  await input.fill('nota com cidade automática')
  await input.press('Enter')
  await expect.poll(() => readState(page, 'notes.0.cidade')).toBe('Porto Alegre')

  // abre o sheet e edita a cidade + o texto
  await page.locator('[data-note]').first().click()
  const city = page.locator('[data-note-city]')
  await expect(city).toHaveValue('Porto Alegre')
  await city.fill('Gravataí')
  await page.locator('[data-note-edit]').fill('nota editada (texto novo, cidade mantida)')
  await page.locator('[data-note-save]').click()

  // texto editado PRESERVA a cidade (regressão do spread ...existing)
  await expect.poll(() => readState(page, 'notes.0.cidade')).toBe('Gravataí')
  expect(await readState(page, 'notes.0.text')).toContain('texto novo')
  await expect(page.locator('[data-note]').first().locator('.note-cidade')).toContainText('Gravataí')

  // limpar a cidade também é possível (vira undefined)
  await page.locator('[data-note]').first().click()
  await page.locator('[data-note-city]').fill('')
  await page.locator('[data-note-save]').click()
  await expect.poll(() => readState(page, 'notes.0.cidade')).toBe(undefined)
})

test('diário: editar a cidade da crônica pelo modal', async ({ page }) => {
  await page.goto('/#/diary')
  await page.locator('[data-dayry-cronica]').first().click()
  await page.locator('[data-dayry-editor]').fill('Crônica do dia com cidade registrada.')
  await expect(page.locator('[data-dayry-city]')).toHaveValue('')
  await page.locator('[data-dayry-city]').fill('Canoas')
  await page.locator('[data-dayry-save]').click()

  await expect.poll(() => readState(page, 'diary.0.cidade')).toBe('Canoas')
  await expect(page.locator('.note-card--cronica .note-cidade')).toContainText('Canoas')
  // o título digitado também persiste (campo já existente)
  await page.locator('[data-dayry-cronica]').first().click()
  await page.locator('[data-dayry-title]').fill('Dia marcante')
  await page.locator('[data-dayry-save]').click()
  await expect.poll(() => readState(page, 'diary.0.title')).toBe('Dia marcante')
})

test('diário: editar sobre o título AUTOMÁTICO substitui — não concatena (bug 2026-09-28)', async ({ page }) => {
  await page.goto('/#/diary')
  // crônica de HOJE sem título digitado → o título automático (data) preenche
  await page.locator('[data-dayry-cronica]').first().click()
  await page.locator('[data-dayry-editor]').fill('crônica que ganha título automático (data)')
  await expect.poll(() => readState(page, 'diary.0.title')).not.toBe('')
  await page.locator('[data-dayry-save]').click()
  // reabre e edita por cima do título automático
  await page.locator('[data-dayry-cronica]').first().click()
  const titulo = page.locator('[data-dayry-title]')
  await expect(titulo).not.toHaveValue('')
  await titulo.click()
  await page.waitForTimeout(120) // deixa o rAF re-selecionar (WebKit coloca o caret depois)
  // a seleção cobre o título inteiro
  const sel = await titulo.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd, el.value.length] as const)
  expect(sel[0]).toBe(0)
  expect(sel[1]).toBe(sel[2])
  // digitar por cima SUBSTITUI — SEM o prefixo da data
  await page.keyboard.type('Encontro do grupo')
  await page.locator('[data-dayry-save]').click()
  await expect.poll(() => readState(page, 'diary.0.title')).toBe('Encontro do grupo')
})

test('re-render NÃO acontece com appStore.set no-op — só quando há dados novos (bug 2026-09-09)', async ({ page }) => {
  await page.goto('/#/today')
  const mesmaInstancia = await page.evaluate(async () => {
    const { appStore } = await import('/src/stores/app')
    const el = document.querySelector('[data-s-sync]') // canário: a status bar é reconstruída num re-render
    const antes = el
    appStore.set({ ...appStore.get() }) // NO-OP: dados idênticos → não deve re-renderizar
    return document.querySelector('[data-s-sync]') === antes
  })
  expect(mesmaInstancia).toBe(true)
})