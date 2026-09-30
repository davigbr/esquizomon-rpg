/** Diary view — timeline of days (newest first). EVERYTHING is a NOTE: several
 *  per day, each with an optional title, capture hour, city and date. Capture
 *  field at the top saves a note with Enter/Done; tapping a note opens an edit
 *  sheet (title + city + text). Unification 2026-09-28: the old "chronicle"
 *  (1/day modal) is gone — all records are notes with optional titles. */

import type { AppData, DiaryNote } from '../../core/tipos'
import { addDays, formatLongDate, todayISO } from '../../core/jogo'
import { appStore, deleteNote, importNotes, saveNote, setNoteCidade } from '../../stores/app'
import { closeModal, confirm, modalBody, openModal } from '../modal'
import { notify } from '../toast'
import { escapeHtml } from '../util'
import { t } from '../../i18n'
import { parseDiaryMarkdown } from '../importDiario'
import { renderMarkdown } from '../editorMd'
import { aiEnabled, suggestChronicleTitle } from '../../ia/titulo'
import { getCity } from '../../core/localizacao'

interface DayGroup {
  date: string
  notes: DiaryNote[]
}

function groupDays(data: AppData): DayGroup[] {
  const byDate = new Map<string, DayGroup>()
  for (const n of data.notes ?? []) {
    const g = byDate.get(n.date) ?? { date: n.date, notes: [] }
    g.notes.push(n)
    byDate.set(n.date, g)
  }
  // HOJE sempre aparece (mesmo vazio): ponto de aterrissagem das notas capturadas.
  if (!byDate.has(todayISO())) byDate.set(todayISO(), { date: todayISO(), notes: [] })
  const groups = [...byDate.values()]
  for (const g of groups) g.notes.sort((a, b) => b.time.localeCompare(a.time) || b.createdAt.localeCompare(a.createdAt))
  return groups.sort((a, b) => b.date.localeCompare(a.date))
}

/** Day label: Hoje / Ontem / short date. */
function dayLabel(date: string): string {
  const today = todayISO()
  if (date === today) return t('diary.today')
  if (date === addDays(today, -1)) return t('diary.yesterday')
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
}

export function mountDiary(root: HTMLElement, data: AppData): void {
  const groups = groupDays(data)

  root.innerHTML = `
    <header class="view-header">
      <h1>${t('diary.title')}</h1>
      <div class="view-header-actions">
        <span class="diary-jump-v" title="${t('diary.jumpTo')}">
          <input class="diary-jump" data-dayry-jump type="date" aria-label="${t('diary.jumpTo')}" max="${escapeHtml(todayISO())}" />
        </span>
        <button class="btn btn-icon diary-import" data-dayry-import title="${t('diary.importTitle')}" aria-label="${t('diary.importTitle')}">
          <i class="fa-solid fa-file-import" aria-hidden="true"></i>
        </button>
      </div>
    </header>

    <form class="diary-capture" data-note-capture autocomplete="off">
      <input class="diary-capture-input" data-note-input type="text"
        placeholder="${t('diary.capturePlaceholder')}" enterkeyhint="done" maxlength="500"
        aria-label="${t('diary.capturePlaceholder')}" />
      <button class="btn btn-icon diary-capture-btn" type="submit" title="${t('diary.saveNote')}" aria-label="${t('diary.saveNote')}">
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
      </button>
    </form>

    <div class="diary-timeline">
      ${groups.map((g) => dayHtml(g)).join('')}
    </div>
  `

  installCapture(root)
  installNotes(root)
  installImport(root)
  // Pulo rápido para datas antigas (só desktop): seleciona a data e rola até o
  // grupo daquele dia; se o dia não tem nota, avisa (timeline não renderiza dia vazio).
  root.querySelector('[data-dayry-jump]')?.addEventListener('change', (ev) => {
    const v = ((ev.currentTarget as HTMLInputElement).value || '').trim()
    if (!v) return
    // limpa o destaque anterior e marca o dia visitado
    root.querySelectorAll('.timeline-day.is-active').forEach((d) => d.classList.remove('is-active'))
    const el = root.querySelector(`.timeline-day[data-day="${v}"]`) as HTMLElement | null
    if (el) {
      el.classList.add('is-active')
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      notify(t('diary.noNotesOnDate'))
    }
    ;(ev.currentTarget as HTMLInputElement).value = ''
  })
}

function dayHtml(g: DayGroup): string {
  return `
    <section class="timeline-day" data-day="${escapeHtml(g.date)}">
      <header class="timeline-day-head">
        <div class="timeline-day-label">
          <h2>${dayLabel(g.date)}</h2>
          <span class="timeline-day-sub">${formatLongDate(g.date)}</span>
        </div>
      </header>
      <div class="timeline-notes">
        ${g.notes.map((n) => noteHtml(n)).join('')}
      </div>
    </section>
  `
}

