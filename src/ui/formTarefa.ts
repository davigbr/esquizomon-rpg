/** Task create/edit modal — shared across views.
 *  `initialType` pre-selects the type (used by the "+" buttons of each column). */

import type { Agenda, Difficulty, Task, TaskType } from '../core/tipos'
import { WEEKDAYS, difficultyMeta } from '../core/jogo'
import { appStore, updateTask, createTask, tagsInUse } from '../stores/app'
import { openModal } from './modal'
import { notify } from './toast'
import { escapeHtml as escape } from './util'
import { t } from '../i18n'

const TASK_TYPES: ReadonlyArray<{ id: TaskType }> = [
  { id: 'recorrente' },
  { id: 'unica' },
  { id: 'habito' },
]
/** Labels/descriptions of the task types (resolved at render so they follow the language). */
const taskTypeInfo = (id: TaskType): { name: string; desc: string } => {
  switch (id) {
    case 'unica': return { name: t('form.tipoUnica'), desc: t('form.tipoUnicaDesc') }
    case 'habito': return { name: t('form.tipoHabito'), desc: t('form.tipoHabitoDesc') }
    default: return { name: t('form.tipoRecorrente'), desc: t('form.tipoRecorrenteDesc') }
  }
}

function initialAgenda(t?: Task): { days: number[]; daysOfMonth?: number[] } {
  return {
    days: t?.agenda?.days ?? [],
    daysOfMonth: t?.agenda?.daysOfMonth,
  }
}

