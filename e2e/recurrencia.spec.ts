/** E2E — recorrência semanal/mensal com ADIAMENTO (feature 2026-09-14).
 *
 *  Regras (confirmadas com o usuário):
 *  1. Semanal/mensal: se o dia agendado passou sem concluir, a tarefa NÃO some —
 *     fica pendente dia após dia (adiada) até ser concluída, com badge "atrasada".
 *  2. Marcada hoje ou ontem → NÃO volta a repetir (some até o próximo agendado).
 *  3. Nunca duplica (linha única → no máximo 1 card por tarefa).
 *  O dia de hoje é fixado com page.clock para testes determinísticos. */
import { expect, test } from '@playwright/test'

/** Data local fixa de "hoje" — os testes fixam o relógio nela. */
const HOJE = '2030-03-06'
const d = (iso: string): Date => new Date(iso + 'T12:00:00')
const add = (iso: string, n: number): string => new Date(d(iso).getTime() + n * 86_400_000).toISOString().slice(0, 10)
const wd = (iso: string): number => d(iso).getDay()

const ontem = add(HOJE, -1)
const amanha = add(HOJE, 1)
const hojeWD = wd(HOJE)
const ontemWD = (hojeWD + 6) % 7
const amanhaWD = (hojeWD + 1) % 7

type SeedTask = {
  id: string
  title: string
  difficulty: string
  agenda: { days?: number[]; daysOfMonth?: number[] }
  history?: string[]
  createdAt: string
  type?: string
  tags?: string[]
}

/** Semeia o estado + fixa o relógio em `hoje` e abre a tela Hoje (sem rollover/
 *  check-in: lastDay = hoje, então renewDay sai cedo). */
async function seedRecorrentes(page: import('@playwright/test').Page, hoje: string, tasks: SeedTask[]): Promise<void> {
  await page.clock.install({ time: new Date(hoje + 'T12:00:00') })
  // normalizeTask (db/storage.ts) EXIGE `tags` (Array) e agenda com `days`
  // (Array) — senão a task/agenda é dropada (vira diária). Tagas reais sempre
  // têm `days`; só `daysOfMonth` acaba descartado.
  const tasksComTags = tasks.map((t) => ({
    type: 'recorrente',
    tags: [],
    ...t,
    agenda: t.agenda && { days: t.agenda.days ?? [], daysOfMonth: t.agenda.daysOfMonth },
  }))
  await page.addInitScript(
    ({ hoje, tasks }) => {
      localStorage.setItem(
        'esquizomon-rpg:v1',
        JSON.stringify({
          version: 3,
          tasks,
          character: {
            level: 1, xp: 0, xpNext: 80, hp: 50, hpMax: 50, mana: 20, manaMax: 20, exhausted: false,
            lastDay: hoje, cards: [], invocations: {},
          },
          settings: { theme: 'dark' },
          log: [],
          conversations: [],
          diary: [],
        }),
      )
    },
    { hoje, tasks: tasksComTags },
  )
  await page.goto('/#/today')
}

/** Testes: uma semanal de segunda-feira perdida adia e mostra "atrasada". */
test('semanal: perdida NÃO some — adia dia a dia e fica "atrasada" (uma ocorrência só)', async ({ page }) => {
  await seedRecorrentes(page, HOJE, [
    { id: 'r1', title: 'Revisar semana', difficulty: 'media', agenda: { days: [ontemWD] }, history: [], createdAt: add(HOJE, -10) },
  ])

  const card = page.locator('.task-card[data-id="r1"]')
  await expect(card).toHaveCount(1) // nunca duplica
  await expect(card).toContainText('Revisar semana')
  await expect(card).toHaveClass(/overdue/)
  await expect(card).toContainText('atrasada')
})

test('semanal: marcada ONTEM (no dia agendado) NÃO reaparece hoje', async ({ page }) => {
  await seedRecorrentes(page, HOJE, [
    { id: 'r1', title: 'Revisar semana', difficulty: 'media', agenda: { days: [ontemWD] }, history: [ontem], createdAt: add(HOJE, -10) },
  ])
  await expect(page.locator('.task-card[data-id="r1"]')).toHaveCount(0)
})

test('semanal: marcada hoje (dia agendado = hoje) aparece como CONCLUÍDA hoje', async ({ page }) => {
  await seedRecorrentes(page, HOJE, [
    { id: 'r1', title: 'Revisar semana', difficulty: 'media', agenda: { days: [hojeWD] }, history: [HOJE], createdAt: add(HOJE, -10) },
  ])
  const card = page.locator('.task-card[data-id="r1"]')
  await expect(card).toHaveCount(1)
  await expect(card).toHaveClass(/done/)
})

test('semanal: atrasada concluída num dia ADIADO vira "done" (e não some hoje)', async ({ page }) => {
  await seedRecorrentes(page, HOJE, [
    { id: 'r1', title: 'Revisar semana', difficulty: 'media', agenda: { days: [ontemWD] }, history: [], createdAt: add(HOJE, -10) },
  ])
  const card = page.locator('.task-card[data-id="r1"]')
  await expect(card).toHaveCount(1)
  await expect(card).not.toHaveClass(/done/)

  await card.locator('[data-toggle-rec]').click()

  await expect(card).toHaveClass(/done/)
})

test('semanal: concluída num dia NÃO agendado (adiado) não volta a repetir', async ({ page }) => {
  // agendada há 3 dias, concluída ONTEM (adiado) → hoje não aparece.
  await seedRecorrentes(page, HOJE, [
    { id: 'r1', title: 'Revisar semana', difficulty: 'media', agenda: { days: [wd(add(HOJE, -3))] }, history: [ontem], createdAt: add(HOJE, -10) },
  ])
  await expect(page.locator('.task-card[data-id="r1"]')).toHaveCount(0)
})

test('semanal: recém-criada (primeiro dia no FUTURO) NÃO aparece como atrasada', async ({ page }) => {
  await seedRecorrentes(page, HOJE, [
    { id: 'r1', title: 'Revisar semana', difficulty: 'media', agenda: { days: [amanhaWD] }, history: [], createdAt: HOJE },
  ])
  await expect(page.locator('.task-card[data-id="r1"]')).toHaveCount(0)
})

test('mensal: perdida no dia agendado adia e fica "atrasada" (uma ocorrência só)', async ({ page }) => {
  const diaDeHoje = d(HOJE).getDate()
  if (diaDeHoje <= 1) return // este HOJE fixo tem dia > 1; guard por segurança
  await seedRecorrentes(page, HOJE, [
    { id: 'r1', title: 'Pagar contas', difficulty: 'media', agenda: { daysOfMonth: [diaDeHoje - 1] }, history: [], createdAt: add(HOJE, -40) },
  ])
  const card = page.locator('.task-card[data-id="r1"]')
  await expect(card).toHaveCount(1)
  await expect(card).toHaveClass(/overdue/)
  await expect(card).toContainText('atrasada')
})

test('diária: continua SEMPRE visível (comportamento atual não muda — sem badge)', async ({ page }) => {
  await seedRecorrentes(page, HOJE, [
    { id: 'r1', title: 'Meditar', difficulty: 'facil', agenda: { days: [] }, history: [], createdAt: add(HOJE, -10) },
  ])
  const card = page.locator('.task-card[data-id="r1"]')
  await expect(card).toHaveCount(1)
  await expect(card).not.toHaveClass(/overdue/)
  await expect(card).not.toContainText('atrasada')
})