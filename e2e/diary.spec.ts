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





test('diário: importa registros em massa via markdown (cada dia vira uma NOTA com título)', async ({ page }) => {
  await page.goto('/#/diary')

  await page.locator('[data-dayry-import]').click()
  const markdown = `## ${ontem}\n**Ontem**\nPrimeira nota importada.\n\n## ${hoje}\n**Hoje**\nSegunda nota importada.\n\n- lista\n- markdown`
  await page.locator('[data-import-text]').fill(markdown)
  await page.locator('[data-import-run]').click()

  await expect(page.locator('#modal')).toBeHidden()
  await expect(page.locator('.toast').last()).toContainText('2 importada')

  // os dois dias viraram NOTAS (título vem do **Negrito**) na timeline
  await expect(page.locator('[data-note]')).toHaveCount(2)
  await expect(page.locator('.diary-timeline')).toContainText('Primeira nota importada')
  const importadas = (await readState(page, 'notes')) as Array<{ title?: string }>
  expect(importadas.filter((n) => n.title?.trim()).length).toBe(2)
})





test('diário: botão "gerar título com IA" VISÍVEL com IA ligada — gera e salva o título da NOTA', async ({ page }) => {
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
        settings: { tema: 'dark', ai: { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'chave', systemPrompt: '' } },
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
  await page.locator('[data-note-input]').fill('Texto do dia que recebe um título gerado sob demanda.')
  await page.locator('[data-note-input]').press('Enter')
  await page.locator('[data-note]').first().click()
  await expect(page.locator('[data-note-title-ai]')).toBeVisible()
  await page.locator('[data-note-title-ai]').click()
  // a IA preenche o campo de título e salva na nota
  await expect(page.locator('[data-note-title]')).toHaveValue('Vórtice')
  await page.locator('[data-note-save]').click()
  await expect.poll(() => readState(page, 'notes.0.title')).toBe('Vórtice')
  await expect(page.locator('.toast').last()).toContainText('Título sugerido')
})

test('diário: botão "gerar título com IA" INVISÍVEL sem a IA (BYOK) ligada', async ({ page }) => {
  await page.goto('/#/diary')
  await page.locator('[data-note-input]').fill('sem IA aqui')
  await page.locator('[data-note-input]').press('Enter')
  await page.locator('[data-note]').first().click()
  await expect(page.locator('[data-note-title-ai]')).toHaveCount(0)
})

test('diário: botão "gerar título com IA" mostra o MOTIVO real quando a IA falha (não o genérico)', async ({ page }) => {
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
        settings: { tema: 'dark', ai: { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'chave-invalida', systemPrompt: '' } },
        log: [],
        conversations: [],
        diary: [],
        notes: [],
      }),
    )
  }, hoje)
  // upstream devolve 401 → o AiError carrega a mensagem do upstream
  await page.route('**/api/ia', (rota) => {
    void rota.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Invalid Authentication' } }) })
  })
  await page.goto('/#/diary')
  await page.locator('[data-note-input]').fill('Um texto cujo título a IA não consegue gerar por chave inválida.')
  await page.locator('[data-note-input]').press('Enter')
  await page.locator('[data-note]').first().click()
  await page.locator('[data-note-title-ai]').click()
  // o toast mostra o motivo real do upstream (não o genérico)
  await expect(page.locator('.toast').last()).toContainText('Invalid Authentication')
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

