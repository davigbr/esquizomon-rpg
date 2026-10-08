/** E2E — ORDEM manual das tarefas (drag & drop na tela Hoje) e sua SINCRONIZAÇÃO.
 *
 *  Bug 2026-10-01: a ordem era apenas a POSIÇÃO no array. No merge, quem decide a
 *  ordem das coleções é o lado "base" (o de `salvoEm` mais novo) — então, quando o
 *  celular (com a ordem antiga) virava o base e empurrava pro cloud, o pull
 *  seguinte trazia a ordem ANTIGA de volta pro desktop: "depois de um tempo as
 *  tarefas voltam à ordem que estavam anteriormente".
 *
 *  Correção: `tasksOrder` — um valor LWW com timestamp PRÓPRIO (a reordenação mais
 *  recente vence, em qualquer aparelho), aplicado ao array no merge e no load. */
import { expect, test } from '@playwright/test'

const BASE = 'http://localhost:5176'
const AUTH = { accessToken: 'tok', refreshToken: 'rt', expiresAt: 4102444800000, user: { id: 'u1', email: 'x@y.z' } }

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type SeedTask = { id: string; title: string; type: string; difficulty: string; done: boolean; tags: string[]; history: string[]; createdAt: string; updatedAt: string }

function tarefas(ids: string[]): SeedTask[] {
  return ids.map((id, i) => ({
    id,
    title: `Tarefa ${id.toUpperCase()}`,
    type: 'unica',
    difficulty: 'facil',
    done: false,
    tags: [],
    history: [],
    createdAt: `2026-01-0${i + 1}T00:00:00.000Z`,
    updatedAt: `2026-01-0${i + 1}T00:00:00.000Z`,
  }))
}

/** Ordem salva no blob (ids na ordem do array). */
function ordemSalva(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}').tasks ?? []).map((t: { id: string }) => t.id))
}

/** Monta um contexto autenticado com `nuvem` mockada (GET/PUT em /.netlify/functions/dados). */
async function comNuvem(
  browser: import('@playwright/test').Browser,
  local: unknown,
  salvoEmLocal: string,
  nuvem: { salvoEm: string | null; dados: unknown },
): Promise<import('@playwright/test').Page> {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.addInitScript(
    ({ d, a, meta }) => {
      localStorage.setItem('esquizomon-rpg:v1', JSON.stringify(d))
      localStorage.setItem('esquizomon-rpg:auth', JSON.stringify(a))
      localStorage.setItem('esquizomon-rpg:sync', JSON.stringify(meta))
    },
    { d: local, a: AUTH, meta: { salvoEm: salvoEmLocal, lastSync: salvoEmLocal } },
  )
  await page.route('**/.netlify/identity/user', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"u1","email":"x@y.z"}' }))
  await page.route('**/.netlify/functions/dados', async (r) => {
    if (r.request().method() === 'GET') {
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ salvoEm: nuvem.salvoEm, dados: nuvem.dados }) })
      return
    }
    const corpo = r.request().postDataJSON() as { salvoEm: string; dados: unknown }
    nuvem.salvoEm = corpo.salvoEm
    nuvem.dados = corpo.dados
    await r.fulfill({ status: 200, body: '{"ok":true}' })
  })
  return page
}

test('reordenar com drag & drop grava a ordem (array + tasksOrder) e sobrevive ao reload', async ({ page }) => {
  await page.goto('/#/today')
  for (const nome of ['Primeira', 'Segunda', 'Terceira']) {
    await page.locator('[data-new-type="unica"]').click()
    await page.locator('input[name="title"]').fill(nome)
    await page.locator('button[type="submit"]').click()
  }
  const ids = await ordemSalva(page)
  expect(ids).toHaveLength(3)

  // arrasta a ÚLTIMA para cima da PRIMEIRA
  await page.evaluate(() => {
    const cards = document.querySelector('.column:last-child .column-cards') as HTMLElement
    const lista = [...cards.querySelectorAll('.task-card')] as HTMLElement[]
    const origem = lista[lista.length - 1]
    const alvo = lista[0]
    const dt = new DataTransfer()
    origem.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
    alvo.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }))
    alvo.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }))
    origem.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }))
  })
  await expect.poll(() => ordemSalva(page)).toEqual([ids[2], ids[0], ids[1]])

  // a ordem ficou gravada como valor LWW próprio
  const order = await page.evaluate(() => JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}').tasksOrder)
  expect(order?.ids).toEqual([ids[2], ids[0], ids[1]])
  expect(typeof order?.updatedAt).toBe('string')

  // e sobrevive ao reload (materializada ao carregar)
  await page.reload()
  expect(await ordemSalva(page)).toEqual([ids[2], ids[0], ids[1]])
})

