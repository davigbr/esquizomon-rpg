/** Diary view — timeline of days (newest first): quick notes (several per
 *  day) + the daily chronicle. Capture field at the top saves a note with
 *  Enter/Done; tapping a note opens an edit sheet; the chronicle opens a full
 *  markdown editor (modal). Stateless — no focus/caret guard machinery needed
 *  (the route re-render is handled globally by renderKeepingFocus; modals live
 *  outside the route and survive it). */

import type { AppData, DiaryEntry, DiaryNote } from '../../core/tipos'
import { addDays, formatLongDate, todayISO } from '../../core/jogo'
import { appStore, deleteEntry, deleteNote, importDiary, saveEntry, saveNote } from '../../stores/app'
import { closeModal, confirm, modalBody, openModal } from '../modal'
import { notify } from '../toast'
import { escapeHtml } from '../util'
import { renderMarkdown } from '../editorMd'
import { t } from '../../i18n'
import { parseDiaryMarkdown } from '../importDiario'

/** Autosave debounce of the chronicle editor (modal). */
const AUTOSAVE_MS = 800

interface DayGroup {
  date: string
  notes: DiaryNote[]
  chronicle?: DiaryEntry
}

function groupDays(data: AppData): DayGroup[] {
  const byDate = new Map<string, DayGroup>()
  for (const n of data.notes ?? []) {
    const g = byDate.get(n.date) ?? { date: n.date, notes: [] }
    g.notes.push(n)
    byDate.set(n.date, g)
  }
  for (const e of data.diary ?? []) {
    const g = byDate.get(e.date) ?? { date: e.date, notes: [] }
    g.chronicle = e
    byDate.set(e.date, g)
  }
  // HOJE sempre aparece (mesmo vazio): dá o botão de crônica e o ponto de
  // aterrissagem das notas capturadas — o diário nunca abre "morto".
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

function chronicleSnippet(text: string): string {
  const flat = text.split('\n').map((s) => s.trim()).filter(Boolean).join(' ')
  return flat.length > 150 ? flat.slice(0, 150) + '…' : flat
}

export function mountDiary(root: HTMLElement, data: AppData): void {
  const groups = groupDays(data)

  root.innerHTML = `
    <header class="view-header">
      <h1>${t('diary.title')}</h1>
      <div class="view-header-actions">
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
  installChronicles(root)
  installImport(root)
}

function dayHtml(g: DayGroup): string {
  const chronicleBtn = g.chronicle ? t('diary.viewChronicle') : t('diary.writeChronicle')
  const chronicleCard = g.chronicle
    ? `
      <article class="note-card note-card--cronica" data-dayry-cronica-card="${escapeHtml(g.date)}" role="button" tabindex="0">
        <header class="note-cronica-label"><i class="fa-solid fa-scroll" aria-hidden="true"></i>${t('diary.chronicle')}${g.chronicle.title ? ` — ${escapeHtml(g.chronicle.title)}` : ''}</header>
        ${g.chronicle.text.trim() ? `<p class="note-cronica-snippet">${escapeHtml(chronicleSnippet(g.chronicle.text))}</p>` : `<p class="note-cronica-snippet note-cronica-snippet--vazio">${t('diary.chronicleEmpty')}</p>`}
      </article>`
    : ''

  return `
    <section class="timeline-day" data-day="${escapeHtml(g.date)}">
      <header class="timeline-day-head">
        <div class="timeline-day-label">
          <h2>${dayLabel(g.date)}</h2>
          <span class="timeline-day-sub">${formatLongDate(g.date)}</span>
        </div>
        <button class="btn btn-pequeno" data-dayry-cronica="${escapeHtml(g.date)}">${chronicleBtn}</button>
      </header>
      ${chronicleCard}
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
      <p class="note-text">${escapeHtml(n.text)}</p>
    </article>
  `
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
  openModal(`
    <h2>${t('diary.editNote')}</h2>
    <p class="diary-sheet-meta">${escapeHtml(note.time)} · ${escapeHtml(formatLongDate(note.date))}</p>
    <textarea class="diary-sheet-textarea" data-note-edit rows="5" spellcheck="true"
      placeholder="${t('diary.capturePlaceholder')}" aria-label="${t('diary.editNote')}">${escapeHtml(note.text)}</textarea>
    <div class="form-actions">
      <button class="btn" data-note-delete>${t('diary.deleteNote')}</button>
      <span class="form-spacer"></span>
      <button class="btn" data-modal-cancel>${t('diary.cancel')}</button>
      <button class="btn btn-primary" data-note-save>${t('diary.saveNote')}</button>
    </div>
  `)
  modalBody.querySelector('[data-note-save]')?.addEventListener('click', () => {
    const el = modalBody.querySelector<HTMLTextAreaElement>('[data-note-edit]')
    const text = el?.value ?? ''
    if (!text.trim()) {
      notify(t('diary.noteEmpty'), 'erro')
      return
    }
    saveNote({ id: note.id, text })
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
function installChronicles(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-dayry-cronica]').forEach((btn) => {
    btn.addEventListener('click', () => openChronicle(btn.dataset.dayryCronica ?? ''))
  })
  root.querySelectorAll<HTMLElement>('[data-dayry-cronica-card]').forEach((card) => {
    card.addEventListener('click', () => openChronicle(card.dataset.dayryCronicaCard ?? ''))
    card.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault()
        openChronicle(card.dataset.dayryCronicaCard ?? '')
      }
    })
  })
}

function openChronicle(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return
  const entry = appStore.get().diary?.find((e) => e.date === date)
  const title = entry?.title ?? ''
  const text = entry?.text ?? ''

  openModal(`
    <h2>${t('diary.chronicle')} — ${escapeHtml(formatLongDate(date))}</h2>
    <div class="diary-chronicle">
      <input class="diary-title" data-dayry-title type="text" placeholder="${t('diary.chronicleTitle')}" maxlength="120"
        value="${escapeHtml(title)}" autocomplete="off" aria-label="${t('diary.chronicleTitle')}" />
      <div class="diary-editor-actions">
        <button class="btn btn-pequeno" data-dayry-toggle title="${t('diary.toggle')}">${t('diary.view')}</button>
        <span class="diary-status" data-cronica-status></span>
      </div>
      <div class="diary-editor-area diary-editor-area--modal">
        <textarea class="diary-textarea" data-dayry-editor placeholder="${t('diary.textareaPlaceholder')}"
          spellcheck="true" aria-label="${t('diary.markdownLabel')}">${escapeHtml(text)}</textarea>
        <div class="diary-preview" data-dayry-preview hidden></div>
      </div>
      <p class="settings-hint diary-hint">Markdown: <code>## título</code> · <code>- lista</code> · <code>**negrito**</code> · <code>*itálico*</code></p>
    </div>
    <div class="form-actions">
      ${entry ? `<button class="btn" data-dayry-delete>${t('diary.deleteTitle')}</button>` : ''}
      <span class="form-spacer"></span>
      <button class="btn" data-modal-cancel>${t('diary.cancel')}</button>
      <button class="btn btn-primary" data-dayry-save>${t('diary.saveChronicle')}</button>
    </div>
  `)

  const areaEl = modalBody.querySelector<HTMLTextAreaElement>('[data-dayry-editor]')
  const titleEl = modalBody.querySelector<HTMLInputElement>('[data-dayry-title]')
  const previewEl = modalBody.querySelector<HTMLElement>('[data-dayry-preview]')
  const statusEl = modalBody.querySelector<HTMLElement>('[data-cronica-status]')
  let isPreview = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const horaLocal = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).slice(0, 5)

  if (entry?.updatedAt) {
    const hora = new Date(entry.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).slice(0, 5)
    if (statusEl) statusEl.textContent = t('diary.saved', { hora })
  }

  function saveNow(): void {
    if (!areaEl || !titleEl) return
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    const current = appStore.get().diary?.find((e) => e.date === date)
    if (areaEl.value === (current?.text ?? '') && titleEl.value === (current?.title ?? '')) return
    if (areaEl.value.trim() || titleEl.value.trim()) {
      saveEntry(date, { title: titleEl.value, text: areaEl.value })
      if (statusEl) statusEl.textContent = t('diary.saved', { hora: horaLocal() })
    }
  }

  modalBody.querySelector('[data-dayry-toggle]')?.addEventListener('click', () => {
    isPreview = !isPreview
    if (areaEl && previewEl) {
      previewEl.innerHTML = renderMarkdown(areaEl.value)
      previewEl.hidden = !isPreview
      areaEl.hidden = isPreview
      const btn = modalBody.querySelector<HTMLButtonElement>('[data-dayry-toggle]')
      if (btn) btn.textContent = isPreview ? t('diary.edit') : t('diary.view')
    }
  })
  areaEl?.addEventListener('input', () => {
    if (statusEl) statusEl.textContent = t('diary.saving')
    if (timer) clearTimeout(timer)
    timer = setTimeout(saveNow, AUTOSAVE_MS)
  })
  titleEl?.addEventListener('input', () => {
    if (statusEl) statusEl.textContent = t('diary.saving')
    if (timer) clearTimeout(timer)
    timer = setTimeout(saveNow, AUTOSAVE_MS)
  })
  modalBody.querySelector('[data-dayry-save]')?.addEventListener('click', () => {
    saveNow()
    closeModal()
  })
  modalBody.querySelector('[data-dayry-delete]')?.addEventListener('click', () => {
    void confirm(t('diary.deleteMsg'), t('diary.delete')).then((ok) => {
      if (!ok) return
      deleteEntry(entry!.id)
      closeModal()
      notify(t('diary.deleted'))
    })
  })
  modalBody.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal)
}

/** Bulk import: .md file or pasted text with `## AAAA-MM-DD` (chronicles). */
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
      const res = importDiary(entries)
      let msg = t('diary.importedCount', { n: res.imported })
      if (res.skipped.length > 0) msg += ' ' + t('diary.skippedCount', { n: res.skipped.length, lista: res.skipped.join(', ') }) + '.'
      if (res.invalid.length > 0) msg += ' ' + t('diary.invalidCount', { n: res.invalid.length }) + '.'
      closeModal()
      notify(msg)
    })
    modalBody.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal)
  })
}