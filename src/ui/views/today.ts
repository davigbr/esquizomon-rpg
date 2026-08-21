/** Initial view — 3 columns Habitica-style: Habits | Recurring | Tasks.
 *  Everything is done from this screen: add (modal with pre-selected type),
 *  toggle, repeat habit, edit, delete and filter.
 *  The visible date can be navigated (◀ ▶, max today) — everything reflects
 *  the selected day. */

import type { AppData, Difficulty, Task, TaskType } from '../../core/tipos'
import {
  addDays,
  calcStreak,
  dayOfMonth,
  dayOfWeek,
  daysSince,
  daysUntil,
  difficultyMeta,
  formatLongDate,
  formatWeekday,
  todayISO,
} from '../../core/jogo'
import { appStore, deleteTask, recordHabit, reorderTasks, tagsInUse, toggleOneOff, toggleRecurringToday } from '../../stores/app'
import { openTaskForm } from '../formTarefa'
import { escapeHtml } from '../util'
import { t } from '../../i18n'
import { renderNotes } from '../notas'
import { confirm } from '../modal'
import { notify, notifyCards } from '../toast'

/* Module-level filter state — survives the subscribe re-renders. */
let filterTag: string | null = null
let filterDifficulty: Difficulty | '' = ''
let showDone = false
let visibleDate = todayISO()
let clickHandler: ((e: Event) => void) | null = null