test('diário: nota sem cidade — abrir o sheet PRÉ-PREENDE com a cidade atual', async ({ page }) => {
  await page.addInitScript((hoje) => {
    const k = 'esquizomon-rpg:v1'
    const d = JSON.parse(localStorage.getItem(k) ?? 'null') || { version: 3, character: { xp: 0, hp: 10, mana: 10, level: 1 } }
    d.notes = [{ id: 'n-sem-cidade', date: hoje, time: '09:00', text: 'nota ainda sem cidade', createdAt: new Date().toISOString() }]
    localStorage.setItem(k, JSON.stringify(d))
  }, hoje)
  await page.goto('/#/diary')
  await page.context().grantPermissions(['geolocation'], { origin: new URL(page.url()).origin })
  await page.context().setGeolocation({ latitude: -30.0346, longitude: -51.2177 })
  await page.route('**/reverse-geocode-client*', (rota) =>
    rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ city: 'Porto Alegre' }) }),
  )
  // abrir o sheet da nota sem cidade → campo já vem preenchido (e persistido)
  await page.locator('[data-note]').first().click()
  await expect(page.locator('[data-note-city]')).toHaveValue('Porto Alegre', { timeout: 5000 })
  await expect.poll(() => readState(page, 'notes.0.cidade')).toBe('Porto Alegre')
})







test('diário: excluir uma NOTA cria TOMBSTONE de sync (registro remove do estado)', async ({ page }) => {
  await page.goto('/#/diary')
  await page.locator('[data-note-input]').fill('nota p/ teste de tombstone')
  await page.locator('[data-note-input]').press('Enter')
  await expect.poll(() => readState(page, 'notes.0.text')).toContain('tombstone')
  // apaga a nota (sheet → excluir)
  await page.locator('[data-note]').first().click()
  await page.locator('[data-note-delete]').click()
  await page.locator('[data-modal-confirm]').click()
  // registro removido + tombstone criado (o merge não pode ressuscitar)
  await expect.poll(() => readState(page, 'notes')).toHaveLength(0)
  await expect.poll(async () => Object.keys((await readState(page, 'deletedNotes')) ?? {}).length).toBeGreaterThan(0)
})

test('diário: dá um TÍTULO a uma nota pela sheet e o card mostra (união 2026-09-28)', async ({ page }) => {
  await page.goto('/#/diary')
  await page.locator('[data-note-input]').fill('sem título ainda')
  await page.locator('[data-note-input]').press('Enter')
  await page.locator('[data-note]').first().click()
  await expect(page.locator('[data-note-title]')).toBeVisible()
  await page.locator('[data-note-title]').fill('Encontro do grupo')
  await page.locator('[data-note-save]').click()
  await expect(page.locator('#modal')).toBeHidden()
  // o título persiste e aparece no card
  await expect.poll(() => readState(page, 'notes.0.title')).toBe('Encontro do grupo')
  await expect(page.locator('[data-note]').first()).toContainText('Encontro do grupo')
})

test('diário: MIGRAÇÃO — crônica antiga (diary) vira NOTA com título preservado (2026-09-28)', async ({ page }) => {
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
        settings: { tema: 'dark' },
        log: [],
        conversations: [],
        diary: [{ id: 'c1', date: h, title: 'Meu dia', text: 'reflexão antiga', createdAt: `${h}T12:30:00Z` }],
        notes: [],
      }),
    )
  }, hoje)
  await page.goto('/#/diary')
  // virou nota, com o título da antiga crônica preservado; diary limpo
  await expect.poll(() => readState(page, 'notes.0.title')).toBe('Meu dia')
  await expect.poll(() => readState(page, 'notes.0.text')).toBe('reflexão antiga')
  await expect.poll(() => readState(page, 'diary')).toHaveLength(0)
  await expect(page.locator('.diary-timeline')).toContainText('Meu dia')
})

test('diário: a DATA e a HORA da nota são editáveis — a nota muda de dia', async ({ page }) => {
  await page.goto('/#/diary')
  await page.locator('[data-note-input]').fill('nota que vai mudar de dia')
  await page.locator('[data-note-input]').press('Enter')
  await page.locator('[data-note]').first().click()
  // edita a data (para ontem) e a hora
  await page.locator('[data-note-date-input]').fill(ontem)
  await page.locator('[data-note-time-input]').fill('07:15')
  await page.locator('[data-note-save]').click()
  await expect(page.locator('#modal')).toBeHidden()
  await expect.poll(() => readState(page, 'notes.0.date')).toBe(ontem)
  await expect.poll(() => readState(page, 'notes.0.time')).toBe('07:15')
  // a nota agora vive no dia de ONTEM, não mais em HOJE
  await expect(page.locator(`[data-note][data-note-date="${ontem}"]`)).toHaveCount(1)
  await expect(page.locator(`[data-note][data-note-date="${hoje}"]`)).toHaveCount(0)
})

