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

test('fabula: as últimas entradas do diário entram NA ÍNTEGRA no prompt (sem truncar)', async ({ page }) => {
  await semear(page)
  await page.goto('/#/diario')
  await page.locator('[data-diario-novo]').click()

  // entrada longa (bem acima do antigo corte de 600 chars)
  const longo = 'A'.repeat(800) + ' FIM-DO-REGISTRO-INTEGRO'
  await page.locator('[data-diario-editor]').fill(longo)
  await page.keyboard.press('Tab')

  await expect
    .poll(() =>
      page.evaluate(() => (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')?.diario?.[0]?.texto ?? '')),
    )
    .toBe(longo)

  const prompt = await page.evaluate(async () => {
    const { montarSystemPrompt } = await import('/src/ia/prompt')
    const { appStore } = await import('/src/stores/app')
    return montarSystemPrompt(appStore.get())
  })
  expect(prompt).toContain('FIM-DO-REGISTRO-INTEGRO')
  expect(prompt).toContain('SOBRE O ESQUIZOMON')
  expect(prompt).toContain('O QUE VOCÊ PODE E DEVE FAZER')
})

test('fabula: invocarCarta (via chat) desconta mana e registra', async ({ page }) => {
  await semear(page)
  await page.goto('/#/hoje')
  await expect(page.locator('[data-s-mana]')).toHaveText('Mana 20/20')

  const res = await page.evaluate(async () => {
    const { invocarCarta } = await import('/src/stores/app')
    const ok = invocarCarta('ninho-enclausurado') // captura → custo 8
    const mana = (await import('/src/stores/app')).appStore.get().personagem.mana
    return { ok: ok.ok, mana }
  })
  expect(res.ok).toBe(true)
  expect(res.mana).toBe(12)

  // sem mana → recusa
  const semMana = await page.evaluate(async () => {
    const mod = await import('/src/stores/app')
    mod.appStore.set({ ...mod.appStore.get(), personagem: { ...mod.appStore.get().personagem, mana: 1 } })
    return mod.invocarCarta('ninho-enclausurado')
  })
  expect(semMana.ok).toBe(false)
})

/** Seed com IA configurada (provider fake) + carta desbloqueada + mana. */
async function semearChat(page: import('@playwright/test').Page): Promise<void> {
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
        configuracao: {
          tema: 'dark',
          ia: { provider: 'deepseek', modelo: '', apiKey: 'chave-fake', systemPrompt: '' },
        },
        log: [],
        conversas: [],
        diario: [],
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

  await page.goto('/#/hoje')
  await page.click('#fabula-toggle')
  await page.locator('[data-fabula-nova]').click() // cria a conversa (input desabilita sem ela)
  const input = page.locator('[data-fabula-input]')
  await input.fill('primeira mensagem')
  await page.keyboard.press('Enter')
  await expect(page.locator('.fabula-bolha--assistente')).toHaveCount(1)

  await input.fill('segunda mensagem')
  await page.keyboard.press('Enter')
  await expect(page.locator('.fabula-bolha--assistente')).toHaveCount(2)

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

  await page.goto('/#/hoje')
  await page.click('#fabula-toggle')
  await page.locator('[data-fabula-nova]').click() // cria a conversa
  await page.locator('[data-fabula-input]').fill('invoca a carta Ninho Enclausurado')
  await page.keyboard.press('Enter')
  await expect(page.locator('.fabula-bolha--assistente')).toHaveCount(1)

  // mana descontou (20 → 12, captura custa 8) e a bolha exibe a miniatura da carta
  await expect(page.locator('[data-s-mana]')).toHaveText('Mana 12/20')
  const img = page.locator('.fabula-bolha--assistente img.fabula-carta')
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
  await expect(page.locator('.fabula-bolha--assistente')).toHaveCount(2)
  await expect(page.locator('[data-s-mana]')).toHaveText('Mana 12/20')
  const corpo2 = JSON.parse(corpos[corpos.length - 1])
  const sistema2 = corpo2.messages
    .filter((m: { role: string }) => m.role === 'system')
    .map((m: { content: string }) => m.content)
    .join('\n')
  expect(sistema2).toContain('BLOQUEADA')
  // sem miniatura na segunda bolha (carta não foi invocada)
  await expect(page.locator('.fabula-bolha--assistente img.fabula-carta')).toHaveCount(1)
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

test('fabula: botão copia a conversa em markdown (usuário + Fábula; carta vira nome)', async ({ page, context }) => {
  await semear(page)
  await page.addInitScript(() => {
    localStorage.setItem('esquizomon-rpg:chat-painel', JSON.stringify({ aberto: false, conversaAtivaId: 'conv-copia' }))
  })
  await page.addInitScript(() => {
    const d = JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')
    d.conversas = [
      {
        id: 'conv-copia',
        titulo: 'Sobre o dia',
        atualizadaEm: '2026-08-12T14:00:00.000Z',
        mensagens: [
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

  await page.goto('/#/hoje')
  await page.click('#fabula-toggle')
  await expect(page.locator('.fabula-bolha--assistente')).toHaveCount(1)

  const btn = page.locator('[data-fabula-copiar]')
  await expect(btn).toBeEnabled()
  await btn.click()

  const markdown = await page.evaluate(() => (window as unknown as { __ultimoCopiado?: string }).__ultimoCopiado ?? '')
  expect(markdown).toContain('# Fábula — Sobre o dia')
  expect(markdown).toContain('**Você**')
  expect(markdown).toContain('> primeira mensagem')
  expect(markdown).toContain('**Fábula**')
  expect(markdown).toContain('A carta chega como um alívio.')
  // o marcador vira o nome da carta em itálico — nunca vaza pro markdown
  expect(markdown).toContain('*Ninho Enclausurado*')
  expect(markdown).not.toContain('[[carta:')

  // botão desabilitado numa conversa nova (vazia) — painel segue aberto
  await page.click('[data-fabula-nova]')
  await expect(btn).toBeDisabled()
})

test('fabula: conversa pode ser renomeada (Enter salva e persiste)', async ({ page }) => {
  await semear(page)
  await page.addInitScript(() => {
    localStorage.setItem('esquizomon-rpg:chat-painel', JSON.stringify({ aberto: false, conversaAtivaId: 'conv-renome' }))
  })
  await page.addInitScript(() => {
    const d = JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')
    d.conversas = [
      {
        id: 'conv-renome',
        titulo: 'Título automático da primeira mensagem',
        atualizadaEm: '2026-08-12T14:00:00.000Z',
        mensagens: [{ role: 'user', content: 'olá', ts: '2026-08-12T14:00:00.000Z' }],
      },
    ]
    localStorage.setItem('esquizomon-rpg:v1', JSON.stringify(d))
  })

  await page.goto('/#/hoje')
  await page.click('#fabula-toggle')
  await page.click('[data-fabula-renomear]')

  const input = page.locator('[data-fabula-titulo-input]')
  await expect(input).toBeVisible()
  await input.fill('Sobre os monstros de agosto')
  await page.keyboard.press('Enter')

  // o input some, a lista lateral mostra o título novo e o storage persiste
  await expect(input).toHaveCount(0)
  await expect(page.locator('.fabula-item--ativa .fabula-item-titulo')).toHaveText('Sobre os monstros de agosto')
  await expect
    .poll(() =>
      page.evaluate(() =>
        (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')?.conversas?.[0]?.titulo ?? '')),
    )
    .toBe('Sobre os monstros de agosto')
})
