/** Diary view — timeline of days (newest first): quick notes (several per
 *  day) + the daily chronicle. Capture field at the top saves a note with
 *  Enter/Done; tapping a note opens an edit sheet; the chronicle opens a full
 *  markdown editor (modal). Stateless — no focus/caret guard machinery needed
 *  (the route re-render is handled globally by renderKeepingFocus; modals live
 *  outside the route and survive it). */

import type { AppData, DiaryEntry, DiaryNote } from '../../core/tipos'
import { addDays, formatLongDate, todayISO } from '../../core/jogo'
import { appStore, deleteEntry, deleteNote, importDiary, saveEntry, saveNote, setEntryCidade, setNoteCidade } from '../../stores/app'
import { closeModal, confirm, modalBody, openModal } from '../modal'
import { notify } from '../toast'
import { escapeHtml } from '../util'
import { renderMarkdown } from '../editorMd'
import { t } from '../../i18n'
import { parseDiaryMarkdown } from '../importDiario'
import { aiEnabled, suggestChronicleTitle } from '../../ia/titulo'
import { getCity } from '../../core/localizacao'

/** Autosave debounce of the chronicle editor (modal). */
const AUTOSAVE_MS = 800

/** Dates whose chronicle title is being suggested (avoid parallel calls). */
const pendingTitles = new Set<string>()

/** Dates whose chronicle title was set automatically (AI one-word or date
 *  fallback) — focusing the title field then selects all, so retyping
 *  REPLACES instead of concatenating over the auto-title. */
const autoTitled = new Set<string>()

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
        <header class="note-cronica-label"><i class="fa-solid fa-scroll" aria-hidden="true"></i>${t('diary.chronicle')}${g.chronicle.title ? ` — ${escapeHtml(g.chronicle.title)}` : ''}${cidadeHtml(g.chronicle.cidade)}</header>
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
      <div class="note-body">
        <p class="note-text">${escapeHtml(n.text)}</p>
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

/** Pre-fills the city field of a NEW record (nota/crônica) right when its
 *  editor opens: if the record has no cidade yet, ask geolocation and fill the
 *  field (and persist). Never overwrites what the user already typed. */
