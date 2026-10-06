/** E2E — visualização AGENDA da tela Hoje (feature 2026-10-01).
 *
 *  Regras (confirmadas com o usuário):
 *  1. Só recorrentes e tarefas — HÁBITOS ficam de fora.
 *  2. Cada item aparece em UMA única seção (nunca se repete).
 *  3. Recorrentes aparecem SÓ no dia atual: em "Atrasadas" (ocorrência perdida,
 *     uma única ocorrência) ou em "Hoje" — nunca em seções futuras.
 *  4. Seções: atrasadas → hoje → próximas ações (sem data) → esta semana (até
 *     sábado 24h) → mês corrente (nome do mês) → mês+1 → mês+2 → semestre
 *     (resto do semestre civil) → ano (resto do ano).
 *  O dia de hoje é fixado com page.clock para testes determinísticos. */
import { expect, test } from '@playwright/test'

const HOJE = '2030-03-06' // quarta-feira
const d = (iso: string): Date => new Date(iso + 'T12:00:00')
const add = (iso: string, n: number): string => new Date(d(iso).getTime() + n * 86_400_000).toISOString().slice(0, 10)
const wd = (iso: string): number => d(iso).getDay()

const ontem = add(HOJE, -1)
const amanha = add(HOJE, 1)
const ontemWD = (wd(HOJE) + 6) % 7

type SeedTask = {
  id: string
  title: string
  difficulty: string
  type?: string
  dueDate?: string
  done?: boolean
  tags?: string[]
  agenda?: { days?: number[]; daysOfMonth?: number[] }
  history?: string[]
  createdAt: string
}

