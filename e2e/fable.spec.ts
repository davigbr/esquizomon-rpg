/** E2E — Fábula: resumo "Sobre você" salva, prompt injeta {resumo}/{diario}/cartas,
 *  marcador [[acao:invocar]] é parseado, e citar carta desbloqueada no diário dá XP. */
import { test, expect } from '@playwright/test'

/** Data LOCAL (YYYY-MM-DD) — o app usa datas locais; toISOString() é UTC e
 *  troca o dia à noite em fusos negativos (flakiness real 2026-08-12). */
function dataLocal(offsetDias = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const hoje = dataLocal()

/** Estado com a carta Ninho Enclausurado desbloqueada + mana sobrando.
 *  Semeia UMA vez: em reloads mantém o que o teste gravou (senão o seed
 *  sobrescreve mudanças e testes de persistência falham). */
async function semear(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(
    ({ hoje }) => {
      if (localStorage.getItem('esquizomon-rpg:v1')) return
      const d = {
        version: 3,
        tasks: [],
        character: {
          nivel: 1, xp: 0, xpProximo: 80, hp: 50, hpMax: 50, mana: 20, manaMax: 20,
          exhausted: false, lastDay: hoje,
          cartas: ['ninho-enclausurado'], invocations: {},
        },
        settings: { tema: 'dark' },
        log: [],
        conversations: [],
        diary: [],
      }
      localStorage.setItem('esquizomon-rpg:v1', JSON.stringify(d))
    },
    { hoje },
  )
}

test('config: efeitos sonoros têm toggle persistente (padrão ligado)', async ({ page }) => {
  await semear(page)
  await page.goto('/#/settings')
  const sel = page.locator('[data-sons]')
  await expect(sel).toHaveValue('on') // padrão ligado
  await sel.selectOption('off')
  await expect
    .poll(() =>
      page.evaluate(() => (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')?.settings?.sound ?? null)),
    )
    .toBe(false)
  await page.reload()
  await expect(page.locator('[data-sons]')).toHaveValue('off')
})

test('config: tema tem opção "sistema" como padrão e persiste a escolha', async ({ page }) => {
  await page.goto('/#/settings') // sem seed: instalação nova
  const sel = page.locator('[data-tema]')
  await expect(sel).toHaveValue('sistema') // padrão = segue o SO
  await sel.selectOption('dark')
  await expect.poll(() =>
    page.evaluate(() => (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')?.settings?.theme ?? null)),
  ).toBe('dark')
  await expect(page.evaluate(() => document.documentElement.dataset.theme)).resolves.toBe('dark')
})

test('config: avatar — upload, corte quadrado, compressão e exibição ao lado do nível', async ({ page }) => {
  await semear(page)
  await page.goto('/#/settings')
  await page.locator('[data-avatar-choose]').click()
  await page.locator('[data-avatar-arquivo]').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    ),
  })
  // modal de corte abre; salva
  await expect(page.locator('[data-avatar-janela]')).toBeVisible()
  await page.locator('[data-avatar-save]').click()
  // avatar persistido como JPEG comprimido
  await expect
    .poll(() =>
      page.evaluate(() => (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')?.character?.avatar ?? '').startsWith('data:image/jpeg')),
    )
    .toBe(true)
  // status bar: avatar à esquerda do nível
  await page.goto('/#/today')
  const avatar = await page.locator('.status-avatar').boundingBox()
  const nivel = await page.locator('.status-item--nivel').boundingBox()
  expect(avatar).not.toBeNull()
  expect(nivel).not.toBeNull()
  expect(avatar!.x).toBeLessThan(nivel!.x)
  // remover com confirmação
  await page.goto('/#/settings')
  await page.locator('[data-avatar-remove]').click()
  await page.locator('[data-modal-confirm]').click()
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')?.character?.avatar ?? null))
    .toBe(null)
})

test('config: nome monstruoso salva e aparece em negrito ao lado do avatar', async ({ page }) => {
  await semearChat(page)
  await page.goto('/#/settings')
  await page.locator('[data-monster-name]').fill('Devorador de Segundas')
  await page.locator('[data-monster-name]').blur()
  await expect.poll(() =>
    page.evaluate(() => JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')?.character?.monsterName ?? null),
  ).toBe('Devorador de Segundas')

  // status bar: nome bold à direita do avatar
  await page.goto('/#/today')
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')
    d.character.avatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    localStorage.setItem('esquizomon-rpg:v1', JSON.stringify(d))
  })
  await page.reload()
  const nome = page.locator('.status-name')
  await expect(nome).toHaveText('Devorador de Segundas')
  await expect(nome).toHaveCSS('font-weight', '700')
  const boxNome = await nome.boundingBox()
  const boxAvatar = await page.locator('.status-avatar').boundingBox()
  expect(boxNome!.x).toBeGreaterThan(boxAvatar!.x + boxAvatar!.width) // à direita do avatar

  // a Fábula recebe o nome monstruoso no estado (para se referir ao jogador)
  const corpos: string[] = []
  await page.route('**/api/ia', (rota) => {
    corpos.push(rota.request().postData() ?? '')
    void rota.fulfill({ status: 200, contentType: 'text/event-stream', body: sseFake('Fala, monstro.') })
  })
  await page.click('#fabula-toggle')
  await page.locator('[data-fabula-input]').fill('Fala comigo')
  await page.locator('[data-fabula-input]').press('Enter')
  await expect(page.locator('.fable-bubble--assistant')).toContainText('Fala, monstro.')
  const corpo = JSON.parse(corpos[corpos.length - 1]) as { messages: { role: string; content: string }[] }
  expect(corpo.messages[0].content).toContain('NOME MONSTRUOSO: Devorador de Segundas')
})

test('config: "Sobre você" salva o resumo e persiste no reload', async ({ page }) => {
  await page.goto('/#/settings')
  const field = page.locator('[data-resumo]')
  await expect(field).toBeVisible()
  await field.fill('Mestrando em psicologia, atendo, escrevo, treino calistenia.')
  await field.blur()

  await expect
    .poll(() =>
      page.evaluate(() => (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')?.settings?.summary ?? '')),
    )
    .toBe('Mestrando em psicologia, atendo, escrevo, treino calistenia.')

  await page.reload()
  await expect(page.locator('[data-resumo]')).toHaveValue('Mestrando em psicologia, atendo, escrevo, treino calistenia.')
})

test('fabula: prompt injeta {resumo}, cartas desbloqueadas e o protocolo de invocação', async ({ page }) => {
  await semear(page)
  await page.goto('/#/settings')
  await page.locator('[data-resumo]').fill('Vivo com a Aline e duas gatas.')
  await page.locator('[data-resumo]').blur()
  await page.goto('/#/diary')
  await page.locator('[data-dayry-new]').click()
  await page.locator('[data-dayry-editor]').fill('Hoje lembrei do Ninho Enclausurado.')
  await page.keyboard.press('Tab')

  const prompt = await page.evaluate(async () => {
    const { buildSystemPrompt } = await import('/src/ia/prompt')
    const { appStore } = await import('/src/stores/app')
    return buildSystemPrompt(appStore.get())
  })
  expect(prompt).toContain('Rizomante')
  expect(prompt).toContain('Vivo com a Aline e duas gatas.')
  expect(prompt).toContain('ninho-enclausurado → Ninho Enclausurado')
  expect(prompt).toContain('AÇÕES DISPONÍVEIS')
  // protocolo novo: invocação é do APP; mencionar carta NÃO invoca
  expect(prompt).toContain('MENCIONAR NÃO É INVOCAR')
  expect(prompt).toContain('INVOCAÇÃO É DO APP')
})

test('fabula: marcador [[acao:invocar]] é extraído e removido do texto', async ({ page }) => {
  await page.goto('/#/today')
  const res = await page.evaluate(async () => {
    const { extractActions } = await import('/src/ia/acoes')
    return extractActions(
      'A carta chega como um alívio.\n[[acao:{"tipo":"invocar","carta":"ninho-enclausurado"}]]',
    )
  })
  expect(res.text).toBe('A carta chega como um alívio.')
  expect(res.actions).toHaveLength(1)
  expect(res.actions[0]).toEqual({ type: 'invocar', card: 'ninho-enclausurado' })

  // marcador malformado é removido sem executar
  const invalido = await page.evaluate(async () => {
    const { extractActions } = await import('/src/ia/acoes')
    return extractActions('texto [[acao:{{quebrado]] resto')
  })
  expect(invalido.actions).toHaveLength(0)
  expect(invalido.text).toBe('texto  resto')
})

test('fabula: as últimas entradas do diário entram NA ÍNTEGRA no prompt (sem truncar)', async ({ page }) => {
  await semear(page)
  await page.goto('/#/diary')
  await page.locator('[data-dayry-new]').click()

  // entrada longa (bem acima do antigo corte de 600 chars)
  const longo = 'A'.repeat(800) + ' FIM-DO-REGISTRO-INTEGRO'
  await page.locator('[data-dayry-editor]').fill(longo)
  await page.keyboard.press('Tab')

  await expect
    .poll(() =>
      page.evaluate(() => (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')?.diary?.[0]?.text ?? '')),
    )
    .toBe(longo)

  const prompt = await page.evaluate(async () => {
    const { buildSystemPrompt } = await import('/src/ia/prompt')
    const { appStore } = await import('/src/stores/app')
    return buildSystemPrompt(appStore.get())
  })
  expect(prompt).toContain('FIM-DO-REGISTRO-INTEGRO')
  expect(prompt).toContain('SOBRE O ESQUIZOMON')
  expect(prompt).toContain('O QUE VOCÊ PODE E DEVE FAZER')
})

test('fabula: invokeCard (via chat) desconta mana e registra', async ({ page }) => {
  await semear(page)
  await page.goto('/#/today')
  await expect(page.locator('[data-s-mana]')).toHaveText('Mana 20/20')

  const res = await page.evaluate(async () => {
    const { invokeCard } = await import('/src/stores/app')
    const ok = invokeCard('ninho-enclausurado') // captura → custo 8
    const mana = (await import('/src/stores/app')).appStore.get().character.mana
    return { ok: ok.ok, mana }
  })
  expect(res.ok).toBe(true)
  expect(res.mana).toBe(12)

  // sem mana → recusa
  const semMana = await page.evaluate(async () => {
    const mod = await import('/src/stores/app')
    mod.appStore.set({ ...mod.appStore.get(), character: { ...mod.appStore.get().character, mana: 1 } })
    return mod.invokeCard('ninho-enclausurado')
  })
  expect(semMana.ok).toBe(false)
})

/** Seed com IA configurada (provider fake) + carta desbloqueada + mana.
 *  Semeia UMA vez (idempotente como o semear): reloads mantêm o que o teste
 *  gravou — senão o nome/avatar salvo some e testes de persistência falham. */
async function semearChat(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(
    ({ hoje }) => {
      if (localStorage.getItem('esquizomon-rpg:v1')) return
      const d = {
        version: 3,
        tasks: [],
        character: {
          nivel: 1, xp: 0, xpProximo: 80, hp: 50, hpMax: 50, mana: 20, manaMax: 20,
          exhausted: false, lastDay: hoje,
          cartas: ['ninho-enclausurado'], invocations: {},
        },
        settings: {
          tema: 'dark',
          ai: { provider: 'deepseek', model: '', apiKey: 'chave-fake', systemPrompt: '' },
        },
        log: [],
        conversations: [],
        diary: [],
      }
      localStorage.setItem('esquizomon-rpg:v1', JSON.stringify(d))
    },
    { hoje },
  )
}

/** Resposta SSE fake (formato OpenAI-compat que o cliente espera). */
function sseFake(conteudo: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: conteudo } }] })}\n\ndata: [DONE]\n`
}

test('fabula: o histórico completo vai pra IA (mensagens anteriores + a atual)', async ({ page }) => {
  await semearChat(page)
  const corpos: string[] = []
  await page.route('**/api/ia', (rota) => {
    corpos.push(rota.request().postData() ?? '')
    void rota.fulfill({ status: 200, contentType: 'text/event-stream', body: sseFake('Resposta da Fábula') })
  })

  await page.goto('/#/today')
  await page.click('#fabula-toggle')
  await page.locator('[data-fabula-nova]').click() // cria a conversa (input desabilita sem ela)
  const input = page.locator('[data-fabula-input]')
  await input.fill('primeira mensagem')
  await page.keyboard.press('Enter')
  await expect(page.locator('.fable-bubble--assistant')).toHaveCount(1)

  await input.fill('segunda mensagem')
  await page.keyboard.press('Enter')
  await expect(page.locator('.fable-bubble--assistant')).toHaveCount(2)

  // o segundo request traz TUDO: user1, resposta1 E a mensagem atual no fim
  const corpo = JSON.parse(corpos[corpos.length - 1])
  const conteudos = corpo.messages.map((m: { content: string }) => m.content)
  expect(conteudos).toContain('primeira mensagem')
  expect(conteudos).toContain('Resposta da Fábula')
  expect(conteudos[conteudos.length - 1]).toBe('segunda mensagem')
})

test('fabula: "invoca a carta X" executa no app, desconta mana e mostra a miniatura', async ({ page }) => {
  await semearChat(page)
  const corpos: string[] = []
  await page.route('**/api/ia', (rota) => {
    corpos.push(rota.request().postData() ?? '')
    void rota.fulfill({ status: 200, contentType: 'text/event-stream', body: sseFake('A carta chega.') })
  })

  await page.goto('/#/today')
  await page.click('#fabula-toggle')
  await page.locator('[data-fabula-nova]').click() // cria a conversa
  await page.locator('[data-fabula-input]').fill('invoca a carta Ninho Enclausurado')
  await page.keyboard.press('Enter')
  await expect(page.locator('.fable-bubble--assistant')).toHaveCount(1)

  // mana descontou (20 → 12, captura custa 8) e a bolha exibe a miniatura da carta
  await expect(page.locator('[data-s-mana]')).toHaveText('Mana 12/20')
  const img = page.locator('.fable-bubble--assistant img.fable-card')
  await expect(img).toBeVisible()
  await expect(img).toHaveAttribute('src', '/images/cards/ninho-enclausurado.png')

  // a nota de sistema (invocação executada) foi enviada pra IA
  const corpo = JSON.parse(corpos[corpos.length - 1])
  const sistema = corpo.messages
    .filter((m: { role: string }) => m.role === 'system')
    .map((m: { content: string }) => m.content)
    .join('\n')
  expect(sistema).toContain('FOI invocada')

  // carta BLOQUEADA → mana intacta e nota de bloqueio
  await page.locator('[data-fabula-input]').fill('invoca a carta Internato de Ferro')
  await page.keyboard.press('Enter')
  await expect(page.locator('.fable-bubble--assistant')).toHaveCount(2)
  await expect(page.locator('[data-s-mana]')).toHaveText('Mana 12/20')
  const corpo2 = JSON.parse(corpos[corpos.length - 1])
  const sistema2 = corpo2.messages
    .filter((m: { role: string }) => m.role === 'system')
    .map((m: { content: string }) => m.content)
    .join('\n')
  expect(sistema2).toContain('BLOQUEADA')
  // sem miniatura na segunda bolha (carta não foi invocada)
  await expect(page.locator('.fable-bubble--assistant img.fable-card')).toHaveCount(1)
})

test('fabula: resposta vazia da IA não cobra mana do /analisar (bug 2026-08-30)', async ({ page }) => {
  await semearChat(page)
  let chamada = 0
  await page.route('**/api/ia', (rota) => {
    chamada += 1
    // 1ª: retorno vazio/silencioso (não mostra nada); 2ª: resposta real
    const corpo = chamada === 1 ? '' : 'Aqui está a análise esquizoanalítica.'
    void rota.fulfill({ status: 200, contentType: 'text/event-stream', body: sseFake(corpo) })
  })

  await page.goto('/#/today')
  await page.click('#fabula-toggle')
  await page.locator('[data-fabula-nova]').click()
  const input = page.locator('[data-fabula-input]')
  input.fill('/analisar')
  await input.press('Enter')

  // resposta vazia → NENHUMA bolha da Fábula e mana INTACTA (20/20)
  await expect(page.locator('.fable-bubble--user')).toHaveCount(1)
  await page.waitForTimeout(400)
  await expect(page.locator('.fable-bubble--assistant')).toHaveCount(0)
  await expect(page.locator('[data-s-mana]')).toHaveText('Mana 20/20')

  // resposta real → acontece o desconto normal (20 → 10)
  input.fill('/analisar')
  await input.press('Enter')
  await expect(page.locator('.fable-bubble--assistant')).toHaveCount(1)
  await expect(page.locator('[data-s-mana]')).toHaveText('Mana 10/20')
})

test('fabula: cada mensagem tem botão copiar (markdown; carta vira nome)', async ({ page, context }) => {
  await semear(page)
  await page.addInitScript(() => {
    localStorage.setItem('esquizomon-rpg:chat-painel', JSON.stringify({ open: false, activeConversationId: 'conv-copia' }))
  })
  await page.addInitScript(() => {
    const d = JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')
    d.conversations = [
      {
        id: 'conv-copia',
        title: 'Sobre o dia',
        atualizadaEm: '2026-08-12T14:00:00.000Z',
        messages: [
          { role: 'user', content: 'primeira mensagem', ts: '2026-08-12T14:00:00.000Z' },
          {
            role: 'assistant',
            content: 'A carta chega como um alívio.\n[[carta:ninho-enclausurado]]',
            ts: '2026-08-12T14:01:00.000Z',
          },
        ],
      },
    ]
    localStorage.setItem('esquizomon-rpg:v1', JSON.stringify(d))
  })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  // Espião determinístico: captura o que o app manda pro clipboard sem depender
  // de foco/permissão do contexto headless (readText é flaky em CI).
  await page.addInitScript(() => {
    const clip = navigator.clipboard
    if (clip && typeof clip.writeText === 'function') {
      const original = clip.writeText.bind(clip)
      clip.writeText = async (texto: string) => {
        ;(window as unknown as { __ultimoCopiado: string }).__ultimoCopiado = texto
        return original(texto)
      }
    }
  })

  await page.goto('/#/today')
  await page.click('#fabula-toggle')
  await expect(page.locator('.fable-bubble--assistant')).toHaveCount(1)

  // o botão de copiar é POR MENSAGEM (cabeçalho não tem mais)
  await expect(page.locator('[data-fabula-copiar]')).toHaveCount(0)
  await expect(page.locator('[data-fabula-copiar-msg]')).toHaveCount(2)

  // copia a mensagem da Fábula: o marcador vira o nome da carta em itálico
  await page.locator('.fable-bubble--assistant [data-fabula-copiar-msg]').click()
  const fabula = await page.evaluate(() => (window as unknown as { __ultimoCopiado?: string }).__ultimoCopiado ?? '')
  expect(fabula).toBe('A carta chega como um alívio.\n*Ninho Enclausurado*')

  // copia a mensagem do usuário: texto cru
  await page.locator('.fable-bubble--user [data-fabula-copiar-msg]').click()
  const voce = await page.evaluate(() => (window as unknown as { __ultimoCopiado?: string }).__ultimoCopiado ?? '')
  expect(voce).toBe('primeira mensagem')

  // conversa nova (vazia): nenhuma bolha, nenhum botão
  await page.click('[data-fabula-nova]')
  await expect(page.locator('[data-fabula-copiar-msg]')).toHaveCount(0)
})

test('fabula: conversa pode ser renomeada (Enter salva e persiste)', async ({ page }) => {
  await semear(page)
  await page.addInitScript(() => {
    localStorage.setItem('esquizomon-rpg:chat-painel', JSON.stringify({ open: false, activeConversationId: 'conv-renome' }))
  })
  await page.addInitScript(() => {
    const d = JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')
    d.conversations = [
      {
        id: 'conv-renome',
        title: 'Título automático da primeira mensagem',
        atualizadaEm: '2026-08-12T14:00:00.000Z',
        messages: [{ role: 'user', content: 'olá', ts: '2026-08-12T14:00:00.000Z' }],
      },
    ]
    localStorage.setItem('esquizomon-rpg:v1', JSON.stringify(d))
  })

  await page.goto('/#/today')
  await page.click('#fabula-toggle')
  await page.click('[data-fabula-renomear]')

  const input = page.locator('[data-fabula-titulo-input]')
  await expect(input).toBeVisible()
  await input.fill('Sobre os monstros de agosto')
  await page.keyboard.press('Enter')

  // o input some, a lista lateral mostra o título novo e o storage persiste
  await expect(input).toHaveCount(0)
  await expect(page.locator('.fable-item--active .fable-item-title')).toHaveText('Sobre os monstros de agosto')
  await expect
    .poll(() =>
      page.evaluate(() =>
        (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')?.conversations?.[0]?.title ?? '')),
    )
    .toBe('Sobre os monstros de agosto')
})

test('fabula: mencionar uma carta NÃO invoca (mana intacta; marcador do modelo ignorado)', async ({ page }) => {
  await semearChat(page)
  await page.route('**/api/ia', (rota) => {
    void rota.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sseFake('Essa carta é um bom espelho.\n[[acao:{"tipo":"invocar","carta":"ninho-enclausurado"}]]'),
    })
  })

  await page.goto('/#/today')
  await page.click('#fabula-toggle')
  await page.locator('[data-fabula-nova]').click()
  await page.locator('[data-fabula-input]').fill('essa carta Ninho Enclausurado me visitou no diário')
  await page.keyboard.press('Enter')
  await expect(page.locator('.fable-bubble--assistant')).toHaveCount(1)

  // menção ≠ pedido: mana intacta, sem miniatura, marcador ignorado com aviso
  await expect(page.locator('[data-s-mana]')).toHaveText('Mana 20/20')
  await expect(page.locator('.fable-bubble--assistant img.fable-card')).toHaveCount(0)
  await expect(page.locator('.fable-bubble--assistant')).toContainText('só por pedido explícito')
})

test('fabula: /invocar com autocomplete escolhe a carta e invoca (mana normal)', async ({ page }) => {
  await semearChat(page)
  await page.route('**/api/ia', (rota) => {
    void rota.fulfill({ status: 200, contentType: 'text/event-stream', body: sseFake('A carta chega.') })
  })

  await page.goto('/#/today')
  await page.click('#fabula-toggle')
  await page.locator('[data-fabula-nova]').click()
  const input = page.locator('[data-fabula-input]')

  // "/" abre os comandos (invocar, analisar, capturas); Enter completa "/invocar "
  await input.fill('/')
  await expect(page.locator('.fable-suggestion')).toHaveCount(3)
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('/invocar ')

  // "ninho" filtra as cartas desbloqueadas; Enter completa o nome
  await input.fill('/invocar ninho')
  await expect(page.locator('.fable-suggestion').first()).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('/invocar Ninho Enclausurado')

  // Enter com dropdown fechado ENVIA
  await page.keyboard.press('Enter')
  await expect(page.locator('.fable-bubble--assistant')).toHaveCount(1)

  // captura custa 8 → 20−8 = 12; o texto CRU do comando fica no histórico
  await expect(page.locator('[data-s-mana]')).toHaveText('Mana 12/20')
  await expect(page.locator('.fable-bubble--assistant img.fable-card')).toBeVisible()
  const corpo = await page.evaluate(async () => {
    const { appStore } = await import('/src/stores/app')
    const c = appStore.get().conversations?.[0]
    return c?.messages?.[0]?.content ?? ''
  })
  expect(corpo).toBe('/invocar Ninho Enclausurado')
})

test('fabula: /invocar sem nome — a Fábula escolhe a carta (custo premium ×1,5)', async ({ page }) => {
  await semearChat(page)
  const corpos: string[] = []
  await page.route('**/api/ia', (rota) => {
    corpos.push(rota.request().postData() ?? '')
    void rota.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sseFake('Escolho esta: Ninho Enclausurado.\\n[[acao: {"tipo":"invocar","carta":"ninho-enclausurado"}]]'),
    })
  })

  await page.goto('/#/today')
  await page.click('#fabula-toggle')
  await page.locator('[data-fabula-nova]').click()
  await page.locator('[data-fabula-input]').fill('/invocar')
  await page.keyboard.press('Enter')
  await expect(page.locator('.fable-bubble--assistant')).toHaveCount(1)

  // captura premium: 8 × 1,5 = 12 → 20−12 = 8; nota de escolha + miniatura
  await expect(page.locator('[data-s-mana]')).toHaveText('Mana 8/20')
  await expect(page.locator('.fable-bubble--assistant')).toContainText('escolhida pela Fábula')
  await expect(page.locator('.fable-bubble--assistant img.fable-card')).toBeVisible()
  const corpo = JSON.parse(corpos[corpos.length - 1])
  const sistema = corpo.messages
    .filter((m: { role: string }) => m.role === 'system')
    .map((m: { content: string }) => m.content)
    .join('\n')
  expect(sistema).toContain('custo PREMIUM')
})

test('fabula: /analisar desconta 10 de mana e pede análise esquizoanalítica', async ({ page }) => {
  await semearChat(page)
  const corpos: string[] = []
  await page.route('**/api/ia', (rota) => {
    corpos.push(rota.request().postData() ?? '')
    void rota.fulfill({ status: 200, contentType: 'text/event-stream', body: sseFake('Sua máquina do mês...') })
  })

  await page.goto('/#/today')
  await page.click('#fabula-toggle')
  await page.locator('[data-fabula-nova]').click()
  await page.locator('[data-fabula-input]').fill('/analisar')
  await page.keyboard.press('Enter')
  await expect(page.locator('.fable-bubble--assistant')).toHaveCount(1)

  await expect(page.locator('[data-s-mana]')).toHaveText('Mana 10/20')
  const corpo = JSON.parse(corpos[corpos.length - 1])
  const sistema = corpo.messages
    .filter((m: { role: string }) => m.role === 'system')
    .map((m: { content: string }) => m.content)
    .join('\n')
  expect(sistema).toContain('máquinas desejantes') // a voz do Esquizoanalista (vault) entra no system
  const conteudos = corpo.messages.map((m: { content: string }) => m.content)
  // o comando cru vai pro histórico (e pra Fábula) como digitado
  expect(conteudos).toContain('/analisar')
})

test('hábito: marcar no dia anterior (ontem) marca retroativo e dá XP', async ({ page }) => {
  await semear(page)
  await page.goto('/#/today')
  // adiciona um hábito positivo ao estado
  await page.evaluate(async () => {
    const mod = await import('/src/stores/app')
    const agora = new Date().toISOString()
    const d = mod.appStore.get()
    mod.appStore.set({
      ...d,
      tasks: [{
        id: 'h1', title: 'Ler', type: 'habito', difficulty: 'facil', sinal: 'positivo', notas: '',
        history: [], contador: { hoje: 0, hojeNeg: 0, totalPositivo: 0, totalNegativo: 0 },
        tags: [], createdAt: agora, updatedAt: agora, recompensas: {},
      }],
    })
  })
  // navega para ONTEM
  await page.locator('[data-prev-day]').click()
  const xp0 = await page.evaluate(() => JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}').character.xp)
  // o botão positivo está habilitado em ontem (retroativo)
  await expect(page.locator('[data-habit="positivo"]')).toBeEnabled()
  await page.locator('[data-habit="positivo"]').click()
  await expect(page.locator('.toast').last()).toContainText('Repetição registrada')
  const xp1 = await page.evaluate(() => JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}').character.xp)
  expect(xp1).toBe(xp0 + 10) // hábito fácil = +10 XP
  // streak do dia visível = 1 (marked retroativa/ontem)
  await expect(page.locator('.habit-card')).toContainText('seq 1')
  // clicar de novo (dedup em dia passado) NÃO dá XP de novo
  const xpAntesDedup = await page.evaluate(() => JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}').character.xp)
  await page.locator('[data-habit="positivo"]').click()
  const xpDepoisDedup = await page.evaluate(() => JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}').character.xp)
  expect(xpDepoisDedup).toBe(xpAntesDedup)
  // antes de ontem: botão desabilitado
  await page.locator('[data-prev-day]').click() // agora em "anteontem"
  await expect(page.locator('[data-habit="positivo"]')).toBeDisabled()
})

test('fabula: menção de carta no diário dá +10 XP (uma vez por dia)', async ({ page }) => {
  await semearChat(page)
  const corpos: string[] = []
  await page.route('**/api/ia', (rota) => {
    corpos.push(rota.request().postData() ?? '')
    void rota.fulfill({ status: 200, contentType: 'text/event-stream', body: sseFake('Que conexão linda...') })
  })
  const hoje = dataLocal()
  await page.goto('/#/today')
  await page.evaluate(
    async (h: string) => {
      const mod = await import('/src/stores/app')
      const d = mod.appStore.get()
      mod.appStore.set({
        ...d,
        diary: [{ id: 'm1', date: h, title: 'teste', text: 'Hoje fui cercado pelo Ninho Enclausurado.' }],
      })
    },
    hoje,
  )
  await page.click('#fabula-toggle')
  await page.locator('[data-fabula-nova]').click()
  await page.locator('[data-fabula-input]').fill('oi')
  await page.keyboard.press('Enter')
  await expect(page.locator('.fable-bubble--assistant')).toHaveCount(1)
  const xp1 = await page.evaluate(() => JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}').character.xp)
  expect(xp1).toBeGreaterThanOrEqual(10)

  // a Fábula foi avisada (nota de sistema) com o nome + o XP
  const corpo = JSON.parse(corpos[corpos.length - 1])
  const sistema = corpo.messages
    .filter((m: { role: string }) => m.role === 'system')
    .map((m: { content: string }) => m.content)
    .join('\n')
  expect(sistema).toContain('Ninho Enclausurado')
  expect(sistema).toContain('+10 XP')

  // 2ª interação: não dá XP de novo (record diarioXp)
  await page.locator('[data-fabula-input]').fill('oi de novo')
  await page.keyboard.press('Enter')
  await expect(page.locator('.fable-bubble--assistant')).toHaveCount(2)
  const xp2 = await page.evaluate(() => JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}').character.xp)
  expect(xp2).toBe(xp1)
})

test('fabula: /capturas desconta 25 de mana e pede a varredura das capturas', async ({ page }) => {
  await semearChat(page)
  const corpos: string[] = []
  await page.route('**/api/ia', (rota) => {
    corpos.push(rota.request().postData() ?? '')
    void rota.fulfill({ status: 200, contentType: 'text/event-stream', body: sseFake('A Câmara dos Ecos está active...') })
  })

  await page.goto('/#/today')
  // o seed traz mana 20/max 20 — o /capturas custa 25; subir no STORE (o app
  // normaliza o storage no boot e o addInitScript extra não sobrevive)
  await page.evaluate(async () => {
    const mod = await import('/src/stores/app')
    const p = mod.appStore.get().character
    mod.appStore.set({ ...mod.appStore.get(), character: { ...p, mana: 40, manaMax: 40 } })
  })
  await page.click('#fabula-toggle')
  await page.locator('[data-fabula-nova]').click()
  await page.locator('[data-fabula-input]').fill('/capturas')
  await page.locator('[data-fabula-form]').press('Enter')
  // o desconto acontece com a RESPOSTA (não antes) — bolha primeiro, toast depois
  await expect(page.locator('.fable-bubble--assistant')).toContainText('Câmara')
  await expect(page.locator('.toast').last()).toContainText('25')
  const mana = await page.evaluate(() => (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}') as { character: { mana: number } }).character.mana)
  expect(mana).toBe(15) // 40 − 25
  const corpo = JSON.parse(corpos[corpos.length - 1])
  const sistema = corpo.messages
    .filter((m: { role: string }) => m.role === 'system')
    .map((m: { content: string }) => m.content)
    .join('\n')
  expect(sistema).toContain('VARREDURA DE CAPTURAS')
  const conteudos = corpo.messages.map((m: { content: string }) => m.content)
  expect(conteudos).toContain('/capturas')
})

test('fabula: /capturas sem mana — a Fábula explica no chat (mana intacta)', async ({ page }) => {
  await semearChat(page)
  const corpos: string[] = []
  await page.route('**/api/ia', (rota) => {
    corpos.push(rota.request().postData() ?? '')
    void rota.fulfill({ status: 200, contentType: 'text/event-stream', body: sseFake('Guarde suas forças.') })
  })
  // mana baixa: 10 < 25
  await page.addInitScript(() => {
    const d = JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')
    d.character.mana = 10
    localStorage.setItem('esquizomon-rpg:v1', JSON.stringify(d))
  })

  await page.goto('/#/today')
  await page.click('#fabula-toggle')
  await page.locator('[data-fabula-nova]').click()
  await page.locator('[data-fabula-input]').fill('/capturas')
  await page.locator('[data-fabula-form]').press('Enter')
  await expect(page.locator('.fable-bubble--assistant')).toContainText('forças')
  const mana = await page.evaluate(() => (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}') as { character: { mana: number } }).character.mana)
  expect(mana).toBe(10) // intacta
})

test('fabula: /analisar sem mana — a Fábula explica no chat (mana intacta)', async ({ page }) => {
  await semearChat(page)
  const corpos: string[] = []
  await page.route('**/api/ia', (rota) => {
    corpos.push(rota.request().postData() ?? '')
    void rota.fulfill({ status: 200, contentType: 'text/event-stream', body: sseFake('Guarde suas forças.') })
  })
  // mana baixa: 5 < 10
  await page.addInitScript(() => {
    const d = JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')
    d.character.mana = 5
    localStorage.setItem('esquizomon-rpg:v1', JSON.stringify(d))
  })

  await page.goto('/#/today')
  await page.click('#fabula-toggle')
  await page.locator('[data-fabula-nova]').click()
  await page.locator('[data-fabula-input]').fill('/analisar')
  await page.keyboard.press('Enter')
  await expect(page.locator('.fable-bubble--assistant')).toHaveCount(1)

  // mana NÃO descontou e a Fábula foi avisada pra recusar com delicadeza
  await expect(page.locator('[data-s-mana]')).toHaveText('Mana 5/20')
  const corpo = JSON.parse(corpos[corpos.length - 1])
  const sistema = corpo.messages
    .filter((m: { role: string }) => m.role === 'system')
    .map((m: { content: string }) => m.content)
    .join('\n')
  expect(sistema).toContain('não tem mana suficiente')
})

test('fabula: resposta vazia do modelo vira erro visível (sem bolha vazia)', async ({ page }) => {
  await semearChat(page)
  await page.route('**/api/ia', (rota) => {
    void rota.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: [DONE]\n' })
  })

  await page.goto('/#/today')
  await page.click('#fabula-toggle')
  await page.locator('[data-fabula-nova]').click()
  await page.locator('[data-fabula-input]').fill('olá')
  await page.keyboard.press('Enter')

  // nenhuma bolha do assistente é salva; toast de erro aparece
  await expect(page.locator('.fable-bubble--assistant')).toHaveCount(0)
  await expect(page.locator('.toast').last()).toContainText('não respondeu nada')
})

test('fabula: resposta em markdown renderiza negrito, lista, tabela e itálico na bolha', async ({ page }) => {
  await semearChat(page)
  const markdown =
    '**Negrito** e *itálico*.\n\n- item um\n- item dois\n\n| Carta | Tipo |\n| --- | --- |\n| Ninho | Captura |\n\n[[carta:ninho-enclausurado]]'
  await page.route('**/api/ia', (rota) => {
    void rota.fulfill({ status: 200, contentType: 'text/event-stream', body: sseFake(markdown) })
  })

  await page.goto('/#/today')
  await page.click('#fabula-toggle')
  await page.locator('[data-fabula-nova]').click()
  await page.locator('[data-fabula-input]').fill('escreva markdown')
  await page.keyboard.press('Enter')
  await expect(page.locator('.fable-bubble--assistant')).toHaveCount(1)

  const bolha = page.locator('.fable-bubble--assistant')
  await expect(bolha.locator('strong')).toHaveText('Negrito')
  await expect(bolha.locator('em')).toHaveText('itálico')
  await expect(bolha.locator('ul li')).toHaveCount(2)
  await expect(bolha.locator('table th').first()).toHaveText('Carta')
  await expect(bolha.locator('table td').first()).toHaveText('Ninho')
  // miniatura CLICÁVEL → abre o mesmo modal da galeria
  const mini = bolha.locator('[data-fabula-carta]')
  await expect(mini.locator('img.fable-card')).toBeVisible()
  await mini.click()
  await expect(page.locator('#modal')).toBeVisible()
  await expect(page.locator('#modal')).toContainText('Ninho Enclausurado')
  await page.keyboard.press('Escape')
  // markdown cru não vaza pra bolha
  await expect(bolha).not.toContainText('**Negrito**')
})

test('fabula: sem conversas — o chat inicia uma automaticamente ao abrir', async ({ page }) => {
  await semear(page) // conversations: []

  await page.goto('/#/today')
  await page.click('#fabula-toggle')

  // uma conversa foi criada, com o título padrão de DATA/HORA, e o input habilitado
  await expect(page.locator('.fable-item')).toHaveCount(1)
  await expect(page.locator('.fable-item--active .fable-item-title')).toContainText(/^\d{2}\/\d{2}/)
  await expect(page.locator('[data-fabula-input]')).toBeEnabled()
  await expect
    .poll(() =>
      page.evaluate(() => (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')?.conversations?.length ?? 0)),
    )
    .toBe(1)
  await expect(page.locator('.toast').last()).toContainText('comecei uma nova')
})

test('config: rerolar baralho pede confirmação e mantém o total de cartas', async ({ page }) => {
  await semear(page)
  await page.goto('/#/settings')
  const antes = await page.evaluate(() => (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')?.character?.cards?.length ?? 0))
  expect(antes).toBeGreaterThan(0)
  await page.locator('[data-reshuffle-cards]').click()
  // o modal de confirmação (operação destrutiva) abre
  await expect(page.locator('[data-modal-confirm]')).toBeVisible()
  await page.locator('[data-modal-confirm]').click()
  // após o reroll, o mesmo total de cartas é preservado
  await expect
    .poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')?.character?.cards?.length ?? 0)))
    .toBe(antes)
})
