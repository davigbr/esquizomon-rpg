/** Habitica-style check-in modal — appears on the first access of the day when
 *  there are pending tasks from yesterday. The user marks which ones want to
 *  retroactively complete; daily damage only hits the unmarked ones. */

import { openModal, closeModal } from './modal'
import { appStore, finishCheckin, pendingCheckin } from '../stores/app'
import { escapeHtml } from './util'
import { formatLongDate, xpFor } from '../core/jogo'
import type { Difficulty } from '../core/tipos'

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  facil: 'Fácil',
  media: 'Média',
  dificil: 'Difícil',
  extrema: 'Extrema',
}

/** Displays the check-in modal if there are pending items from yesterday. */
export function checkDaily(): void {
  const pend = pendingCheckin
  if (!pend || pend.ids.length === 0) return

  const tasks = appStore.get().tasks.filter((t) => pend.ids.includes(t.id))
  if (tasks.length === 0) return

  const items = tasks
    .map(
      (t) => `
      <label class="checkin-item">
        <input type="checkbox" class="checkin-check" data-checkin-id="${escapeHtml(t.id)}" />
        <span class="checkin-info">
          <span class="checkin-title">${escapeHtml(t.title)}</span>
          <span class="checkin-meta">${t.type === 'unica' ? 'Tarefa' : 'Recorrente'} · ${DIFFICULTY_LABEL[t.difficulty]} · +${xpFor(t.difficulty)} XP</span>
        </span>
      </label>`,
    )
    .join('')

  openModal(`
    <h2 class="checkin-title-modal">Atividades de ontem</h2>
    <p class="checkin-sub">Confira as <strong>atividades recorrentes de ${escapeHtml(formatLongDate(pend.date))}</strong> (ontem). Nada vem pré-marcado: marque as que você fez de verdade — <strong>só as recorrentes</strong> não marcadas contam como perdidas e causam dano (tarefas únicas vencidas não dão dano).</p>
    <div class="checkin-list">${items}</div>
    <div class="form-actions">
      <button class="btn" btn-primary data-checkin-confirmar>Check-in</button>
    </div>
  `)

  const mark = (): string[] =>
    Array.from(getModalBody().querySelectorAll<HTMLInputElement>('.checkin-check:checked')).map((i) => i.dataset.checkinId ?? '').filter(Boolean)

  getModalBody().querySelector<HTMLButtonElement>('[data-checkin-confirmar]')?.addEventListener('click', () => {
    const ids = mark()
    closeModal()
    finishCheckin(ids)
  })
}

function getModalBody(): HTMLElement {
  return document.getElementById('modal-body')!
}
