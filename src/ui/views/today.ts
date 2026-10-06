/** Initial view — 3 columns Habitica-style: Habits | Recurring | Tasks.
 *  Everything is done from this screen: add (modal with pre-selected type),
 *  toggle, repeat habit, edit, delete and filter.
 *  The visible date can be navigated (◀ ▶, max today) — everything reflects
 *  the selected day. */

import type { AgendaColumn, AgendaSection, AppData, Difficulty, Task, TaskType, TodayView } from '../../core/tipos'
import {
  addDays,
  calcStreak,
  daysSince,
  daysUntil,
  difficultyMeta,
  formatLongDate,
  formatWeekday,
  recurrenceDue,
  recurrenceOverdue,
  todayISO,
} from '../../core/jogo'
import { appStore, deleteTask, recordHabit, reorderTasks, setSettings, tagsInUse, toggleOneOff, toggleRecurringToday, healWithMana, HEAL_MANA_COST } from '../../stores/app'
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

/** Visualization mode of the "today" screen: the classic columns or the Agenda
 *  (planning) view. Stored in `settings.todayView` → persisted AND synced. */

/** View mode + Agenda layout live inside `settings` (part of AppData): they are
 *  persisted with the app AND synced with the account (settings merges LWW). */
const MAX_COLUNAS = 6

/** Default board: 3 horizon columns (names from the i18n labels). */
function agendaColunasPadrao(): AgendaColumn[] {
  return [
    { id: 'c1', name: t('today.horizonNow'), sections: ['atrasadas', 'hoje', 'proximas'] },
    { id: 'c2', name: t('today.horizonMonth'), sections: ['semana', 'mes'] },
    { id: 'c3', name: t('today.horizonFuture'), sections: ['m1', 'm2', 'semestre', 'ano'] },
  ]
}

/** Effective board layout — always a DEEP COPY, never the array stored in
 *  `settings`: the edit handlers mutate it in place, and if it aliased the store
 *  state the no-op guard (JSON equal) would see no change and skip the re-render
 *  (bug 2026-10-01: edits after the first save didn't show up). `settings.agenda`
 *  is already normalized by the storage layer (invariant: every AGENDA_SECTIONS
 *  id in EXACTLY one column). */
function layoutAtual(data: AppData): AgendaColumn[] {
  const salvo = data.settings?.agenda
  if (!salvo || salvo.length === 0) return agendaColunasPadrao()
  return salvo.map((c) => ({ id: c.id, name: c.name, sections: [...c.sections] }))
}

let viewMode: TodayView = 'colunas'
let agendaColunas: AgendaColumn[] = agendaColunasPadrao()
/** Edit mode of the board (rename/drag/columns). Transient — not persisted. */
let agendaEditando = false

