import { expect, test } from '@playwright/test'

/* Per-entity merge core (sync path "E"). */

test('sync: mergeData mescla criações dos dois lados (nada se perde)', async ({ page }) => {
  await page.goto('/#/hoje')
  const r = await page.evaluate(async () => {
    const { mergeData } = await import('/src/core/syncMerge')
    const t = (id: string, title: string, updatedAt: string) => ({
      id, title, type: 'unica', difficulty: 'facil', done: false,
      history: [], createdAt: '2026-01-01', updatedAt,
    })
    const base: any = { tasks: [], diary: [], conversations: [], log: [], version: 6 }
    const local = { ...base, tasks: [t('a', 'criada no local', '09:00')] }
    const cloud = { ...base, tasks: [t('a', 'criada no local', '09:00'), t('b', 'criada na nuvem', '10:00')] }
    const merged = mergeData(local, cloud) as { tasks: Array<{ id: string; title: string }> }
    return { ids: merged.tasks.map((x) => x.id).sort(), titleA: merged.tasks.find((x) => x.id === 'a')?.title }
  })
  expect(r.ids).toEqual(['a', 'b'])      // the creations on each side merge
  expect(r.titleA).toBe('criada no local')
})

test('sync: exclusão não é revertida pelo merge (tombstone)', async ({ page }) => {
  await page.goto('/#/hoje')
  const r = await page.evaluate(async () => {
    const { mergeData } = await import('/src/core/syncMerge')
    const t = (id: string, title: string, updatedAt: string) => ({
      id, title, type: 'unica', difficulty: 'facil', done: false, history: [], tags: [], createdAt: updatedAt, updatedAt,
    })
    const base = { tasks: [], diary: [], conversations: [], log: [], character: {}, settings: {}, version: 6 } as any
    // local: deleted 'b' (tombstone); cloud: still has 'b'
    const local = { ...base, tasks: [{ ...t('a', 'A', '2026-01-01T00:00:00Z') }], deletedTasks: { b: '2026-01-02T00:00:00Z' } }
    const cloud = { ...base, tasks: [{ ...t('a', 'A', '2026-01-01T00:00:00Z') }, { ...t('b', 'B', '2026-01-01T00:00:00Z') }] }
    const f = mergeData(local as any, cloud as any) as any
    return { ids: f.tasks.map((x: any) => x.id).sort(), aindaExcluida: f.deletedTasks.b }
  })
  expect(r.ids).toEqual(['a']) // 'b' NÃO volta
  expect(r.aindaExcluida).toBe('2026-01-02T00:00:00Z') // tombstone mantido (cloud ainda tinha)
})

test('sync: conflito na mesma tarefa vence a mais recente', async ({ page }) => {
  await page.goto('/#/hoje')
  const r = await page.evaluate(async () => {
    const { mergeData } = await import('/src/core/syncMerge')
    const t = (title: string, updatedAt: string) => ({
      id: 'x', title, type: 'unica', difficulty: 'facil', done: false,
      history: [], createdAt: '2026-01-01', updatedAt,
    })
    const base: any = { tasks: [], diary: [], conversations: [], log: [], version: 6 }
    const merged = mergeData({ ...base, tasks: [t('local antigo', '10:00')] }, { ...base, tasks: [t('nuvem mais novo', '11:00')] })
    return (merged as { tasks: Array<{ title: string }> }).tasks[0].title
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
      return (d.tasks ?? []).map((t: { title: string }) => t.title).sort()
    })

  const seed = (id: string, title: string) => {
    const hoje = new Date().toISOString()
    localStorage.setItem(
      'esquizomon-rpg:v1',
      JSON.stringify({ version: 3, tasks: [{
        id, title: titulo, type: 'unica', difficulty: 'facil', done: false,
        tags: [], history: [], createdAt: hoje, updatedAt: hoje,
      }], diary: [], conversations: [], log: [], character: {}, settings: {},
      }),
    )
    localStorage.setItem('esquizomon-rpg:auth', JSON.stringify({ accessToken: 'tok', refreshToken: 'rt', expiresAt: 4102444800000, user: { id: 'u1', email: 'x@y.z' } }))
  }

  // Device A: creates 'local-a' → sends to cloud
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()
  await pageA.addInitScript(([id, titulo]) => {
    const hoje = new Date().toISOString()
    localStorage.setItem(
      'esquizomon-rpg:v1',
      JSON.stringify({ version: 3, tasks: [{
        id, title: titulo, type: 'unica', difficulty: 'facil', done: false,
        tags: [], history: [], createdAt: hoje, updatedAt: hoje,
      }], diary: [], conversations: [], log: [], character: {}, settings: {},
      }),
    )
    localStorage.setItem('esquizomon-rpg:auth', JSON.stringify({ accessToken: 'tok', refreshToken: 'rt', expiresAt: 4102444800000, user: { id: 'u1', email: 'x@y.z' } }))
  }, ['a', 'local-a'])
  await rotaSync(pageA)
  await pageA.goto(base + '/#/hoje')
  await pageA.waitForTimeout(3000) // boot: GET (empty) → PUT
  expect((nuvem.dados as { tasks?: Array<{ title: string }> })?.tasks?.map((t) => t.title).sort()).toEqual(['local-a'])

  // Device B: creates 'local-b' → pulls cloud (local-a) and merges (a+b back to cloud)
  const ctxB = await browser.newContext()
  const pageB = await ctxB.newPage()
  await pageB.addInitScript(([id, titulo]) => {
    const hoje = new Date().toISOString()
    localStorage.setItem(
      'esquizomon-rpg:v1',
      JSON.stringify({ version: 3, tasks: [{
        id, title: titulo, type: 'unica', difficulty: 'facil', done: false,
        tags: [], history: [], createdAt: hoje, updatedAt: hoje,
      }], diary: [], conversations: [], log: [], character: {}, settings: {},
      }),
    )
    localStorage.setItem('esquizomon-rpg:auth', JSON.stringify({ accessToken: 'tok', refreshToken: 'rt', expiresAt: 4102444800000, user: { id: 'u1', email: 'x@y.z' } }))
  }, ['b', 'local-b'])
  await rotaSync(pageB)
  await pageB.goto(base + '/#/hoje')
  await pageB.waitForTimeout(3000) // boot: GET (local-a) → merge → apply a+b → PUT
  expect(await verificar(pageB)).toEqual(['local-a', 'local-b']) // NADA se perde
  expect((nuvem.dados as { tasks?: Array<{ title: string }> })?.tasks?.map((t) => t.title).sort()).toEqual(['local-a', 'local-b'])

  // A NEW device (A2, no local data) logs in and receives EVERYTHING from cloud
  const ctxA2 = await browser.newContext()
  const pageA2 = await ctxA2.newPage()
  await pageA2.addInitScript(() => {
    localStorage.setItem(
      'esquizomon-rpg:v1',
      JSON.stringify({ version: 3, tasks: [], diary: [], conversations: [], log: [], character: {}, settings: {} }),
    )
    localStorage.setItem('esquizomon-rpg:auth', JSON.stringify({ accessToken: 'tok', refreshToken: 'rt', expiresAt: 4102444800000, user: { id: 'u1', email: 'x@y.z' } }))
  })
  await rotaSync(pageA2)
  await pageA2.goto(base + '/#/hoje')
  await pageA2.waitForTimeout(3000)
  expect(await verificar(pageA2)).toEqual(['local-a', 'local-b'])
  await ctxA2.close()

  await ctxA.close()
  await ctxB.close()
})