function noteHtml(n: DiaryNote): string {
  return `
    <article class="note-card" data-note="${escapeHtml(n.id)}" data-note-date="${escapeHtml(n.date)}" role="button" tabindex="0">
      <time class="note-time">${escapeHtml(n.time)}</time>
      <div class="note-body">
        ${n.title ? `<p class="note-title">${escapeHtml(n.title)}</p>` : ''}
        <div class="note-rendered">${renderMarkdown(n.text)}</div>
        ${cidadeHtml(n.cidade)}
      </div>
    </article>
  `
}

/** Small city label (geolocation) — empty string when there's no city. */
function cidadeHtml(cidade?: string): string {
  return cidade
    ? `<span class="note-cidade" title="${t('diary.cityLabel')}"><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${escapeHtml(cidade)}</span>`
    : ''
}

/** Pre-fills the city field of a NEW note right when its editor opens: if the
 *  note has no cidade yet, ask geolocation and fill the field (and persist).
 *  Never overwrites what the user already typed. */
async function preSelecionaCidade(
  note: { id?: string; cidade?: string },
  inputEl: HTMLInputElement | null,
): Promise<void> {
  if (!inputEl || note.cidade) return
  const cidade = await getCity()
  if (!cidade) return
  if (inputEl.value.trim()) return // usuário já digitou — não sobrescreve
  inputEl.value = cidade
  if (note.id) setNoteCidade(note.id, cidade)
}

/** Capture: Enter/Done or + saves a TODAY note and keeps the field focused for
 *  rapid multi-note entry. The input is BLURRED before the save so the global
 *  re-render wrapper does NOT restore the typed text; the fresh input is then
 *  cleared and re-focused (same gesture — the mobile keyboard stays). */
function installCapture(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('[data-note-capture]')
  if (!form) return
  form.addEventListener('submit', (ev) => {
    ev.preventDefault()
    const input = root.querySelector<HTMLInputElement>('[data-note-input]')
    const text = input?.value.trim() ?? ''
    if (!text) return
    input?.blur()
    saveNote({ text, date: todayISO() })
    const fresh = root.querySelector<HTMLInputElement>('[data-note-input]')
    if (fresh) {
      fresh.value = ''
      fresh.focus()
    }
  })
}

/** Tap a note → edit sheet (modal). */
function installNotes(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-note]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.note ?? ''
      const note = appStore.get().notes?.find((n) => n.id === id)
      if (note) openNoteSheet(note)
    })
  })
}

function openNoteSheet(note: DiaryNote): void {
  const aiOn = aiEnabled(appStore.get().settings.ai)
  openModal(`
    <h2>${t('diary.editNote')}</h2>
    <div class="diary-meta-row">
      <label>${t('diary.noteDate')}<input class="diary-date" data-note-date-input type="date" value="${escapeHtml(note.date)}" aria-label="${t('diary.noteDate')}" /></label>
      <label>${t('diary.noteTime')}<input class="diary-date" data-note-time-input type="time" value="${escapeHtml(note.time)}" aria-label="${t('diary.noteTime')}" /></label>
    </div>
    <div class="form-group">
      <label for="diary-note-title">${t('diary.noteTitle')}</label>
      <div class="diary-title-row">
        <input id="diary-note-title" class="diary-title" data-note-title type="text"
          value="${escapeHtml(note.title ?? '')}" placeholder="${t('diary.noteTitlePlaceholder')}" maxlength="120"
          autocomplete="off" autocapitalize="words" spellcheck="true" enterkeyhint="done"
          aria-label="${t('diary.noteTitle')}" />
        ${aiOn ? `<button class="btn btn-icon diary-title-ai" data-note-title-ai type="button" title="${t('diary.titleGenerate')}" aria-label="${t('diary.titleGenerate')}"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i></button>` : ''}
      </div>
    </div>
    <div class="form-group">
      <label for="diary-city-note">${t('diary.city')}</label>
      <input id="diary-city-note" class="diary-city-input" data-note-city type="text"
        value="${escapeHtml(note.cidade ?? '')}" placeholder="${t('diary.cityPlaceholder')}"
        maxlength="60" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done"
        aria-label="${t('diary.city')}" />
    </div>
    <textarea class="diary-sheet-textarea" data-note-edit rows="5" spellcheck="true"
      placeholder="${t('diary.capturePlaceholder')}" aria-label="${t('diary.editNote')}">${escapeHtml(note.text)}</textarea>
    <div class="form-actions">
      <button class="btn" data-note-delete>${t('diary.deleteNote')}</button>
      <span class="form-spacer"></span>
      <button class="btn" data-modal-cancel>${t('diary.cancel')}</button>
      <button class="btn btn-primary" data-note-save>${t('diary.saveNote')}</button>
    </div>
  `)
  // nota sem cidade → pré-preenche o campo com a localização atual
  void preSelecionaCidade({ id: note.id, cidade: note.cidade }, modalBody.querySelector<HTMLInputElement>('[data-note-city]'))

  const titleEl = modalBody.querySelector<HTMLInputElement>('[data-note-title]')
  // botão "gerar título com IA" (aparece apenas com BYOK): UMA palavra do texto
  modalBody.querySelector<HTMLButtonElement>('[data-note-title-ai]')?.addEventListener('click', () => {
    const btn = modalBody.querySelector<HTMLButtonElement>('[data-note-title-ai]')
    if (!btn || btn.disabled) return
    const draft = modalBody.querySelector<HTMLTextAreaElement>('[data-note-edit]')?.value.trim() ?? ''
    if (!draft) {
      notify(t('diary.needText'), 'erro')
      return
    }
    btn.disabled = true
    void (async () => {
      try {
        const word = await suggestChronicleTitle(draft)
        if (!word) {
          notify(t('diary.titleGenerateFail'), 'erro')
          return
        }
        if (titleEl) titleEl.value = word
        notify(t('diary.titleSuggested', { titulo: word }))
      } catch (err) {
        // o AiError (cliente) traz o motivo real em pt — mostre-o no lugar do genérico
        notify(err instanceof Error && err.message ? err.message : t('diary.titleGenerateFail'), 'erro')
      } finally {
        btn.disabled = false
      }
    })()
  })

  modalBody.querySelector('[data-note-save]')?.addEventListener('click', () => {
    const el = modalBody.querySelector<HTMLTextAreaElement>('[data-note-edit]')
    const text = el?.value ?? ''
    if (!text.trim()) {
      notify(t('diary.noteEmpty'), 'erro')
      return
    }
    const title = modalBody.querySelector<HTMLInputElement>('[data-note-title]')?.value
    const cityEl = modalBody.querySelector<HTMLInputElement>('[data-note-city]')
    const dateEl = modalBody.querySelector<HTMLInputElement>('[data-note-date-input]')
    const timeEl = modalBody.querySelector<HTMLInputElement>('[data-note-time-input]')
    saveNote({
      id: note.id,
      text,
      title,
      date: dateEl?.value || undefined,
      time: timeEl?.value || undefined,
    })
    setNoteCidade(note.id, cityEl?.value)
    closeModal()
  })
  modalBody.querySelector('[data-note-delete]')?.addEventListener('click', () => {
    void confirm(t('diary.deleteNoteMsg'), t('diary.deleteNote')).then((ok) => {
      if (!ok) return
      deleteNote(note.id)
      closeModal()
      notify(t('diary.noteDeleted'))
    })
  })
  modalBody.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal)
}

