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
      // idempotente: em reloads NÃO re-semeia (senão apagaria o que o app salvou —
      // ex.: o layout/modo da Agenda persistido em settings)
      if (localStorage.getItem('esquizomon-rpg:v1')) return
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
  // SEM pontilhado nas atrasadas (nem na seção, nem no card) — decisão do usuário
  expect(await atras.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none')
  expect(
    await atras.locator('.task-card.overdue').first().evaluate((el) => getComputedStyle(el).outlineStyle),
  ).toBe('none')

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
  // o mês (e o +1/+2) aparece pelo NOME — os rótulos são dinâmicos
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

/** Layout salvo no blob do app (é o que persiste E sincroniza com a conta). */
const layoutSalvo = (p: import('@playwright/test').Page) =>
  p.evaluate(
    () =>
      (JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}') as {
        settings?: { agenda?: Array<{ name: string; sections: string[] }> }
      }).settings?.agenda ?? [],
  )

test('agenda: personalizar — renomear, colunas e arrastar seção (persiste em settings/sync)', async ({ page }) => {
  await seed(page, TODAS)
  await abrirAgenda(page)

  // modo edição: campos de nome + TODAS as 9 seções visíveis (para arrastar)
  await page.locator('[data-agenda-edit]').click()
  await expect(page.locator('.agenda-col-name')).toHaveCount(3)
  await expect(page.locator('.agenda-sec')).toHaveCount(9)

  // renomeia a 1ª coluna
  const nome1 = page.locator('[data-agenda-colname]').first()
  await nome1.fill('Bomba')
  await nome1.blur()
  await expect.poll(async () => (await layoutSalvo(page))[0]?.name ?? null).toBe('Bomba')

  // adiciona uma coluna (4)
  await page.locator('[data-agenda-addcol]').click()
  await expect(page.locator('.agenda-col')).toHaveCount(4)

  // arrasta a seção "semana" para a 1ª coluna (DnD HTML5 sintético — o dragTo do
  // Playwright não dispara os eventos de drag de forma confiável aqui)
  await page.evaluate(() => {
    const sec = document.querySelector('.agenda-sec[data-sec="semana"]') as HTMLElement
    const col = document.querySelector('.agenda-col') as HTMLElement
    const dt = new DataTransfer()
    sec.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
    col.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }))
    col.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }))
    sec.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }))
  })
  await expect.poll(async () => (await layoutSalvo(page))[0]?.sections ?? []).toContain('semana')

  // INVARIANTE: as 9 seções seguem existindo, cada uma em UMA coluna
  const planas = (await layoutSalvo(page)).flatMap((c) => c.sections)
  expect(planas.length).toBe(9)
  expect(new Set(planas).size).toBe(9)

  // sai do modo edição e recarrega → layout + modo persistem
  await page.locator('[data-agenda-done]').click()
  await page.reload()
  await expect(page.locator('.agenda-board')).toBeVisible()
  await expect(page.locator('.agenda-col')).toHaveCount(4)
  await expect(page.locator('.agenda-col-title').first()).toHaveText('Bomba')
})

test('agenda: remover coluna não perde nenhuma seção (invariante preservado)', async ({ page }) => {
  await seed(page, TODAS)
  await abrirAgenda(page)
  await page.locator('[data-agenda-edit]').click()
  await expect(page.locator('.agenda-col')).toHaveCount(3)

  // remove a 1ª coluna (as seções vão para a seguinte)
  await page.locator('[data-agenda-delcol]').first().click()
  await expect(page.locator('.agenda-col')).toHaveCount(2)

  const planas = (await layoutSalvo(page)).flatMap((c) => c.sections)
  expect(planas.length).toBe(9)
  expect(new Set(planas).size).toBe(9)
})