export function mountToday(root: HTMLElement, data: AppData): void {
  const todayReal = todayISO()
  const isToday = visibleDate === todayReal
  const isYesterday = visibleDate === addDays(todayReal, -1)
  const label = isToday ? t('today.today') : isYesterday ? t('today.yesterday') : formatWeekday(visibleDate)
  const weekday = dayOfWeek(new Date(visibleDate + 'T12:00:00'))
  const dayOfMonthNum = dayOfMonth(new Date(visibleDate + 'T12:00:00'))
  const tags = tagsInUse(data)

  const passes = (t: Task): boolean => {
    if (filterTag && !t.tags.includes(filterTag)) return false
    if (filterDifficulty && t.difficulty !== filterDifficulty) return false
    return true
  }

  const habits = data.tasks.filter((t) => t.type === 'habito' && passes(t))
  const recurring = data.tasks.filter((t) => t.type === 'recorrente' && appliesToday(t, weekday, dayOfMonthNum) && passes(t))
  const oneOffs = data.tasks.filter((t) => t.type === 'unica' && passes(t))
  const pending = oneOffs.filter((t) => !t.done)
  const done = showDone ? oneOffs.filter((t) => t.done && t.history.includes(visibleDate)) : []

  const filterActive = filterTag !== null || filterDifficulty !== ''
  const char = data.character

  root.innerHTML = `
    <header class="view-header">
      <div class="view-header-navigation">
        <button class="btn btn-icon" data-prev-day aria-label="${t('today.prevDay')}"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
        <h1>${escapeHtml(label)}</h1>
        <button class="btn btn-icon" data-next-day aria-label="${t('today.nextDay')}" ${isToday ? 'disabled' : ''}><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
      </div>
      <p class="view-sub">${escapeHtml(formatLongDate(visibleDate))}</p>
    </header>

    ${char.exhausted ? `<div class="sheet-depleted"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${t('today.exhausted')}</div>` : ''}

    <div class="filters">
      ${tags.length > 0
        ? `<span class="filters-label">${t('today.tag')}</span>${tags
            .map((tag) => `<button class="filter-chip${filterTag === tag ? ' active' : ''}" data-filter-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`)
            .join('')}`
        : ''}
      <select class="filter-select" data-filter-difficulty>
        <option value="">${t('today.allDifficulties')}</option>
        ${(['facil', 'media', 'dificil', 'extrema'] as Difficulty[])
          .map((d) => `<option value="${d}" ${filterDifficulty === d ? 'selected' : ''}>${difficultyMeta(d).label}</option>`)
          .join('')}
      </select>
      <button class="filter-chip${showDone ? ' active' : ''}" data-filter-done><i class="fa-solid fa-check" aria-hidden="true"></i> ${t('today.done')}</button>
      ${filterActive ? `<button class="btn btn-icon" data-clear-filters aria-label="${t('today.clear')}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>` : ''}
    </div>

    <div class="columns">
      <section class="column">
        <header class="column-header">
          <h2>${t('today.habitsColumn')}</h2>
          <span class="column-count">${habits.length}</span>
          <button class="btn btn-icon column-add" data-new-type="habito" aria-label="${t('today.newHabit')}"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
        </header>
        <div class="column-cards">
          ${habits.length === 0 ? emptyColumn(t('today.emptyHabit')) : habits.map((t) => habitCard(t, isToday, isYesterday)).join('')}
        </div>
      </section>

      <section class="column">
        <header class="column-header">
          <h2>${t('today.recColumn')}</h2>
          <span class="column-count">${recurring.length}</span>
          <button class="btn btn-icon column-add" data-new-type="recorrente" aria-label="${t('today.newRecurring')}"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
        </header>
        <div class="column-cards">
          ${recurring.length === 0 ? emptyColumn(t('today.emptyRec')) : recurring.map((t) => recurringCard(t, visibleDate)).join('')}
        </div>
      </section>

      <section class="column">
        <header class="column-header">
          <h2>${t('today.tasksColumn')}</h2>
          <span class="column-count">${pending.length}</span>
          <button class="btn btn-icon column-add" data-new-type="unica" aria-label="${t('today.newTask')}"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
        </header>
        <div class="column-cards">
          ${pending.length === 0 && done.length === 0 ? emptyColumn(t('today.emptyHabit')) : ''}
          ${pending.map((t) => oneOffCard(t, false)).join('')}
          ${done.length > 0 ? `<div class="column-sub">Concluídas · ${done.length}</div>${done.map((t) => oneOffCard(t, true)).join('')}` : ''}
        </div>
      </section>
    </div>
  `

  /* ---------- date navigation ---------- */
  root.querySelector('[data-prev-day]')!.addEventListener('click', () => {
    visibleDate = addDays(visibleDate, -1)
    mountToday(root, appStore.get())
  })
  root.querySelector('[data-next-day]')!.addEventListener('click', () => {
    if (visibleDate < todayReal) {
      visibleDate = addDays(visibleDate, 1)
      mountToday(root, appStore.get())
    }
  })

  /* ---------- add per column ---------- */
  root.querySelectorAll('[data-new-type]').forEach((el) => {
    el.addEventListener('click', () => {
      openTaskForm(undefined, el.getAttribute('data-new-type') as TaskType)
    })
  })

  /* ---------- filters ---------- */
  root.querySelectorAll('[data-filter-tag]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const tag = chip.getAttribute('data-filter-tag')!
      filterTag = filterTag === tag ? null : tag
      mountToday(root, appStore.get())
    })
  })
  root.querySelector('[data-filter-difficulty]')?.addEventListener('change', (e) => {
    filterDifficulty = (e.target as HTMLSelectElement).value as Difficulty | ''
    mountToday(root, appStore.get())
  })
  root.querySelector('[data-filter-done]')?.addEventListener('click', () => {
    showDone = !showDone
    mountToday(root, appStore.get())
  })
  root.querySelector('[data-clear-filters]')?.addEventListener('click', () => {
    filterTag = null
    filterDifficulty = ''
    showDone = false
    mountToday(root, appStore.get())
  })

  /* ---------- drag & drop (reorder within the column) ---------- */
  let draggingId: string | null = null

  root.querySelectorAll('.column-cards').forEach((cards) => {
    cards.addEventListener('dragstart', (e) => {
      const ev = e as DragEvent
      const target = (ev.target as HTMLElement).closest<HTMLElement>('.task-card[data-id]')
      if (!target) return
      draggingId = target.dataset.id ?? null
      target.classList.add('dragging' )
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'
    })
    cards.addEventListener('dragend', () => {
      draggingId = null
      cards.querySelectorAll('.dragging, .drag-target').forEach((el) => el.classList.remove('dragging' , 'arrasto-alvo'))
    })
    cards.addEventListener('dragover', (e) => {
      const ev = e as DragEvent
      ev.preventDefault()
      if (!draggingId) return
      const target = (ev.target as HTMLElement).closest<HTMLElement>('.task-card[data-id]')
      cards.querySelectorAll('.drag-target').forEach((el) => el.classList.remove('drag-target' ))
      if (target && target.dataset.id !== draggingId) target.classList.add('drag-target' )
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
    })
    cards.addEventListener('drop', (e) => {
      const ev = e as DragEvent
      ev.preventDefault()
      if (!draggingId) return
      const target = (ev.target as HTMLElement).closest<HTMLElement>('.task-card[data-id]')
      if (target && target.dataset.id !== draggingId) {
        const ids = [...cards.querySelectorAll<HTMLElement>('.task-card[data-id]')].map((c) => c.dataset.id!)
        const from = ids.indexOf(draggingId)
        const to = ids.indexOf(target.dataset.id!)
        if (from !== -1 && to !== -1) {
          ids.splice(from, 1)
          ids.splice(to, 0, draggingId)
          reorderTasks(ids)
          notify('Ordem atualizada.')
        }
      }
      draggingId = null
      cards.querySelectorAll('.dragging, .drag-target').forEach((el) => el.classList.remove('dragging' , 'arrasto-alvo'))
    })
  })

  /* ---------- card actions (delegated) ---------- */
  if (clickHandler) root.removeEventListener('click', clickHandler)
  clickHandler = (e: Event) => {
    const target = e.target as HTMLElement
    const action = target.closest<HTMLElement>('[data-toggle-rec],[data-toggle-once],[data-habit],[data-edit],[data-delete]')
    if (!action) return
    const id = action.dataset.id!

    if (action.dataset.toggleRec !== undefined) {
      const newCards = toggleRecurringToday(id, visibleDate)
      if (newCards.length > 0) void notifyCards(newCards, `🔓 Subiu de nível! ${newCards.length} carta${newCards.length > 1 ? 's' : ''} nova${newCards.length > 1 ? 's' : ''} no baralho`)
      return
    }
    if (action.dataset.toggleOnce !== undefined) {
      const newCards = toggleOneOff(id, visibleDate)
      if (newCards.length > 0) void notifyCards(newCards, `🔓 Subiu de nível! ${newCards.length} carta${newCards.length > 1 ? 's' : ''} nova${newCards.length > 1 ? 's' : ''} no baralho`)
      return
    }
    if (action.dataset.habit) {
      const newCards = recordHabit(id, action.dataset.habit as 'positivo' | 'negativo', visibleDate)
      if (newCards.length > 0) void notifyCards(newCards, `🔓 Subiu de nível! ${newCards.length} carta${newCards.length > 1 ? 's' : ''} nova${newCards.length > 1 ? 's' : ''} no baralho`)
      if (action.dataset.habit === 'positivo') notify('Repetição registrada.')
      else notify('Marcado como negativo.')
      return
    }
    if (action.dataset.edit !== undefined) {
      const task = data.tasks.find((x) => x.id === id)
      if (task) openTaskForm(task)
      return
    }
    if (action.dataset.delete !== undefined) {
      const task = data.tasks.find((x) => x.id === id)
      if (task) {
        void confirm(t('today.deleteMsg', { titulo: task.title }), t('today.delete')).then((ok) => {
          if (ok) {
            deleteTask(id)
            notify(t('today.deleted'))
          }
        })
      }
    }
  }
  root.addEventListener('click', clickHandler)
}

function appliesToday(t: Task, weekday: number, dayOfMonthNum: number): boolean {
  if (t.agenda?.daysOfMonth && t.agenda.daysOfMonth.length > 0) return t.agenda.daysOfMonth.includes(dayOfMonthNum)
  return !t.agenda || t.agenda.days.length === 0 || t.agenda.days.includes(weekday)
}

function habitCard(h: Task, isToday: boolean, isYesterday: boolean): string {
  const d = difficultyMeta(h.difficulty)
  const streak = calcStreak(h.history, visibleDate)
  // past day: shows if it was marked on it (derived from history);
  // today: uses the day counter
  const negHist = h.negativeHistory ?? []
  const negativeThisDay = !isToday && negHist.includes(visibleDate)
  const markedThisDay = !isToday && h.history.includes(visibleDate)
  const todayPos = isToday ? (h.counter?.today ?? 0) : markedThisDay ? 1 : 0
  const todayNeg = isToday ? (h.counter?.todayNeg ?? 0) : negativeThisDay ? 1 : 0
  const sign = h.sign ?? 'positivo'
  const oldClass = ageClass(h)
  // allows marking on TODAY and YESTERDAY (retroactive — adjusts streak/XP); never further back
  const canMark = isToday || isYesterday
  const canPositive = (sign === 'positivo' || sign === 'ambos') && canMark
  const canNegative = (sign === 'negativo' || sign === 'ambos') && canMark
  // visual cue: activated button (today or on the visible day) turns gold
  const posActive = todayPos > 0
  const negActive = todayNeg > 0
  const dayLabel = isToday ? t('today.todaySuffix') : t('today.refDaySuffix')
  return `
    <div class="task-card habit-card${oldClass}" draggable="true" data-id="${h.id}">
      <button class="habit-side habit-side--neg${negActive ? ' active' : ''}" data-habit="negativo" data-id="${h.id}" aria-label="${t('today.negRepeat')}" title="${negActive ? t('today.negativeDay', {loc: dayLabel, n: todayNeg}) : t('today.negRepeat')}" ${!canNegative ? 'disabled' : ''}><i class="fa-solid fa-minus" aria-hidden="true"></i></button>
      <div class="task-body">
        <p class="task-title">${escapeHtml(h.title)}</p>
        ${h.notes ? `<p class="task-notes">${renderNotes(h.notes)}</p>` : ''}
        <div class="task-meta">
          <span class="badge badge--${h.difficulty}">${d.label}</span>
          <span class="badge badge--hab-pos" title="${t('today.posToday')}">+${todayPos}</span>
          <span class="badge badge--hab-neg" title="${t('today.negToday')}">−${todayNeg}</span>
          <span class="badge" title="${t('today.streak')}">seq ${streak}</span>
          ${h.tags.map((tag) => `<span class="badge badge--tag">#${escapeHtml(tag)}</span>`).join('')}
          ${ageBadge(h)}
        </div>
      </div>
      <div class="task-actions">
        <button class="btn btn-icon" data-edit data-id="${h.id}" aria-label="Editar"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
        <button class="btn btn-icon" data-delete data-id="${h.id}" aria-label="Excluir"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
      </div>
      <button class="habit-side habit-side--pos${posActive ? ' active' : ''}" data-habit="positivo" data-id="${h.id}" aria-label="${t('today.posRepeat')}" title="${posActive ? t('today.positiveDay', {loc: dayLabel, n: todayPos}) : t('today.posRepeat')}" ${!canPositive ? 'disabled' : ''}><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
    </div>
  `
}

function recurringCard(t: Task, date: string): string {
  const done = t.history.includes(date)
  const d = difficultyMeta(t.difficulty)
  const schedule = scheduleLabel(t)
  const oldClass = ageClass(t)
  return `
    <div class="task-card${done ? ' done' : ''}${oldClass}" draggable="true" data-id="${t.id}">
      <button class="task-check${done ? ' marked' : ''}" data-toggle-rec data-id="${t.id}" aria-label="Concluir neste dia"><i class="fa-solid fa-check" aria-hidden="true"></i></button>
      <div class="task-body">
        <p class="task-title">${escapeHtml(t.title)}</p>
        ${t.notes ? `<p class="task-notes">${renderNotes(t.notes)}</p>` : ''}
        <div class="task-meta">
          <span class="badge badge--${t.difficulty}">${d.label}</span>
          ${t.tags.map((tag) => `<span class="badge badge--tag">#${escapeHtml(tag)}</span>`).join('')}
          ${schedule}
          ${ageBadge(t)}
        </div>
      </div>
      <div class="task-actions">
        <button class="btn btn-icon" data-edit data-id="${t.id}" aria-label="Editar"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
        <button class="btn btn-icon" data-delete data-id="${t.id}" aria-label="Excluir"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
      </div>
    </div>
  `
}

function oneOffCard(t: Task, done: boolean): string {
  const d = difficultyMeta(t.difficulty)
  const oldClass = ageClass(t)
  const due = dueDateBadge(t)
  return `
    <div class="task-card${done ? ' done' : ''}${oldClass}" draggable="true" data-id="${t.id}">
      <button class="task-check${done ? ' marked' : ''}" data-toggle-once data-id="${t.id}" aria-label="${done ? 'Reabrir' : 'Concluir'}"><i class="fa-solid ${done ? 'fa-rotate-left' : 'fa-check'}" aria-hidden="true"></i></button>
      <div class="task-body">
        <p class="task-title">${escapeHtml(t.title)}</p>
        ${t.notes ? `<p class="task-notes">${renderNotes(t.notes)}</p>` : ''}
        <div class="task-meta">
          <span class="badge badge--${t.difficulty}">${d.label}</span>
          ${t.tags.map((tag) => `<span class="badge badge--tag">#${escapeHtml(tag)}</span>`).join('')}
          ${due}
          ${ageBadge(t)}
        </div>
      </div>
      <div class="task-actions">
        <button class="btn btn-icon" data-edit data-id="${t.id}" aria-label="Editar"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
        <button class="btn btn-icon" data-delete data-id="${t.id}" aria-label="Excluir"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
      </div>
    </div>
  `
}

/** Due-date badge with color by proximity (only one-off tasks with a date). */
function dueDateBadge(t: Task): string {
  if (t.type !== 'unica' || !t.dueDate) return ''
  const days = daysUntil(t.dueDate, visibleDate)
  const date = new Date(t.dueDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
  if (days < 0) return `<span class="badge badge--due badge--due-vencida">venceu ${-days}d · ${date}</span>`
  if (days === 0) return `<span class="badge badge--due badge--due-urgente">vence neste dia · ${date}</span>`
  if (days <= 2) return `<span class="badge badge--due badge--due-urgente">${days}d · ${date}</span>`
  if (days <= 7) return `<span class="badge badge--due badge--due-proxima">${days}d · ${date}</span>`
  return `<span class="badge badge--due">${days}d · ${date}</span>`
}

/** Aging class based on the creation date. */
function ageClass(t: Task): string {
  const days = daysSince(t.createdAt)
  if (days > 30) return ' tarefa-antiga'
  if (days > 14) return ' tarefa-velha'
  return ''
}

function ageBadge(t: Task): string {
  const days = daysSince(t.createdAt)
  if (days > 30) return `<span class="badge">criada há ${days} dias</span>`
  return ''
}

function scheduleLabel(t: Task): string {
  if (t.agenda?.daysOfMonth && t.agenda.daysOfMonth.length > 0) {
    return `<span class="badge badge--agenda">dia ${t.agenda.daysOfMonth.join(', ')}</span>`
  }
  if (!t.agenda || t.agenda.days.length === 0) return ''
  const names = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
  const days = [...t.agenda.days].sort((a, b) => a - b).map((d) => names[d])
  return `<span class="badge badge--agenda">${escapeHtml(days.join(', '))}</span>`
}

function emptyColumn(text: string): string {
  return `<div class="empty empty-column"><strong>${escapeHtml(text)}</strong></div>`
}
