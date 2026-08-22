/** Historico view — extensive log of all game actions. */

import type { AppData, LogEvent, LogType } from '../../core/tipos'
import { appStore } from '../../stores/app'
import { escapeHtml } from '../util'
import { t } from '../../i18n'

/** FA icon and label per event type. */
const TYPES: Record<LogType, { icon: string; label: string }> = {
  tarefa: { icon: 'fa-list-check', label: t('history.tasks') },
  habito: { icon: 'fa-repeat', label: t('history.habits') },
  invocacao: { icon: 'fa-wand-magic-sparkles', label: t('history.invocations') },
  carta: { icon: 'fa-layer-group', label: t('history.cartas') },
  nivel: { icon: 'fa-arrow-trend-up', label: t('history.level') },
  dano: { icon: 'fa-heart-crack', label: t('history.damage') },
  sistema: { icon: 'fa-gear', label: t('history.system') },
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
      <h1>${t('history.title')}</h1>
      <p class="view-sub">${data.log.length === 1 ? t('history.sub1', {n: data.log.length}) : t('history.subN', {n: data.log.length})}</p>
    </header>

    <div class="filters history-filters">
      <button class="filter-chip${filterType === '' ? ' active' : ''}" data-filter-type="">${t('history.all')} (${data.log.length})</button>
      ${(Object.keys(TYPES) as LogType[]).map((t) => `<button class="filter-chip${filterType === t ? ' active' : ''}" data-filter-type="${t}">${TYPES[t].label} (${counts[t] ?? 0})</button>`).join('')}
    </div>

    ${days.length === 0 ? `<div class="empty"><strong>${t('history.empty')}</strong><p>${t('history.emptySub')}</p></div>` : ''}

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

  root.querySelectorAll('[data-filter-type]').forEach((chip) => {
    chip.addEventListener('click', () => {
      filterType = (chip.getAttribute('data-filter-type') ?? '') as LogType | ''
      mountHistory(root, appStore.get())
    })
  })
}