test('agenda: reordenar uma seção DENTRO da mesma coluna', async ({ page }) => {
  await seed(page, TODAS)
  await abrirAgenda(page)
  await page.locator('[data-agenda-edit]').click()
  // coluna 1 nasce como [Atrasadas, Hoje, Próximas Ações] (ordem inicial no DOM)
  await expect(page.locator('.agenda-col').first().locator('.agenda-sec h2')).toHaveText([
    'Atrasadas',
    'Hoje',
    'Próximas Ações',
  ])

  // arrasta "atrasadas" para a METADE INFERIOR de "hoje" → deve cair depois dele
  await page.evaluate(() => {
    const col = document.querySelector('.agenda-col') as HTMLElement
    const origem = col.querySelector('.agenda-sec[data-sec="atrasadas"]') as HTMLElement
    const alvo = col.querySelector('.agenda-sec[data-sec="hoje"]') as HTMLElement
    const dt = new DataTransfer()
    const r = alvo.getBoundingClientRect()
    const x = r.left + 20
    const y = r.top + r.height * 0.85 // metade inferior
    origem.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
    col.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt, clientX: x, clientY: y }))
    col.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt, clientX: x, clientY: y }))
  })
  await expect.poll(async () => (await layoutSalvo(page))[0]?.sections ?? []).toEqual([
    'hoje',
    'atrasadas',
    'proximas',
  ])
  // e a tela reflete a nova ordem
  await expect(page.locator('.agenda-col').first().locator('.agenda-sec h2')).toHaveText([
    'Hoje',
    'Atrasadas',
    'Próximas Ações',
  ])
})

test('agenda: sair da personalização funciona repetidamente (bug 2026-10-01)', async ({ page }) => {
  await seed(page, TODAS)
  await abrirAgenda(page)
  await page.locator('[data-agenda-edit]').click()
  // hover do "Concluir": texto NÃO pode ficar da cor do fundo (dourado sobre dourado)
  const done = page.locator('[data-agenda-done]')
  await done.hover()
  const cores = await done.evaluate((el) => {
    const s = getComputedStyle(el)
    return { cor: s.color, fundo: s.backgroundColor }
  })
  expect(cores.cor).not.toBe(cores.fundo)
  // entrar/sair 2× — "Concluir" sem edições não pode travar no modo edição
  for (let i = 0; i < 2; i++) {
    if (i > 0) await page.locator('[data-agenda-edit]').click()
    await expect(page.locator('.agenda-col-name')).toHaveCount(3)
    await page.locator('[data-agenda-done]').click()
    await expect(page.locator('.agenda-col-name')).toHaveCount(0)
    await expect(page.locator('.agenda-col-title')).toHaveCount(3)
  }
})

test('agenda: edições continuam valendo depois da config já salva (re-render)', async ({ page }) => {
  await seed(page, TODAS)
  await abrirAgenda(page)
  // 1ª gravação: a partir daqui settings.agenda existe (o layout não pode mais
  // ser a MESMA referência do store, senão o guarda de no-op engole o re-render)
  await page.locator('[data-agenda-edit]').click()
  await page.locator('[data-agenda-done]').click()
  // agora edita de novo: adicionar e remover coluna devem refletir na hora
  await page.locator('[data-agenda-edit]').click()
  await page.locator('[data-agenda-addcol]').click()
  await expect(page.locator('.agenda-col')).toHaveCount(4)
  await page.locator('[data-agenda-delcol]').last().click()
  await expect(page.locator('.agenda-col')).toHaveCount(3)
})

