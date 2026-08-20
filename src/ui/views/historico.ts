/** Historico view — extensive log of all game actions. */

import type { AppData, LogEvent, LogType } from '../../core/tipos'
import { appStore } from '../../stores/app'
import { escapeHtml } from '../util'

/** FA icon and label per event type. */
const TYPES: Record<LogType, { icon: string; label: string }> = {
  tarefa: { icon: 'fa-list-check', label: 'Tarefas' },
  habito: { icon: 'fa-repeat', label: 'Hábitos' },
  invocacao: { icon: 'fa-wand-magic-sparkles', label: 'Invocações' },
  carta: { icon: 'fa-layer-group', label: 'Cartas' },
  nivel: { icon: 'fa-arrow-trend-up', label: 'Nível' },
  dano: { icon: 'fa-heart-crack', label: 'Dano' },
  sistema: { icon: 'fa-gear', label: 'Sistema' },
}

let filterType: LogType | '' = ''

/** Formats the time of an event (HH:MM). */
function timeOf(ts: string): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Short day date (dd/mm/yyyy) for grouping. */
function dateOf(ts: string): string {
  const d = new Date(ts)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export function mountHistory(root: HTMLElement, data: AppData): void {
  const logs = filterType ? data.log.filter((e) => e.type === filterType) : data.log

  // groups by day (most recent first)
  const groups = new Map<string, LogEvent[]>()
  for (const e of logs) {
    const day = dateOf(e.ts)
    const list = groups.get(day) ?? []
    list.push(e)
    groups.set(day, list)
  }
  const days = [...groups.entries()]

  // counters per type
  const counts = data.log.reduce(
    (acc, e) => {
      acc[e.type] = (acc[e.type] ?? 0) + 1
      return acc
    },
    {} as Partial<Record<LogType, number>>,
  )

  root.innerHTML = `
    <header class="view-header">
      <h1>Histórico</h1>
      <p class="view-sub">${data.log.length} evento${data.log.length === 1 ? '' : 's'} registrados · as últimas ações do seu território</p>
    </header>

    <div class="filters history-filters">
      <button class="filter-chip${filterType === '' ? ' active' : ''}" data-filtro-tipo="">Tudo (${data.log.length})</button>
      ${(Object.keys(TYPES) as LogType[]).map((t) => `<button class="filter-chip${filterType === t ? ' active' : ''}" data-filtro-tipo="${t}">${TYPES[t].label} (${counts[t] ?? 0})</button>`).join('')}
    </div>

    ${days.length === 0 ? '<div class="empty"><strong>Nenhum evento ainda.</strong><p>Conclua tarefas, invoque cartas e suba de nível — tudo fica registrado aqui.</p></div>' : ''}

    ${days
      .map(
        ([day, events]) => `
      <div class="history-day">
        <h3 class="history-day-title">${escapeHtml(day)}</h3>
        <ul class="history-list">
          ${events
            .map(
              (e) => `
            <li class="history-item">
              <span class="history-icon historico-icone--${e.type}" title="${TYPES[e.type].label}"><i class="fa-solid ${TYPES[e.type].icon}" aria-hidden="true"></i></span>
              <span class="history-text">${escapeHtml(e.text)}</span>
              <time class="history-time" datetime="${escapeHtml(e.ts)}">${timeOf(e.ts)}</time>
            </li>`,
            )
            .join('')}
        </ul>
      </div>`,
      )
      .join('')}
  `

  root.querySelectorAll('[data-filtro-tipo]').forEach((chip) => {
    chip.addEventListener('click', () => {
      filterType = (chip.getAttribute('data-filtro-tipo') ?? '') as LogType | ''
      mountHistory(root, appStore.get())
    })
  })
}