export function openTaskForm(task?: Task, initialType?: TaskType): void {
  const type: TaskType = task?.type ?? initialType ?? 'recorrente'
  const difficulty: Difficulty = task?.difficulty ?? 'facil'
  const tags = tagsInUse(appStore.get())
  const currentTags = task?.tags ?? []
  const agenda = initialAgenda(task)
  const repeat: 'todos' | 'semana' | 'mes' = !task
    ? 'semana'
    : agenda.daysOfMonth && agenda.daysOfMonth.length > 0
      ? 'mes'
      : agenda.days.length > 0
        ? 'semana'
        : 'todos'

  openModal(`
    <h2>${task ? t('form.editarTarefa') : t('form.novaTarefa')}</h2>
    <form data-task-form>
      <div class="form-group">
        <label>${t('form.oQueEh')} <span class="required">*</span></label>
        <input class="field" name="title" value="${escape(task?.title ?? '')}" placeholder="${t('form.exTitulo')}" autofocus required />
      </div>

      <div class="form-group">
        <label>${t('form.tipoTarefa')}</label>
        <div class="options-type" data-type-options>
          ${TASK_TYPES.map(
            (tp) => `
            <div class="option-type${tp.id === type ? ' selected' : ''}" data-type="${tp.id}" role="button" tabindex="0">
              <strong>${taskTypeInfo(tp.id).name}</strong>
              <span>${taskTypeInfo(tp.id).desc}</span>
            </div>`,
          ).join('')}
        </div>
        <input type="hidden" name="type" value="${type}" />
      </div>

      <div class="form-group">
        <label>${t('form.dificuldade')}</label>
        <select class="field" name="difficulty">
          ${DIFFICULTY_OPTIONS(difficulty)}
        </select>
        <small>${t('form.dificuldadeHint')}</small>
      </div>

      <div class="form-group" data-field-agenda>
        <label>${t('form.repeticao')}</label>
        <select class="field" name="repeat" data-repeat-select>
          <option value="todos" ${repeat === 'todos' ? 'selected' : ''}>${t('form.todosDias')}</option>
          <option value="semana" ${repeat === 'semana' ? 'selected' : ''}>${t('form.diasSemana')}</option>
          <option value="mes" ${repeat === 'mes' ? 'selected' : ''}>${t('form.diasMes')}</option>
        </select>
        <div class="chips" data-days-chips ${repeat === 'semana' ? '' : 'hidden'}>
          ${WEEKDAYS.map((d, i) => {
            const active = agenda.days.includes(i)
            return `<button type="button" class="chip${active ? ' active' : ''}" data-day="${i}">${d}</button>`
          }).join('')}
        </div>
        <input class="field" name="days-month" data-days-month placeholder="${t('form.exDiasMes')}" value="${escape((agenda.daysOfMonth ?? []).join(', '))}" ${repeat === 'mes' ? '' : 'hidden'} />
        <small data-agenda-dica>${repeat === 'mes' ? t('form.diasMesDica') : t('form.semDiaDica')}</small>
      </div>

      <div class="form-group" data-field-sign hidden>
        <label>${t('form.sinalHabito')}</label>
        <select class="field" name="sign">
          <option value="positivo" ${task?.sign === 'positivo' || !task?.sign ? 'selected' : ''}>${t('tipo.positivo')}</option>
          <option value="negativo" ${task?.sign === 'negativo' ? 'selected' : ''}>${t('tipo.negativo')}</option>
          <option value="ambos" ${task?.sign === 'ambos' ? 'selected' : ''}>${t('tipo.ambos')}</option>
        </select>
      </div>

      <div class="form-group" data-field-due hidden>
        <label>${t('form.venceEm')}</label>
        <input type="date" class="field" name="due-date" value="${escape(task?.dueDate ?? '')}" />
        <small>${t('form.dataDica')}</small>
      </div>

      <div class="form-group">
        <label>${t('form.tags')}</label>
        <div class="tag-list" data-tags-chips>
          ${tags.map((t) => `<button type="button" class="tag-row${currentTags.includes(t) ? ' active' : ''}" data-tag="${escape(t)}"><span class="tag-row-check">✓</span><span class="tag-row-name">#${escape(t)}</span></button>`).join('')}
          ${currentTags.filter((t) => !tags.includes(t)).map((t) => `<button type="button" class="tag-row active" data-tag="${escape(t)}"><span class="tag-row-check">✓</span><span class="tag-row-name">#${escape(t)}</span></button>`).join('')}
        </div>
        <div class="tag-input">
          <input class="field" name="new-tag" placeholder="${t('form.novaTagPlaceholder')}" list="tags-sugeridas" />
          <datalist id="tags-sugeridas">${tags.map((t) => `<option value="${escape(t)}"></option>`).join('')}</datalist>
          <button type="button" class="btn" data-add-tag>+</button>
        </div>
        <small>${t('form.tagsDica')}</small>
      </div>

      <div class="form-group">
        <label>${t('form.notas')}</label>
        <textarea class="field" name="notes" placeholder="${t('form.notasPlaceholder')}">${escape(task?.notes ?? '')}</textarea>
        <small>${t('form.markdownDica')}</small>
      </div>

      <div class="form-actions">
        <button type="button" class="btn" data-cancel>${t('comum.cancelar')}</button>
        <button type="submit" class="btn btn-primary">${task ? t('form.salvar') : t('form.criar')}</button>
      </div>
    </form>
  `)

  const form = document.querySelector('[data-task-form]') as HTMLFormElement
  const options = form.querySelectorAll('[data-type]')
  const agendaField = form.querySelector('[data-field-agenda]') as HTMLElement
  const signField = form.querySelector('[data-field-sign]') as HTMLElement
  const dueField = form.querySelector('[data-field-due]') as HTMLElement
  const typeInput = form.querySelector<HTMLInputElement>('input[name="type"]')!
  const repeatSelect = form.querySelector<HTMLSelectElement>('[data-repeat-select]')!
  const dayChips = form.querySelector('[data-days-chips]') as HTMLElement
  const monthDays = form.querySelector<HTMLInputElement>('[data-days-month]')!
  const agendaHint = form.querySelector<HTMLElement>('[data-agenda-dica]')!

  function applyType(t: TaskType): void {
    options.forEach((o) => o.classList.toggle('selected' , o.getAttribute('data-type') === t))
    typeInput.value = t
    agendaField.hidden = t !== 'recorrente'
    signField.hidden = t !== 'habito'
    dueField.hidden = t !== 'unica'
  }
  applyType(typeInput.value as TaskType)
  options.forEach((o) => {
    o.addEventListener('click', () => applyType(o.getAttribute('data-type') as TaskType))
    o.addEventListener('keydown', (e) => {
      const ev = e as KeyboardEvent
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault()
        applyType(o.getAttribute('data-type') as TaskType)
      }
    })
  })

  function applyRepeat(r: 'todos' | 'semana' | 'mes'): void {
    dayChips.hidden = r !== 'semana'
    monthDays.hidden = r !== 'mes'
    agendaHint.textContent = r === 'mes' ? t('form.diasMesDica') : t('form.semDiaDica')
  }
  repeatSelect.addEventListener('change', () => {
    applyRepeat(repeatSelect.value as 'todos' | 'semana' | 'mes')
  })

  const tagsChips = form.querySelector('[data-tags-chips]') as HTMLElement
  function selectedTags(): string[] {
    return [...tagsChips.querySelectorAll('.tag-row.active')].map((c) => c.getAttribute('data-tag')!)
  }
  function addTagChip(name: string): void {
    const clean = name.trim().replace(/^#/, '')
    if (!clean) return
    if (!tagsChips.querySelector(`[data-tag="${CSS.escape(clean)}"]`)) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'tag-row active' 
      b.dataset.tag = clean
      b.innerHTML = `<span class="tag-row-check">✓</span><span class="tag-row-name">#${escape(clean)}</span>`
      tagsChips.appendChild(b)
    }
  }
  tagsChips.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest('[data-tag]') as HTMLElement | null
    if (row) row.classList.toggle('active' )
  })
  const newTagInput = form.querySelector<HTMLInputElement>('input[name="new-tag"]')!
  form.querySelector('[data-add-tag]')!.addEventListener('click', () => {
    addTagChip(newTagInput.value)
    newTagInput.value = ''
    newTagInput.focus()
  })
  // Enter on the tag field adds the tag instead of submitting the task
  newTagInput.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent
    if (ev.key === 'Enter') {
      ev.preventDefault()
      addTagChip(newTagInput.value)
      newTagInput.value = ''
    }
  })

  dayChips.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest('[data-day]') as HTMLElement | null
    if (chip) chip.classList.toggle('active' )
  })

  form.querySelector('[data-cancel]')!.addEventListener('click', () => {
    document.getElementById('modal-close')?.click()
  })

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const title = (form.querySelector<HTMLInputElement>('input[name="title"]')!.value ?? '').trim()
    if (!title) {
      notify(t('form.darNome'), 'erro')
      return
    }
    const currentType = typeInput.value as TaskType
    const difficulty = (form.querySelector<HTMLSelectElement>('select[name="difficulty"]')!.value ?? 'facil') as Difficulty
    const notes = (form.querySelector<HTMLTextAreaElement>('textarea[name="notes"]')!.value ?? '').trim()
    const tags = selectedTags()
    const dueDate = currentType === 'unica'
      ? (form.querySelector<HTMLInputElement>('input[name="due-date"]')!.value || undefined)
      : undefined
    let agenda: Agenda | undefined
    if (currentType === 'recorrente') {
      const r = repeatSelect.value as 'todos' | 'semana' | 'mes'
      if (r === 'mes') {
        const daysOfMonth = monthDays.value
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31)
        agenda = { days: [], daysOfMonth: [...new Set(daysOfMonth)].sort((a, b) => a - b) }
      } else if (r === 'semana') {
        const days = [...dayChips.querySelectorAll('.chip.active')].map((c) => Number(c.getAttribute('data-day')))
        agenda = { days }
      } else {
        agenda = { days: [] }
      }
    }
    const sign =
      currentType === 'habito'
        ? ((form.querySelector<HTMLSelectElement>('select[name="sign"]')!.value ?? 'positivo') as Task['sign'])
        : undefined

    const result = task
      ? updateTask(task.id, { title, type: currentType, difficulty, tags, notes, dueDate, agenda, sign })
      : createTask({ title, type: currentType, difficulty, tags, notes, dueDate, agenda, sign })
    if (!result.ok) {
      notify(result.reason ?? t('form.naoSalvar'), 'erro')
      return
    }
    document.getElementById('modal-close')?.click()
    notify(task ? t('form.atualizada') : t('form.criada'))
  })
}

function DIFFICULTY_OPTIONS(current: Difficulty): string {
  const order: Difficulty[] = ['facil', 'media', 'dificil', 'extrema']
  return order
    .map((id) => {
      const d = difficultyMeta(id)
      return `<option value="${id}" ${id === current ? 'selected' : ''}>${d.label} (×${d.multiplier})</option>`
    })
    .join('')
}