async function preSelecionaCidade(
  record: { id?: string; date?: string; cidade?: string },
  inputEl: HTMLInputElement | null,
  kind: 'nota' | 'cronica',
): Promise<void> {
  if (!inputEl || record.cidade) return
  const cidade = await getCity()
  if (!cidade) return
  if (inputEl.value.trim()) return // usuário já digitou — não sobrescreve
  inputEl.value = cidade
  if (kind === 'nota' && record.id) setNoteCidade(record.id, cidade)
  else if (kind === 'cronica' && record.date) setEntryCidade(record.date, cidade)
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
  // nota nova (sem cidade) → pré-preenche o campo com a localização atual
  void preSelecionaCidade(
    { id: note.id, cidade: note.cidade },
    modalBody.querySelector<HTMLInputElement>('[data-note-city]'),
    'nota',
  )
  modalBody.querySelector('[data-note-save]')?.addEventListener('click', () => {
    const el = modalBody.querySelector<HTMLTextAreaElement>('[data-note-edit]')
    const text = el?.value ?? ''
    if (!text.trim()) {
      notify(t('diary.noteEmpty'), 'erro')
      return
    }
    const cityEl = modalBody.querySelector<HTMLInputElement>('[data-note-city]')
    saveNote({ id: note.id, text })
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
  // o botão "gerar título com IA" aparece apenas com a IA (BYOK) ativada
  const aiOn = aiEnabled(appStore.get().settings.ai)

  openModal(`
    <h2>${t('diary.chronicle')} — ${escapeHtml(formatLongDate(date))}</h2>
    <div class="diary-chronicle">
      <div class="diary-title-row">
        <input class="diary-title" data-dayry-title type="text" placeholder="${t('diary.chronicleTitle')}" maxlength="120"
          value="${escapeHtml(title)}" autocomplete="off" aria-label="${t('diary.chronicleTitle')}" />
        ${aiOn ? `<button class="btn btn-icon diary-title-ai" data-dayry-title-ai type="button" title="${t('diary.titleGenerate')}" aria-label="${t('diary.titleGenerate')}"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i></button>` : ''}
      </div>
      <input class="diary-city-input" data-dayry-city type="text" value="${escapeHtml(entry?.cidade ?? '')}"
        placeholder="${t('diary.cityPlaceholder')}" maxlength="60" autocomplete="off" autocapitalize="words"
        spellcheck="false" enterkeyhint="done" aria-label="${t('diary.city')}" />
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
  const cityEl = modalBody.querySelector<HTMLInputElement>('[data-dayry-city]')
  // crônica nova (sem cidade) → pré-preenche o campo com a localização atual
  if (cityEl && !entry?.cidade) void preSelecionaCidade({ date, cidade: undefined }, cityEl, 'cronica')
  const previewEl = modalBody.querySelector<HTMLElement>('[data-dayry-preview]')
  const statusEl = modalBody.querySelector<HTMLElement>('[data-cronica-status]')
  let isPreview = false
  let timer: ReturnType<typeof setTimeout> | null = null
  // a crônica foi excluída neste modal — um autosave pendente NÃO pode recriá-la
  let deleted = false
  const horaLocal = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).slice(0, 5)

  if (entry?.updatedAt) {
    const hora = new Date(entry.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).slice(0, 5)
    if (statusEl) statusEl.textContent = t('diary.saved', { hora })
  }

  function saveNow(): void {
    if (deleted || !areaEl || !titleEl) return
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    const current = appStore.get().diary?.find((e) => e.date === date)
    const currentTitle = current?.title ?? ''
    // título existente nunca é apagado por um input vazio (a IA/garantia de
    // data pode ter preenchido o título entre o autosave e o save do usuário)
    const titleToSave = titleEl.value ? titleEl.value : currentTitle
    const textChanged = areaEl.value !== (current?.text ?? '')
    const titleChanged = titleToSave !== currentTitle
    const cityToSave = cityEl?.value.trim() || undefined
    const cityChanged = (cityToSave ?? null) !== ((current?.cidade ?? undefined) ?? null)

    if (!textChanged && !titleChanged && !cityChanged) return
    if (textChanged || titleChanged) {
      if (areaEl.value.trim() || titleToSave.trim()) {
        saveEntry(date, { title: titleToSave, text: areaEl.value })
        if (statusEl) statusEl.textContent = t('diary.saved', { hora: horaLocal() })
        // sem título fornecido → sugere um (IA: 1 palavra; sem IA: a data)
        if (!titleEl.value.trim() && !currentTitle.trim() && areaEl.value.trim()) void ensureTitle()
      }
    }
    // cidade é metadado — salva à parte, sem tocar em XP/updatedAt
    if (cityChanged) setEntryCidade(date, cityToSave)
  }

  /** Titles an untitled chronicle — one word from the AI, or the date when the
   *  AI is off / fails. Runs on save; never overwrites a title the user typed
   *  (checked before AND after the async call). */
  async function ensureTitle(): Promise<void> {
    if (!titleEl) return
    if (pendingTitles.has(date)) return
    const entry = appStore.get().diary?.find((e) => e.date === date)
    if (!entry || entry.title.trim()) return
    if (titleEl.value.trim()) return // usuário digitou um título entretanto
    const text = entry.text.trim()
    if (!text) return
    pendingTitles.add(date)
    const word = await suggestChronicleTitle(text)
    pendingTitles.delete(date)
    const cur = appStore.get().diary?.find((e) => e.date === date)
    if (!cur || cur.title.trim()) return
    if (titleEl.value.trim()) return // digitou enquanto a IA pensava — prevalece
    const finalTitle = word ?? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
    saveEntry(date, { title: finalTitle, text: cur.text })
    autoTitled.add(date)
    titleEl.value = finalTitle
    if (document.activeElement === titleEl) titleEl.select()
    if (word) notify(t('diary.titleSuggested', { titulo: word }))
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
  // Título automático (data dd/mm/aaaa ou palavra única da IA): seleciona tudo
  // ao focar/tocar, para que digitar por cima SUBSTITUA (no iOS o cursor entra
  // no fim e retyping concatenaria "28/09/2026Meu título"). Bug 2026-09-28.
  // O openModal JÁ foca o título ao abrir (sem disparar 'focus' num 2º toque) —
  // então o gancho confiável é o pointerup, que ocorre após o caret ser colocado.
  if (titleEl) {
    const titleInput = titleEl
    const selectAllIfAutoTitle = () => {
      const v = titleInput.value.trim()
      if (!v || !(autoTitled.has(date) || /^\d{2}\/\d{2}\/\d{4}$/.test(v) || /^\S+$/.test(v))) return
      titleInput.select()
      // WebKit ainda está colocando o caret quando o pointerup dispara — salvo
      // a seleção no próximo frame, se o campo continuar focado (não atrapalha
      // edição posterior já iniciada).
      requestAnimationFrame(() =>
        setTimeout(() => {
          if (document.activeElement === titleInput) titleInput.select()
        }, 0),
      )
    }
    titleInput.addEventListener('focus', selectAllIfAutoTitle)
    titleInput.addEventListener('pointerup', selectAllIfAutoTitle)
    titleInput.addEventListener('touchend', selectAllIfAutoTitle)
  }

  // Botão "gerar título com IA": sugere UMA palavra do texto atual e preenche o
  // campo (e salva). Só é renderizado com a IA ativada (ver markup).
  modalBody.querySelector<HTMLButtonElement>('[data-dayry-title-ai]')?.addEventListener('click', () => {
    const btn = modalBody.querySelector<HTMLButtonElement>('[data-dayry-title-ai]')
    if (!btn || btn.disabled) return
    const draft = areaEl?.value.trim() ?? ''
    if (!draft) {
      notify(t('diary.needText'), 'erro')
      return
    }
    btn.disabled = true
    void suggestChronicleTitle(draft).then((word) => {
      btn.disabled = false
      if (!word) {
        notify(t('diary.titleGenerateFail'), 'erro')
        return
      }
      if (titleEl) {
        titleEl.value = word
        autoTitled.add(date)
        titleEl.select()
      }
      saveEntry(date, { title: word, text: draft })
      if (statusEl) statusEl.textContent = t('diary.saved', { hora: horaLocal() })
      notify(t('diary.titleSuggested', { titulo: word }))
    })
  })
  modalBody.querySelector('[data-dayry-save]')?.addEventListener('click', () => {
    saveNow()
    closeModal()
  })
  modalBody.querySelector('[data-dayry-delete]')?.addEventListener('click', () => {
    void confirm(t('diary.deleteMsg'), t('diary.delete')).then((ok) => {
      if (!ok) return
      deleted = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
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