test('diário: markdown da nota é renderizado no card (negrito, itálico, lista)', async ({ page }) => {
  await page.goto('/#/diary')
  await page.locator('[data-note-input]').fill('nota md')
  await page.locator('[data-note-input]').press('Enter')
  await page.locator('[data-note]').first().click()
  // entra via sheet (texto longo com markdown, sem o cap de 500 da captura)
  await page.locator('[data-note-edit]').fill('**negrito** e *itálico*\n\n- item um\n- item dois\n\n`código`')
  await page.locator('[data-note-save]').click()
  const card = page.locator('[data-note]').first()
  await expect(card.locator('strong')).toHaveText('negrito')
  await expect(card.locator('em')).toHaveText('itálico')
  await expect(card.locator('li')).toHaveCount(2)
  await expect(card.locator('code')).toHaveText('código')
  // o markdown vai pro storage em texto bruto, renderizado só na exibição
  await expect.poll(() => readState(page, 'notes.0.text')).toBe('**negrito** e *itálico*\n\n- item um\n- item dois\n\n`código`')
})

test('diário desktop: calendário de calor — dias com nota marcados, clique posiciona, escondido no mobile', async ({ page }) => {
  // dias do MÊS CORRENTE (o calendário abre no mês atual) — robusto à virada de mês:
  // dois dias distintos de hoje, dentro do mês, para alvo e para "sem nota"
  const diaHoje = Number(hoje.slice(8, 10))
  const candidatos = Array.from({ length: 28 }, (_, i) => i + 1).filter((n) => n !== diaHoje)
  const alvo = `${hoje.slice(0, 8)}${String(candidatos[0]).padStart(2, '0')}`
  const semNota = `${hoje.slice(0, 8)}${String(candidatos[1]).padStart(2, '0')}`

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(({ hoje, alvo }) => {
    const notes = [{ id: 'n-hoje', date: hoje, time: '10:00', text: 'nota de hoje', createdAt: hoje + 'T10:00:00Z' }]
    // dia com MUITAS notas (>=5) → ponto cheio
    for (let i = 0; i < 5; i++) notes.push({ id: `n-full-${i}`, date: alvo, time: `09:${i}0`, text: 'x', createdAt: alvo + 'T09:00:00Z' })
    localStorage.setItem(
      'esquizomon-rpg:v1',
      JSON.stringify({
        version: 4,
        tasks: [],
        character: { nivel: 1, xp: 0, xpProximo: 80, hp: 50, hpMax: 50, mana: 20, manaMax: 20, exhausted: false, lastDay: hoje, cartas: [], invocations: {} },
        settings: { tema: 'dark', ai: { provider: 'nenhum', apiKey: '', systemPrompt: '' } },
        log: [],
        conversations: [],
        diary: [],
        notes,
      }),
    )
  }, { hoje, alvo })

  await page.goto('/#/diary')
  // desktop (>=1100): calendário visível; dia com nota tem marcador, hoje tem anel
  await expect(page.locator('.diary-cal')).toBeVisible()
  await expect(page.locator(`.cel[data-cal-day="${alvo}"]`)).toHaveClass(/has|forte/)
  await expect(page.locator(`.cel[data-cal-day="${hoje}"]`)).toHaveClass(/hoje/)
  // clique num dia com nota → timeline destaca aquele dia
  await page.locator(`.cel[data-cal-day="${alvo}"]`).click()
  await expect(page.locator(`.timeline-day[data-day="${alvo}"].is-active`)).toHaveCount(1)
  // dia sem nota → toast
  await page.locator(`.cel[data-cal-day="${semNota}"]`).click()
  await expect(page.locator('.toast').last()).toContainText('Sem notas nesse dia.')
  // navegação de mês muda o rótulo (sem depender do mês corrente)
  const mesInicial = await page.locator('[data-cal-mes]').textContent()
  await page.locator('[data-cal-next]').click()
  await expect(page.locator('[data-cal-mes]')).not.toHaveText(mesInicial ?? '')

  // mobile/tablet: calendário escondido (coluna única permanece)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.locator('.diary-cal')).toBeHidden()
})