export function mountToday(root: HTMLElement, data: AppData): void {
  // modo + layout vêm do store (settings) — persistidos e sincronizados
  viewMode = data.settings?.todayView === 'agenda' ? 'agenda' : 'colunas'
  agendaColunas = layoutAtual(data)
  const todayReal = todayISO()
  const isToday = visibleDate === todayReal
  const isYesterday = visibleDate === addDays(todayReal, -1)
  const label = isToday ? t('today.today') : isYesterday ? t('today.yesterday') : formatWeekday(visibleDate)
  const tags = tagsInUse(data)

  const passes = (t: Task): boolean => {
    if (filterTag && !t.tags.includes(filterTag)) return false
    if (filterDifficulty && t.difficulty !== filterDifficulty) return false
    return true
  }

  const habits = data.tasks.filter((t) => t.type === 'habito' && passes(t))
  const recurring = data.tasks.filter((t) => t.type === 'recorrente' && passes(t) && recurrenceDue(t, visibleDate))
  const oneOffs = data.tasks.filter((t) => t.type === 'unica' && passes(t))
  const pending = oneOffs.filter((t) => !t.done)
  const done = showDone ? oneOffs.filter((t) => t.done && t.history.includes(visibleDate)) : []

  const filterActive = filterTag !== null || filterDifficulty !== ''
  const char = data.character
  const isAgenda = viewMode === 'agenda'

  /* Colunas (visão clássica) — mantidas como estavam. */
  const colunasHtml = `
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

  root.innerHTML = `
    <header class="view-header">
      <div class="view-header-navigation">
        ${isAgenda ? '' : `<button class="btn btn-icon" data-prev-day aria-label="${t('today.prevDay')}"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>`}
        <h1>${escapeHtml(isAgenda ? t('today.today') : label)}</h1>
        ${isAgenda ? '' : `<button class="btn btn-icon" data-next-day aria-label="${t('today.nextDay')}" ${isToday ? 'disabled' : ''}><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>`}
        <button class="btn btn-heal" data-heal aria-label="${t('today.healLabel', { mana: HEAL_MANA_COST })}" title="${t('today.healTitle', { mana: HEAL_MANA_COST })}" ${char.hp >= char.hpMax || char.mana < HEAL_MANA_COST ? 'disabled' : ''}><i class="fa-solid fa-heart-pulse" aria-hidden="true"></i><span class="heal-cost">${HEAL_MANA_COST}⚡</span></button>
        <div class="view-mode-toggle" role="tablist" aria-label="${t('today.viewMode')}">
          <button type="button" class="view-mode-btn${isAgenda ? '' : ' active'}" data-view-mode="colunas" role="tab" aria-selected="${!isAgenda}">${t('today.viewColumns')}</button>
          <button type="button" class="view-mode-btn${isAgenda ? ' active' : ''}" data-view-mode="agenda" role="tab" aria-selected="${isAgenda}">${t('today.viewAgenda')}</button>
        </div>
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

    ${isAgenda ? agendaHtml(data, todayReal, passes, showDone) : colunasHtml}
  `

  /* ---------- view mode toggle (Colunas | Agenda) ---------- */
  root.querySelectorAll('[data-view-mode]').forEach((el) => {
    el.addEventListener('click', () => {
      const m = el.getAttribute('data-view-mode')
      if (m !== 'colunas' && m !== 'agenda') return
      if (m === 'agenda') visibleDate = todayReal // a Agenda ancora sempre no dia atual
      setSettings({ todayView: m }) // persiste no save + sincroniza (store re-renderiza)
    })
  })

  /* ---------- date navigation (só na visão Colunas) ---------- */
  root.querySelector('[data-prev-day]')?.addEventListener('click', () => {
    visibleDate = addDays(visibleDate, -1)
    mountToday(root, appStore.get())
  })
  root.querySelector('[data-next-day]')?.addEventListener('click', () => {
    if (visibleDate < todayReal) {
      visibleDate = addDays(visibleDate, 1)
      mountToday(root, appStore.get())
    }
  })

  /* ---------- Agenda: personalização (colunas, nomes, arrastar) ---------- */
  root.querySelector('[data-agenda-edit]')?.addEventListener('click', () => {
    agendaEditando = true
    mountToday(root, appStore.get())
  })
  root.querySelector('[data-agenda-done]')?.addEventListener('click', () => {
    agendaEditando = false
    setSettings({ agenda: agendaColunas })
    // `agendaEditando` é estado de módulo (não do store): re-renderiza mesmo que
    // o store não mude (senão "Concluir" sem edições não saía do modo edição)
    mountToday(root, appStore.get())
  })
  root.querySelector('[data-agenda-addcol]')?.addEventListener('click', () => {
    if (agendaColunas.length >= MAX_COLUNAS) return
    agendaColunas.push({
      id: `c${Date.now().toString(36)}`,
      name: `${t('today.columnName')} ${agendaColunas.length + 1}`,
      sections: [],
    })
    setSettings({ agenda: agendaColunas })
  })
  root.querySelectorAll('[data-agenda-delcol]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-agenda-delcol')
      const i = agendaColunas.findIndex((c) => c.id === id)
      if (i === -1 || agendaColunas.length <= 1) return
      const [removida] = agendaColunas.splice(i, 1)
      // nenhuma seção se perde: as órfãs vão para a coluna anterior (ou a primeira)
      const destino = agendaColunas[Math.max(0, i - 1)]
      destino.sections.push(...removida.sections)
      setSettings({ agenda: agendaColunas })
    })
  })
  root.querySelectorAll('[data-agenda-colname]').forEach((el) => {
    const input = el as HTMLInputElement
    const col = agendaColunas.find((c) => c.id === input.getAttribute('data-agenda-colname'))
    if (!col) return
    // digitação atualiza só em memória (sem re-render por tecla); salva ao sair
    input.addEventListener('input', () => {
      col.name = input.value
    })
    input.addEventListener('blur', () => {
      col.name = input.value.trim() || col.name
      input.value = col.name
      setSettings({ agenda: agendaColunas })
    })
  })

  /* drag & drop das seções entre colunas (só no modo edição) */
  const board = root.querySelector<HTMLElement>('.agenda-board')
  if (board && agendaEditando) {
    let arrastando: AgendaSection | null = null
    board.addEventListener('dragstart', (e) => {
      const sec = (e.target as HTMLElement).closest<HTMLElement>('.agenda-sec[data-sec]')
      if (!sec) return
      arrastando = (sec.dataset.sec as AgendaSection) ?? null
      sec.classList.add('dragging')
      const dt = (e as DragEvent).dataTransfer
      if (dt) {
        dt.setData('text/plain', arrastando ?? '')
        dt.effectAllowed = 'move'
      }
    })
    board.addEventListener('dragend', () => {
      arrastando = null
      board.querySelectorAll('.dragging, .drag-target').forEach((el) => el.classList.remove('dragging', 'drag-target'))
      board.querySelectorAll('.agenda-drop-line').forEach((el) => el.remove())
    })
    board.addEventListener('dragover', (e) => {
      e.preventDefault()
      const col = (e.target as HTMLElement).closest<HTMLElement>('.agenda-col')
      board.querySelectorAll('.drag-target').forEach((el) => el.classList.remove('drag-target'))
      board.querySelectorAll('.agenda-drop-line').forEach((el) => el.remove())
      if (!col || !arrastando) return
      col.classList.add('drag-target')
      // linha indicando ONDE a seção vai cair: antes da 1ª seção cujo meio está
      // abaixo do cursor (a própria seção arrastada é ignorada)
      const linha = document.createElement('div')
      linha.className = 'agenda-drop-line'
      const secs = Array.from(col.querySelectorAll<HTMLElement>('.agenda-sec[data-sec]')).filter(
        (s) => s.dataset.sec !== arrastando,
      )
      const alvo = secs.find((s) => {
        const r = s.getBoundingClientRect()
        return e.clientY < r.top + r.height / 2
      })
      if (alvo) col.insertBefore(linha, alvo)
      else col.appendChild(linha)
    })
    board.addEventListener('drop', (e) => {
      e.preventDefault()
      const colEl = (e.target as HTMLElement).closest<HTMLElement>('.agenda-col')
      if (!colEl || !arrastando) return
      const destino = agendaColunas.find((c) => c.id === colEl.dataset.colId)
      if (!destino) return
      // a posição é dada pela linha de inserção; sem linha, vai para o fim
      const linha = board.querySelector('.agenda-drop-line')
      const prox = linha?.nextElementSibling as HTMLElement | null
      const secAlvo = prox && prox.matches('.agenda-sec[data-sec]') ? (prox.dataset.sec as AgendaSection) : null
      const movida = arrastando
      for (const c of agendaColunas) c.sections = c.sections.filter((s) => s !== movida)
      const idx = secAlvo ? destino.sections.indexOf(secAlvo) : -1
      if (idx >= 0) destino.sections.splice(idx, 0, movida)
      else destino.sections.push(movida)
      arrastando = null
      setSettings({ agenda: agendaColunas })
    })
  }

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
    const action = target.closest<HTMLElement>('[data-toggle-rec],[data-toggle-once],[data-habit],[data-edit],[data-delete],[data-heal]')
    if (!action) return
    const id = action.dataset.id!

    if (action.dataset.heal !== undefined) {
      const res = healWithMana()
      if (res.ok) notify(t('today.healed', { mana: HEAL_MANA_COST }))
      else notify(res.reason ?? t('today.healMana'))
      return
    }

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

function recurringCard(task: Task, date: string): string {
  const done = task.history.includes(date)
  const overdue = recurrenceOverdue(task, date)
  const d = difficultyMeta(task.difficulty)
  const schedule = scheduleLabel(task)
  const streak = calcStreak(task.history, date)
  const oldClass = ageClass(task)
  return `
    <div class="task-card${done ? ' done' : ''}${overdue ? ' overdue' : ''}${oldClass}" draggable="true" data-id="${task.id}">
      <button class="task-check${done ? ' marked' : ''}" data-toggle-rec data-id="${task.id}" aria-label="Concluir neste dia"><i class="fa-solid fa-check" aria-hidden="true"></i></button>
      <div class="task-body">
        <p class="task-title">${escapeHtml(task.title)}</p>
        ${task.notes ? `<p class="task-notes">${renderNotes(task.notes)}</p>` : ''}
        <div class="task-meta">
          <span class="badge badge--${task.difficulty}">${d.label}</span>
          ${overdue ? `<span class="badge badge--overdue" title="${t('today.overdueTitle')}"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> ${t('today.overdue')}</span>` : ''}
          ${task.tags.map((tag) => `<span class="badge badge--tag">#${escapeHtml(tag)}</span>`).join('')}
          <span class="badge">seq ${streak}</span>
          ${schedule}
        </div>
      </div>
      <div class="task-actions">
        <button class="btn btn-icon" data-edit data-id="${task.id}" aria-label="Editar"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
        <button class="btn btn-icon" data-delete data-id="${task.id}" aria-label="Excluir"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
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

/** Nomes de mês (pt) para os títulos de seção da Agenda. */
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

/** Agenda (planejamento): só recorrentes e tarefas (sem hábitos), em seções por
 *  janela de data. Cada item aparece UMA única vez. Recorrentes só no dia atual
 *  (atrasadas se houver ocorrência perdida; senão hoje) — nunca em seções futuras.
 *  Seções: atrasadas → hoje → próximas ações (sem data) → semana (até sábado) →
 *  mês corrente → +1 → +2 → semestre (resto do semestre civil) → ano (resto). */
function agendaHtml(data: AppData, hoje: string, passes: (t: Task) => boolean, mostrarConcluidas: boolean): string {
  const [Y, M, D] = hoje.split('-').map(Number)
  const isoOf = (y: number, m: number, d: number): string => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const diasNoMes = (y: number, m: number): number => new Date(y, m, 0).getDate()

  // fim da semana = sábado (23:59) da semana corrente
  const sáb = new Date(Y, M - 1, D)
  sáb.setDate(sáb.getDate() + ((6 - sáb.getDay() + 7) % 7))
  const fimSemana = isoOf(sáb.getFullYear(), sáb.getMonth() + 1, sáb.getDate())
  const fimMes = isoOf(Y, M, diasNoMes(Y, M))
  const m1y = M === 12 ? Y + 1 : Y
  const m1m = M === 12 ? 1 : M + 1
  const fimM1 = isoOf(m1y, m1m, diasNoMes(m1y, m1m))
  const m2y = m1m === 12 ? m1y + 1 : m1y
  const m2m = m1m === 12 ? 1 : m1m + 1
  const fimM2 = isoOf(m2y, m2m, diasNoMes(m2y, m2m))
  const fimSemestre = M <= 6 ? isoOf(Y, 6, 30) : isoOf(Y, 12, 31)

  const bucket = (d: string): string => {
    if (d < hoje) return 'atrasadas'
    if (d === hoje) return 'hoje'
    if (d <= fimSemana) return 'semana'
    if (d <= fimMes) return 'mes'
    if (d <= fimM1) return 'm1'
    if (d <= fimM2) return 'm2'
    if (d <= fimSemestre) return 'semestre'
    return 'ano'
  }

  const S: Record<string, Task[]> = {
    atrasadas: [], hoje: [], proximas: [], semana: [], mes: [], m1: [], m2: [], semestre: [], ano: [],
  }
  for (const t of data.tasks) {
    if (t.type === 'habito') continue
    if (!passes(t)) continue
    if (t.type === 'recorrente') {
      // MESMA regra da tela de Colunas: o card só existe se `recurrenceDue` (a
      // ocorrência está aberta). `recurrenceOverdue` é só o BADGE de atraso — ele
      // dá true mesmo quando a ocorrência já foi concluída no ciclo (bug
      // 2026-10-01: uma semanal já feita aparecia em "Atrasadas" na Agenda).
      if (!recurrenceDue(t, hoje)) continue
      if (recurrenceOverdue(t, hoje)) S.atrasadas.push(t)
      else S.hoje.push(t)
      continue
    }
    if (t.done && !mostrarConcluidas) continue
    if (!t.dueDate) S.proximas.push(t)
    else S[bucket(t.dueDate)].push(t)
  }

  const porData = (a: Task, b: Task): number =>
    (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || a.title.localeCompare(b.title)
  ;(['atrasadas', 'hoje', 'semana', 'mes', 'm1', 'm2', 'semestre', 'ano'] as const).forEach((k) => S[k].sort(porData))
  S.proximas.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const curto = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  const faixa = (arr: Task[]): string => {
    const ds = arr.map((t) => t.dueDate ?? '').filter(Boolean).sort()
    if (ds.length === 0) return ''
    const f = (iso: string): string => {
      const x = new Date(iso + 'T12:00:00')
      return MESES[x.getMonth()].slice(0, 3).toLowerCase() + '/' + String(x.getFullYear()).slice(2)
    }
    const a = f(ds[0])
    const b = f(ds[ds.length - 1])
    return a === b ? a : `${a} – ${b}`
  }

  const defs: Array<{ key: string; title: string; sub?: string; cls: string; sempre?: boolean; add?: boolean }> = [
    { key: 'atrasadas', title: t('today.secOverdue'), cls: 'atrasadas' },
    { key: 'hoje', title: t('today.today'), cls: 'hoje', sempre: true },
    { key: 'proximas', title: t('today.secNext'), cls: 'proximas', sempre: true },
    { key: 'semana', title: t('today.secWeek'), sub: t('today.until', { date: curto(fimSemana) }), cls: 'semana' },
    { key: 'mes', title: `${MESES[M - 1]} ${Y}`, cls: 'mes' },
    { key: 'm1', title: `${MESES[m1m - 1]} ${m1y}`, cls: 'mes' },
    { key: 'm2', title: `${MESES[m2m - 1]} ${m2y}`, cls: 'mes' },
    { key: 'semestre', title: t('today.secSemester'), sub: faixa(S.semestre), cls: 'mes' },
    { key: 'ano', title: t('today.secYear'), sub: faixa(S.ano), cls: 'mes' },
  ]

  const card = (t: Task): string => (t.type === 'recorrente' ? recurringCard(t, hoje) : oneOffCard(t, t.done === true))
  const vazio: Record<string, string> = { hoje: t('today.emptyToday'), proximas: t('today.emptyNext') }

  const porChave: Record<string, (typeof defs)[number]> = {}
  for (const d of defs) porChave[d.key] = d

  const editando = agendaEditando

  const secHtml = (d: (typeof defs)[number]): string => {
    const itens = S[d.key]
    return `
      <section class="agenda-sec agenda-sec--${d.cls}" data-sec="${d.key}"${editando ? ' draggable="true"' : ''}>
        <header class="agenda-sec-head">
          <span class="agenda-sec-mark" aria-hidden="true"></span>
          <h2>${escapeHtml(d.title)}</h2>
          ${d.sub ? `<span class="agenda-sec-sub">${escapeHtml(d.sub)}</span>` : ''}
          <span class="column-count">${itens.length}</span>
          ${d.add && !editando ? `<button class="btn btn-icon column-add" data-new-type="unica" aria-label="${t('today.newTask')}"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>` : ''}
        </header>
        <div class="agenda-sec-cards">
          ${itens.length === 0 ? emptyColumn(vazio[d.key] ?? t('today.emptyHabit')) : itens.map(card).join('')}
        </div>
      </section>
    `
  }

  // Board personalizável: colunas (nome + seções) vêm de `agendaColunas`.
  const colunasHtml = agendaColunas
    .map((c) => {
      const visiveis = c.sections
        .map((k) => porChave[k])
        .filter((d) => d && (editando || d.sempre || S[d.key].length > 0))
      const head = editando
        ? `<input class="agenda-col-name" data-agenda-colname="${c.id}" value="${escapeHtml(c.name)}"
             aria-label="${t('today.columnName')}" maxlength="40" placeholder="${t('today.columnName')}" />
           <button class="agenda-col-del" data-agenda-delcol="${c.id}" aria-label="${t('today.removeColumn')}"
             title="${t('today.removeColumn')}" ${agendaColunas.length <= 1 ? 'disabled' : ''}>×</button>`
        : `<div class="agenda-col-title">${escapeHtml(c.name)}</div>`
      return `
        <div class="agenda-col" data-col-id="${c.id}">
          <div class="agenda-col-head">${head}</div>
          ${visiveis.length === 0 ? `<p class="agenda-col-empty">${t('today.nothingHere')}</p>` : visiveis.map(secHtml).join('')}
        </div>
      `
    })
    .join('')

  const toolbar = `
    <div class="agenda-toolbar">
      ${editando
        ? `<span class="agenda-hint">${t('today.agendaHint')}</span>
           <button type="button" class="agenda-btn" data-agenda-addcol ${agendaColunas.length >= MAX_COLUNAS ? 'disabled' : ''}>+ ${t('today.addColumn')}</button>
           <button type="button" class="agenda-btn agenda-btn--primary" data-agenda-done>${t('today.agendaDone')}</button>`
        : `<button type="button" class="agenda-btn" data-agenda-edit>${t('today.agendaCustomize')}</button>`}
    </div>
  `

  return `
    <div class="agenda-wrap">
      ${toolbar}
      <div class="agenda-board${editando ? ' is-editing' : ''}" style="--cols:${agendaColunas.length}">${colunasHtml}</div>
      <button type="button" class="agenda-fab" data-new-type="unica"
        aria-label="${t('today.newTask')}" title="${t('today.newTask')}">
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
      </button>
    </div>
  `
}
