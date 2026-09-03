/** Habitica-style check-in modal — appears on the first access of the day when
 *  there are pending tasks from yesterday. The user marks which ones want to
 *  retroactively complete; daily damage only hits the unmarked ones. */

import { openModal, closeModal } from './modal'
import { appStore, finishCheckin, pendingCheckin, settleAllDone } from '../stores/app'
import { escapeHtml } from './util'
import { difficultyMeta, formatLongDate, xpFor } from '../core/jogo'
import { t } from '../i18n'

/** Displays the check-in modal if there are pending items from yesterday. */
export function checkDaily(): void {
  const pend = pendingCheckin
  if (!pend || pend.ids.length === 0) return

  const tasks = appStore.get().tasks.filter((t) => pend.ids.includes(t.id))
  // Re-deriva do estado ATUAL: o que já foi feito para a data do check-in (ex.:
  // concluído noutro device e já sincronizado) não é perguntado de novo. Antes,
  // tudo aparecia desmarcado mesmo feito fora (bug 2026-08-30).
  const outstanding = tasks.filter((t) =>
    t.type === 'recorrente' ? !t.history.includes(pend.date) : !t.done,
  )
  if (outstanding.length === 0) {
    // tudo já está feito → nem abre a janela; assenta o dia sem dano
    settleAllDone()
    return
  }

  const items = outstanding
    .map(
      (task) => `
      <label class="checkin-item">
        <input type="checkbox" class="checkin-check" data-checkin-id="${escapeHtml(task.id)}" />
        <span class="checkin-info">
          <span class="checkin-title">${escapeHtml(task.title)}</span>
          <span class="checkin-meta">${task.type === 'unica' ? t('type.oneoff') : t('type.recurring')} · ${difficultyMeta(task.difficulty).label} · +${xpFor(task.difficulty)} XP</span>
        </span>
      </label>`,
    )
    .join('')

  openModal(`
    <h2 class="checkin-title-modal">${t('checkin.yesterday')}</h2>
    <p class="checkin-sub">${t('checkin.sub', {date: formatLongDate(pend.date)})}</p>
    <div class="checkin-list">${items}</div>
    <div class="form-actions">
      <button class="btn btn-primary" data-checkin-confirm>${t('checkin.button')}</button>
    </div>
  `)

  const mark = (): string[] =>
    Array.from(getModalBody().querySelectorAll<HTMLInputElement>('.checkin-check:checked')).map((i) => i.dataset.checkinId ?? '').filter(Boolean)

  getModalBody().querySelector<HTMLButtonElement>('[data-checkin-confirm]')?.addEventListener('click', () => {
    const ids = mark()
    closeModal()
    finishCheckin(ids)
  })
}

function getModalBody(): HTMLElement {
  return document.getElementById('modal-body')!
}