test('diário: paginação — timeline começa com os dias recentes e "ver anteriores" carrega mais', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(({ hoje }) => {
    const notes = Array.from({ length: 15 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (i + 1))
      const dd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return { id: `n-${i}`, date: dd, time: '08:00', text: `memo ${i + 1}`, createdAt: dd + 'T08:00:00Z' }
    })
    localStorage.setItem(
      'esquizomon-rpg:v1',
      JSON.stringify({
        version: 4,
        tasks: [],
        character: { nivel: 1, xp: 0, xpProximo: 80, hp: 50, hpMax: 50, mana: 20, manaMax: 20, exhausted: false, lastDay: hoje, cartas: [], invocations: {} },
        settings: { tema: 'dark', ai: { provider: 'nenhum', apiKey: '', systemPrompt: '' } },
        log: [], conversations: [], diary: [], notes,
      }),
    )
  }, { hoje })

  await page.goto('/#/diary')
  // só os 10 dias mais recentes montam + botão "ver dias anteriores"
  await expect(page.locator('.timeline-day')).toHaveCount(10)
  await expect(page.locator('[data-diario-mais]')).toBeVisible()
  const diaAntigo = dataLocal(-11)
  await expect(page.locator(`.timeline-day[data-day="${diaAntigo}"]`)).toHaveCount(0)

  // "ver anteriores" carrega o próximo lote (agora inclui o 11º dia)
  await page.click('[data-diario-mais]')
  await expect(page.locator(`.timeline-day[data-day="${diaAntigo}"]`)).toHaveCount(1)
  // todos os 16 dias carregaram → o botão some
  await expect(page.locator('[data-diario-mais]')).toHaveCount(0)
})

test('diário desktop: timeline mais larga (920px) e notas em coluna ÚNICA — mobile mantém coluna única', async ({ page }) => {
  // DESKTOP (1440×900)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/diary')
  const input = page.locator('[data-note-input]')
  for (let i = 0; i < 3; i++) {
    await input.fill(`nota desktop ${i + 1}`)
    await input.press('Enter')
  }
  await expect(page.locator('[data-note]')).toHaveCount(3)
  const desktop = await page.evaluate(() => {
    const tl = document.querySelector('.diary-timeline') as HTMLElement
    const notes = document.querySelector('.timeline-notes') as HTMLElement
    const cs = getComputedStyle(notes)
    return {
      timelineMax: tl ? getComputedStyle(tl).maxWidth : null,
      notesDisplay: cs.display,
    }
  })
  expect(desktop.timelineMax).toBe('920px')
  // coluna única em qualquer largura (grade removida — preferência do usuário)
  expect(desktop.notesDisplay).toBe('flex')

  // MOBILE (390×844) — coluna única intacta
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  const mobile = await page.evaluate(() => {
    const tl = document.querySelector('.diary-timeline') as HTMLElement
    const notes = document.querySelector('.timeline-notes') as HTMLElement
    const cs = getComputedStyle(notes)
    return {
      timelineMax: tl ? getComputedStyle(tl).maxWidth : null,
      notesDisplay: cs.display,
    }
  })
  expect(mobile.timelineMax).toBe('760px')
  expect(mobile.notesDisplay).toBe('flex')
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