async function seed(page: import('@playwright/test').Page, tasks: SeedTask[]): Promise<void> {
  await page.clock.install({ time: new Date(HOJE + 'T12:00:00') })
  const tasksComTags = tasks.map((t) => ({
    type: 'unica',
    tags: [],
    history: [],
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
    { hoje: HOJE, tasks: tasksComTags },
  )
  await page.goto('/#/today')
}

/** Conjunto de tarefas cobrindo TODAS as seções. */
const TODAS: SeedTask[] = [
  // hábito — deve ser IGNORADO na agenda
  { id: 'h1', title: 'Hábito invisível', difficulty: 'facil', type: 'habito', createdAt: add(HOJE, -3) },
  // recorrentes
  { id: 'r-diaria', title: 'Recorrente diária', difficulty: 'media', type: 'recorrente', agenda: { days: [] }, history: [], createdAt: add(HOJE, -20) },
  { id: 'r-perdida', title: 'Recorrente perdida', difficulty: 'media', type: 'recorrente', agenda: { days: [ontemWD] }, history: [], createdAt: add(HOJE, -20) },
  // tarefas únicas, uma por seção
  { id: 'u-atrasada', title: 'Tarefa atrasada', difficulty: 'media', dueDate: ontem, createdAt: add(HOJE, -9) },
  { id: 'u-hoje', title: 'Tarefa de hoje', difficulty: 'facil', dueDate: HOJE, createdAt: add(HOJE, -2) },
  { id: 'u-semdata', title: 'Tarefa sem data', difficulty: 'facil', createdAt: add(HOJE, -1) },
  { id: 'u-semana', title: 'Tarefa da semana', difficulty: 'facil', dueDate: amanha, createdAt: add(HOJE, -1) },
  { id: 'u-mes', title: 'Tarefa do mês', difficulty: 'media', dueDate: '2030-03-20', createdAt: add(HOJE, -1) },
  { id: 'u-m1', title: 'Tarefa abril', difficulty: 'media', dueDate: '2030-04-15', createdAt: add(HOJE, -1) },
  { id: 'u-m2', title: 'Tarefa maio', difficulty: 'media', dueDate: '2030-05-10', createdAt: add(HOJE, -1) },
  { id: 'u-sem', title: 'Tarefa junho', difficulty: 'media', dueDate: '2030-06-20', createdAt: add(HOJE, -1) },
  { id: 'u-ano', title: 'Tarefa setembro', difficulty: 'media', dueDate: '2030-09-10', createdAt: add(HOJE, -1) },
]

async function abrirAgenda(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('[data-view-mode="agenda"]').click()
  await expect(page.locator('.agenda-board')).toBeVisible()
}

test('agenda: seções por janela de data, sem hábitos e sem repetir item', async ({ page }) => {
  await seed(page, TODAS)
  await abrirAgenda(page)

  // hábito NUNCA aparece
  await expect(page.locator('.agenda-board')).not.toContainText('Hábito invisível')
  // colunas some, agenda entra
  await expect(page.locator('.columns')).toHaveCount(0)
  // as 9 seções viram 3 colunas por horizonte
  await expect(page.locator('.agenda-col-title')).toHaveText(['Agora', 'Este mês', 'Futuro'])

  // atrasadas: a tarefa vencida + a recorrente perdida (uma ocorrência)
  const atras = page.locator('[data-sec="atrasadas"]')
  await expect(atras).toContainText('Tarefa atrasada')
  await expect(atras).toContainText('Recorrente perdida')

  // hoje: a tarefa de hoje + a recorrente diária
  const hoje = page.locator('[data-sec="hoje"]')
  await expect(hoje).toContainText('Tarefa de hoje')
  await expect(hoje).toContainText('Recorrente diária')

  // próximas ações: a sem data
  await expect(page.locator('[data-sec="proximas"]')).toContainText('Tarefa sem data')

  // esta semana (até sábado) + mês corrente com NOME + mês+1 + mês+2
  await expect(page.locator('[data-sec="semana"]')).toContainText('Tarefa da semana')
  await expect(page.locator('[data-sec="mes"] h2')).toContainText('Março 2030')
  await expect(page.locator('[data-sec="mes"]')).toContainText('Tarefa do mês')
  await expect(page.locator('[data-sec="m1"] h2')).toContainText('Abril 2030')
  await expect(page.locator('[data-sec="m2"] h2')).toContainText('Maio 2030')

  // semestre (resto do semestre civil) e ano (resto do ano)
  await expect(page.locator('[data-sec="semestre"]')).toContainText('Tarefa junho')
  await expect(page.locator('[data-sec="ano"]')).toContainText('Tarefa setembro')

  // NENHUM item aparece em mais de uma seção
  for (const titulo of [
    'Tarefa atrasada', 'Tarefa de hoje', 'Tarefa sem data', 'Tarefa da semana',
    'Tarefa do mês', 'Tarefa abril', 'Tarefa maio', 'Tarefa junho', 'Tarefa setembro',
    'Recorrente diária', 'Recorrente perdida',
  ]) {
    await expect(page.locator('.task-card', { hasText: titulo })).toHaveCount(1)
  }
})

test('agenda: recorrente só no dia atual — nunca em seções futuras', async ({ page }) => {
  await seed(page, [
    { id: 'r-diaria', title: 'Recorrente diária', difficulty: 'media', type: 'recorrente', agenda: { days: [] }, history: [], createdAt: add(HOJE, -20) },
    { id: 'r-perdida', title: 'Recorrente perdida', difficulty: 'media', type: 'recorrente', agenda: { days: [ontemWD] }, history: [], createdAt: add(HOJE, -20) },
  ])
  await abrirAgenda(page)

  // aparecem exatamente UMA vez cada, e só nos baldes do dia atual
  await expect(page.locator('.task-card', { hasText: 'Recorrente diária' })).toHaveCount(1)
  await expect(page.locator('.task-card', { hasText: 'Recorrente perdida' })).toHaveCount(1)
  await expect(page.locator('[data-sec="hoje"]')).toContainText('Recorrente diária')
  await expect(page.locator('[data-sec="atrasadas"]')).toContainText('Recorrente perdida')
  // nenhuma seção futura recebe recorrentes
  await expect(page.locator('[data-sec="semana"]')).toHaveCount(0)
  await expect(page.locator('[data-sec="mes"]')).toHaveCount(0)
  await expect(page.locator('[data-sec="m1"]')).toHaveCount(0)
  await expect(page.locator('[data-sec="m2"]')).toHaveCount(0)
  await expect(page.locator('[data-sec="semestre"]')).toHaveCount(0)
  await expect(page.locator('[data-sec="ano"]')).toHaveCount(0)
})

test('agenda: toggle persiste e concluir/editar funciona na agenda', async ({ page }) => {
  await seed(page, [
    { id: 'u-hoje', title: 'Tarefa de hoje', difficulty: 'facil', dueDate: HOJE, createdAt: add(HOJE, -1) },
  ])
  await abrirAgenda(page)

  // concluir a tarefa direto na agenda → XP sobe
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 0/80')
  await page.locator('[data-sec="hoje"] [data-toggle-once]').first().click()
  await expect(page.locator('[data-s-xp]')).toHaveText('XP 10/80')

  // o modo persiste no reload (localStorage)
  await page.reload()
  await expect(page.locator('.agenda-board')).toBeVisible()
  await expect(page.locator('[data-view-mode="agenda"]')).toHaveClass(/active/)

  // volta para colunas → botão ativo troca e as colunas aparecem
  await page.locator('[data-view-mode="colunas"]').click()
  await expect(page.locator('.columns')).toBeVisible()
  await expect(page.locator('.agenda-board')).toHaveCount(0)
})
