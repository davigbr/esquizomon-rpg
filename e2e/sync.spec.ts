import { expect, test } from '@playwright/test'

/* Núcleo do merge por entidade (caminho "E" da sincronização). */

test('sync: fundirDados mescla criações dos dois lados (nada se perde)', async ({ page }) => {
  await page.goto('/#/hoje')
  const r = await page.evaluate(async () => {
    const { fundirDados } = await import('/src/core/syncMerge')
    const t = (id: string, titulo: string, editadaEm: string) => ({
      id, titulo, tipo: 'unica', dificuldade: 'facil', concluida: false,
      historico: [], criadaEm: '2026-01-01', editadaEm,
    })
    const base = { tarefas: [], diario: [], conversas: [], log: [], versao: 6 }
    const local = { ...base, tarefas: [t('a', 'criada no local', '09:00')] }
    const nuvem = { ...base, tarefas: [t('a', 'criada no local', '09:00'), t('b', 'criada na nuvem', '10:00')] }
    const fundida = fundirDados(local, nuvem) as { tarefas: Array<{ id: string; titulo: string }> }
    return { ids: fundida.tarefas.map((x) => x.id).sort(), tituloA: fundida.tarefas.find((x) => x.id === 'a')?.titulo }
  })
  expect(r.ids).toEqual(['a', 'b'])      // as criadas em cada lado se mesclam
  expect(r.tituloA).toBe('criada no local')
})

test('sync: conflito na mesma tarefa vence a mais recente', async ({ page }) => {
  await page.goto('/#/hoje')
  const r = await page.evaluate(async () => {
    const { fundirDados } = await import('/src/core/syncMerge')
    const t = (titulo: string, editadaEm: string) => ({
      id: 'x', titulo, tipo: 'unica', dificuldade: 'facil', concluida: false,
      historico: [], criadaEm: '2026-01-01', editadaEm,
    })
    const base = { tarefas: [], diario: [], conversas: [], log: [], versao: 6 }
    const fundida = fundirDados({ ...base, tarefas: [t('local antigo', '10:00')] }, { ...base, tarefas: [t('nuvem mais novo', '11:00')] })
    return (fundida as { tarefas: Array<{ titulo: string }> }).tarefas[0].titulo
  })
  expect(r).toBe('nuvem mais novo')
})

test('sync ponta a ponta: dois dispositivos convergem sem perder criações', async ({ browser }) => {
  const nuvem: { salvoEm: string | null; dados: unknown } = { salvoEm: null, dados: null }
  const base = 'http://localhost:5176'

  async function rotaSync(page: import('@playwright/test').Page): Promise<void> {
    await page.route('**/.netlify/identity/user', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"u1","email":"x@y.z"}' }))
    await page.route('**/.netlify/functions/dados', async (r) => {
      const metodo = r.request().method()
      if (metodo === 'GET') {
        await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ salvoEm: nuvem.salvoEm, dados: nuvem.dados }) })
      } else {
        const corpo = r.request().postDataJSON() as { salvoEm: string; dados: unknown }
        nuvem.salvoEm = corpo.salvoEm
        nuvem.dados = corpo.dados
        await r.fulfill({ status: 200, body: '{"ok":true}' })
      }
    })
  }

  const verificar = async (page: any) => page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')
      return (d.tarefas ?? []).map((t: { titulo: string }) => t.titulo).sort()
    })

  // Dispositivo A: cria 'local-a' → envia à nuvem
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()
  await pageA.addInitScript(() => {
    const hoje = new Date().toISOString()
    localStorage.setItem(
      'esquizomon-rpg:v1',
      JSON.stringify({ versao: 6, tarefas: [{
        id: 'a', titulo: 'local-a', tipo: 'unica', dificuldade: 'facil', concluida: false,
        tags: [], historico: [], criadaEm: hoje, editadaEm: hoje,
      }], diario: [], conversas: [], log: [], personagem: {}, configuracao: {},
      }),
    )
    localStorage.setItem('esquizomon-rpg:auth', JSON.stringify({ accessToken: 'tok', refreshToken: 'rt', expiraEm: 4102444800000, usuario: { id: 'u1', email: 'x@y.z' } }))
  })
  await rotaSync(pageA)
  await pageA.goto(base + '/#/hoje')
  await pageA.waitForTimeout(3000) // boot: GET (vazia) → PUT
  expect((nuvem.dados as { tarefas?: Array<{ titulo: string }> })?.tarefas?.map((t) => t.titulo).sort()).toEqual(['local-a'])

  // Dispositivo B: cria 'local-b' → puxa a nuvem (local-a) e funde (a+b de volta à nuvem)
  const ctxB = await browser.newContext()
  const pageB = await ctxB.newPage()
  await pageB.addInitScript(() => {
    const hoje = new Date().toISOString()
    localStorage.setItem(
      'esquizomon-rpg:v1',
      JSON.stringify({ versao: 6, tarefas: [{
        id: 'b', titulo: 'local-b', tipo: 'unica', dificuldade: 'facil', concluida: false,
        tags: [], historico: [], criadaEm: hoje, editadaEm: hoje,
      }], diario: [], conversas: [], log: [], personagem: {}, configuracao: {},
      }),
    )
    localStorage.setItem('esquizomon-rpg:auth', JSON.stringify({ accessToken: 'tok', refreshToken: 'rt', expiraEm: 4102444800000, usuario: { id: 'u1', email: 'x@y.z' } }))
  })
  await rotaSync(pageB)
  await pageB.goto(base + '/#/hoje')
  await pageB.waitForTimeout(3000) // boot: GET (local-a) → funde → aplica a+b → PUT
  expect(await verificar(pageB)).toEqual(['local-a', 'local-b']) // NADA se perde
  expect((nuvem.dados as { tarefas?: Array<{ titulo: string }> })?.tarefas?.map((t) => t.titulo).sort()).toEqual(['local-a', 'local-b'])

  // Um NOVO dispositivo (A2, sem dados locais) loga e recebe TUDO da nuvem
  const ctxA2 = await browser.newContext()
  const pageA2 = await ctxA2.newPage()
  await pageA2.addInitScript(() => {
    localStorage.setItem(
      'esquizomon-rpg:v1',
      JSON.stringify({ versao: 6, tarefas: [], diario: [], conversas: [], log: [], personagem: {}, configuracao: {} }),
    )
    localStorage.setItem('esquizomon-rpg:auth', JSON.stringify({ accessToken: 'tok', refreshToken: 'rt', expiraEm: 4102444800000, usuario: { id: 'u1', email: 'x@y.z' } }))
  })
  await rotaSync(pageA2)
  await pageA2.goto(base + '/#/hoje')
  await pageA2.waitForTimeout(3000)
  expect(await verificar(pageA2)).toEqual(['local-a', 'local-b'])
  await ctxA2.close()

  await ctxA.close()
  await ctxB.close()
})
