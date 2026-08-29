import { expect, test } from '@playwright/test'

/* Regressions for the 2026-08-29 "Ajuste":
 *  1. Boot ordering — the daily rollover + check-in run ONLY AFTER the first
 *     pull+merge, so they never act on the stale local copy (the morning bug:
 *     one device's resolved day got re-decided against old data).
 *  2. deleteTask flushes the tombstone to the cloud IMMEDIATELY (flushSend),
 *     not via the 500ms debounce nor the close/hide flush (a delete quickly
 *     followed by closing the app no longer resurrects on other devices).
 */

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addLocalDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return localISO(d)
}
const AUTH = { accessToken: 'tok', refreshToken: 'rt', expiresAt: 4102444800000, user: { id: 'u1', email: 'x@y.z' } }

const BASE = 'http://localhost:5176'

test('REGRESSION: boot roda rollover/checkin SÓ após o 1º pull — não decide em dados obsoletos (dia já resolvido na nuvem não re-dispara)', async ({ browser }) => {
  const hoje = localISO(new Date())
  const ontem = addLocalDays(hoje, -1)
  const nuvem: { salvoEm: string | null; dados: unknown } = { salvoEm: null, dados: null }

  // Device A (cloud) ALREADY resolved today: ran the check-in, lastDay = today,
  // recurring task done on both yesterday and today.
  const cloudResolvido = {
    version: 6,
    tasks: [{ id: 'r', title: 'Treino', type: 'recorrente', difficulty: 'media', done: false, tags: [], history: [ontem, hoje], createdAt: '2026-01-01T00:00:00Z', updatedAt: new Date().toISOString() }],
    diary: [], conversations: [], log: [],
    character: { level: 3, hp: 90, hpMax: 90, mana: 50, manaMax: 50, lastDay: hoje, xp: 0, xpNext: 100, exhausted: false },
    settings: {}, deletedTasks: {},
  }
  // Device B (local): STALE — last saw the cloud YESTERDAY (lastDay = yesterday,
  // recurring task without today nor yesterday in history → would be flagged
  // as a pending check-in if the rollover ran on this copy).
  const staleLocal = {
    version: 6,
    tasks: [{ id: 'r', title: 'Treino', type: 'recorrente', difficulty: 'media', done: false, tags: [], history: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' }],
    diary: [], conversations: [], log: [],
    character: { level: 3, hp: 80, hpMax: 90, mana: 10, manaMax: 50, lastDay: ontem, xp: 0, xpNext: 100, exhausted: false },
    settings: {}, deletedTasks: {},
  }

  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.addInitScript(({ d, a }) => {
    localStorage.setItem('esquizomon-rpg:v1', JSON.stringify(d))
    localStorage.setItem('esquizomon-rpg:auth', JSON.stringify(a))
  }, { d: staleLocal, a: AUTH })
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

  // the cloud is newer (resolved today) than the stale local
  nuvem.salvoEm = new Date().toISOString()
  nuvem.dados = cloudResolvido

  await page.goto(BASE + '/#/today')

  // the pull+merge must land first: lastDay becomes TODAY (from the cloud)
  await page.waitForFunction((today) => {
    const d = JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')
    return d.character?.lastDay === today
  }, hoje)
  await page.waitForTimeout(150) // settle after renewDay + checkDaily run

  const r = await page.evaluate(async () => {
    const { pendingCheckin } = await import('/src/stores/checkin')
    const d = JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')
    const task = (d.tasks ?? []).find((x: { id: string }) => x.id === 'r')
    return { pendingCheckin, lastDay: d.character?.lastDay, history: task?.history }
  })

  expect(r.pendingCheckin).toBeNull() // NO stale check-in decided off old data
  expect(r.lastDay).toBe(hoje)        // the cloud-resolved day won the merge
  expect(r.history).toContain(hoje)   // task stays done today (from cloud), doesn't come back
  await ctx.close()
})

test('REGRESSION: apagar envia o tombstone pra nuvem NA HORA (flushSend) — antes do debounce de 500ms e sem fechar o app', async ({ browser }) => {
  const hoje = localISO(new Date())
  const nuvem: { salvoEm: string | null; dados: any } = { salvoEm: null, dados: null }
  const data = {
    version: 6,
    tasks: [{ id: 't1', title: 'Apagar-me', type: 'unica', difficulty: 'facil', done: false, tags: [], history: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', dueDate: hoje }],
    diary: [], conversations: [], log: [],
    character: { level: 1, hp: 50, hpMax: 50, mana: 20, manaMax: 20, lastDay: hoje, xp: 0, xpNext: 100, exhausted: false },
    settings: { relaxedMode: true }, deletedTasks: {},
  }

  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.addInitScript(({ d, a }) => {
    localStorage.setItem('esquizomon-rpg:v1', JSON.stringify(d))
    localStorage.setItem('esquizomon-rpg:auth', JSON.stringify(a))
  }, { d: data, a: AUTH })
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

  await page.goto(BASE + '/#/today')

  // initial migration: GET(empty) → PUT the task to the cloud
  await page.waitForTimeout(3000)
  expect((nuvem.dados?.tasks ?? []).map((x: { id: string }) => x.id)).toContain('t1')

  const t0 = Date.now()
  await page.evaluate(() => import('/src/stores/tasks').then((m) => m.deleteTask('t1')))

  // the tombstone must reach the cloud right away, while the page is open & visible
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    const tasks: Array<{ id: string }> = nuvem.dados?.tasks ?? []
    if (!tasks.some((x) => x.id === 't1')) break
    await page.waitForTimeout(50)
  }
  const elapsed = Date.now() - t0
  const finalTasks = (nuvem.dados?.tasks ?? []).map((x: { id: string }) => x.id)
  const tombstones = nuvem.dados?.deletedTasks ?? {}

  expect(finalTasks).not.toContain('t1') // removed from the cloud
  expect(tombstones.t1).toBeTruthy()     // tombstone recorded (won't resurrect)
  expect(elapsed).toBeLessThan(500)      // arrived NOW (flush), not via 500ms debounce / unload
  await ctx.close()
})