test('agenda: recorrente JÁ concluída no ciclo não aparece como atrasada (bug 2026-10-01)', async ({ page }) => {
  await seed(page, [
    // semanal agendada para ontem e CONCLUÍDA no dia agendado → não aparece em lugar nenhum
    { id: 'r-ok', title: 'Semanal feita', difficulty: 'media', type: 'recorrente', agenda: { days: [ontemWD] }, history: [ontem], createdAt: add(HOJE, -30) },
    // semanal agendada para ontem e NÃO concluída → atrasada
    { id: 'r-late', title: 'Semanal atrasada', difficulty: 'media', type: 'recorrente', agenda: { days: [ontemWD] }, history: [], createdAt: add(HOJE, -30) },
  ])
  await abrirAgenda(page)

  await expect(page.locator('.task-card', { hasText: 'Semanal feita' })).toHaveCount(0)
  await expect(page.locator('[data-sec="atrasadas"]')).toContainText('Semanal atrasada')
  await expect(page.locator('.task-card', { hasText: 'Semanal atrasada' })).toHaveCount(1)
})

test('agenda: DESABILITADA no mobile (só Colunas) e sem sobrescrever a preferência salva', async ({ page }) => {
  await seed(page, TODAS)
  await abrirAgenda(page)
  // a escolha fica em settings (é ela que sincroniza com a conta)
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')?.settings?.todayView ?? null))
    .toBe('agenda')

  // ---- mobile (390×844): sem toggle, sem Agenda, só a visão Colunas ----
  // (mesma URL não recarrega: usar reload() p/ a tela re-renderizar no novo viewport)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.locator('.columns')).toBeVisible()
  await expect(page.locator('[data-view-mode]')).toHaveCount(0)
  await expect(page.locator('.agenda-board')).toHaveCount(0)
  await expect(page.locator('.agenda-fab')).toHaveCount(0)
  // o celular NÃO sobrescreve a preferência (o desktop continua na Agenda)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')?.settings?.todayView)).toBe('agenda')

  // ---- limites do breakpoint: 900 = mobile, 901 = desktop ----
  await page.setViewportSize({ width: 900, height: 800 })
  await page.reload()
  await expect(page.locator('[data-view-mode]')).toHaveCount(0)
  await page.setViewportSize({ width: 901, height: 800 })
  await page.reload()
  await expect(page.locator('.agenda-board')).toBeVisible()

  // ---- de volta no desktop largo: segue na Agenda ----
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.reload()
  await expect(page.locator('.agenda-board')).toBeVisible()
})

test('agenda: botão flutuante (+) no canto inferior direito (substitui o + de Próximas Ações)', async ({ page }) => {
  await seed(page, TODAS)
  await abrirAgenda(page)

  // o "+" saiu da seção Próximas Ações
  await expect(page.locator('[data-sec="proximas"] [data-new-type]')).toHaveCount(0)

  // FAB existe, é fixo e fica no canto inferior direito
  const fab = page.locator('.agenda-fab')
  await expect(fab).toBeVisible()
  const box = await fab.evaluate((el) => {
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return {
      pos: s.position,
      distDireita: Math.round(window.innerWidth - r.right),
      distBaixo: Math.round(window.innerHeight - r.bottom),
    }
  })
  expect(box.pos).toBe('fixed')
  expect(box.distDireita).toBeGreaterThan(0)
  expect(box.distBaixo).toBeGreaterThan(0)

  // clicar abre o formulário de nova tarefa
  await fab.click()
  await expect(page.locator('input[name="title"]')).toBeVisible()
})

test('agenda: config incompleta é normalizada (nada some da tela)', async ({ page }) => {
  await seed(page, TODAS)
  // grava uma config antiga com UMA coluna e só "atrasadas" e recarrega: as outras
  // 8 seções devem ser re-anexadas pela normalização do storage ao carregar
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}')
    raw.settings = {
      theme: 'dark',
      todayView: 'agenda',
      agenda: [{ id: 'x', name: 'Só atrasadas', sections: ['atrasadas'] }],
    }
    localStorage.setItem('esquizomon-rpg:v1', JSON.stringify(raw))
  })
  await page.reload()
  await expect(page.locator('.agenda-board')).toBeVisible()
  await page.locator('[data-agenda-edit]').click()
  await expect(page.locator('.agenda-sec')).toHaveCount(9)
})