/** Chronicle: the day-head button / card opens the markdown editor (modal). */
/** Bulk import: .md file or pasted text with `## AAAA-MM-DD` — each day becomes a NOTE (2026-09-28 unification). */
function installImport(root: HTMLElement): void {
  root.querySelector('[data-dayry-import]')?.addEventListener('click', () => {
    openModal(`
      <h2>${t('diary.importModalTitle')}</h2>
      <p class="settings-hint">${t('diary.importHint')}</p>
      <div class="form-group">
        <label>${t('diary.chooseFile')}</label>
        <input type="file" class="filter-input" accept=".md,.markdown,.txt" data-import-file />
      </div>
      <div class="form-group">
        <textarea class="filter-textarea" data-import-text rows="12" spellcheck="false"
          placeholder="${t('diary.importPlaceholder')}"></textarea>
      </div>
      <p class="settings-hint" data-import-status></p>
      <div class="form-actions">
        <button class="btn" data-modal-cancel>${t('diary.cancel')}</button>
        <button class="btn btn-primary" data-import-run>${t('diary.importButton')}</button>
      </div>
    `)
    const fileEl = modalBody.querySelector<HTMLInputElement>('[data-import-file]')
    const textEl = modalBody.querySelector<HTMLTextAreaElement>('[data-import-text]')
    const statusEl = modalBody.querySelector<HTMLElement>('[data-import-status]')
    fileEl?.addEventListener('change', () => {
      const file = fileEl.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        if (textEl && typeof reader.result === 'string') {
          textEl.value = reader.result
          if (statusEl) statusEl.textContent = t('diary.fileLoaded', { name: file.name })
        }
      }
      reader.readAsText(file, 'utf-8')
    })
    modalBody.querySelector('[data-import-run]')?.addEventListener('click', () => {
      const entries = parseDiaryMarkdown(textEl?.value ?? '')
      if (entries.length === 0) {
        if (statusEl) statusEl.textContent = t('diary.noneFound')
        return
      }
      const res = importNotes(entries)
      let msg = t('diary.importedCount', { n: res.imported })
      if (res.skipped.length > 0) msg += ' ' + t('diary.skippedCount', { n: res.skipped.length, lista: res.skipped.join(', ') }) + '.'
      if (res.invalid.length > 0) msg += ' ' + t('diary.invalidCount', { n: res.invalid.length }) + '.'
      closeModal()
      notify(msg)
    })
    modalBody.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal)
  })
}