test('REGRESSION: ordem reordenada aqui NÃO volta quando a NUVEM é o lado mais novo do merge', async ({ browser }) => {
  const hoje = localISO(new Date())
  const ORDER_LOCAL = ['c', 'a', 'b'] // o que o usuário acabou de reordenar AQUI
  const ORDER_CLOUD = ['a', 'b', 'c'] // ordem antiga que ainda está na nuvem
  const char = { level: 1, hp: 50, hpMax: 50, mana: 20, manaMax: 20, lastDay: hoje, xp: 0, xpNext: 80, exhausted: false }

  const local = {
    version: 6,
    tasks: tarefas(ORDER_LOCAL),
    tasksOrder: { ids: ORDER_LOCAL, updatedAt: '2026-01-10T00:00:00.000Z' },
    diary: [], conversations: [], log: [], settings: {}, deletedTasks: {}, character: char,
  }
  // nuvem: ordem ANTIGA, sem tasksOrder, MAIS NOVA (salvoEm futuro) e com uma
  // tarefa que só existe lá (prova que o pull+merge realmente aconteceu)
  const nuvem = {
    salvoEm: '2099-01-01T00:00:00.000Z',
    dados: {
      version: 6,
      tasks: [...tarefas(ORDER_CLOUD), { ...tarefas(['z'])[0], id: 'z', title: 'Tarefa Z' }],
      diary: [], conversations: [], log: [], settings: {}, deletedTasks: {}, character: char,
    },
  }

  const page = await comNuvem(browser, local, '2026-01-05T00:00:00.000Z', nuvem)
  await page.goto(BASE + '/#/today')

  // espera o merge trazer a tarefa só-da-nuvem (pull aplicado)
  await page.waitForFunction(() => {
    const d = JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')
    return (d.tasks ?? []).some((t: { id: string }) => t.id === 'z')
  })

  // a ORDEM REORDENADA AQUI venceu; a tarefa nova entrou no fim
  expect(await ordemSalva(page)).toEqual(['c', 'a', 'b', 'z'])
  // e o valor LWW da ordem continua sendo o local
  const order = await page.evaluate(() => JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}').tasksOrder)
  expect(order?.ids.slice(0, 3)).toEqual(['c', 'a', 'b'])
  await page.context().close()
})

test('ordem feita em OUTRO aparelho (tasksOrder mais novo na nuvem) é adotada aqui', async ({ browser }) => {
  const hoje = localISO(new Date())
  const char = { level: 1, hp: 50, hpMax: 50, mana: 20, manaMax: 20, lastDay: hoje, xp: 0, xpNext: 80, exhausted: false }
  const local = {
    version: 6,
    tasks: tarefas(['a', 'b', 'c']),
    tasksOrder: { ids: ['a', 'b', 'c'], updatedAt: '2026-01-01T00:00:00.000Z' },
    diary: [], conversations: [], log: [], settings: {}, deletedTasks: {}, character: char,
  }
  const nuvem = {
    salvoEm: '2099-01-01T00:00:00.000Z',
    dados: {
      version: 6,
      tasks: tarefas(['c', 'b', 'a']),
      tasksOrder: { ids: ['c', 'b', 'a'], updatedAt: '2026-02-01T00:00:00.000Z' }, // mais novo
      diary: [], conversations: [], log: [], settings: {}, deletedTasks: {}, character: char,
    },
  }

  const page = await comNuvem(browser, local, '2026-01-05T00:00:00.000Z', nuvem)
  await page.goto(BASE + '/#/today')

  await expect.poll(() => ordemSalva(page)).toEqual(['c', 'b', 'a'])
  const order = await page.evaluate(() => JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}').tasksOrder)
  expect(order?.updatedAt).toBe('2026-02-01T00:00:00.000Z')
  await page.context().close()
})
