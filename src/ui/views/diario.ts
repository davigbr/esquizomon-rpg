/** Diary view — list of entries on the left (like files), editor on the right
 *  with native markdown textarea + Editar/Ver toggle (rendered preview) and
 *  auto-save. */

import type { AppData, DiaryEntry } from '../../core/tipos'
import { formatLongDate, todayISO } from '../../core/jogo'
import { appStore, deleteEntry, importDiary, moveEntry, saveEntry } from '../../stores/app'
import { closeModal, confirm, modalBody, openModal } from '../modal'
import { notify } from '../toast'
import { escapeHtml } from '../util'
import { renderMarkdown } from '../editorMd'
import { parseDiaryMarkdown } from '../importDiario'

/** Date of the entry open in the editor (module — survives re-renders). */
let active: string | null = null

/** Date whose content the editor DOM represents (last full render). */
let renderedDate: string | null = null

/** Content with which the editor was last rendered. The edit guard compares
 *  the DOM with THIS (what we rendered), not with storage: so external writes
 *  (import, sync) don't look like "unsaved edit", and switching entries
 *  re-renders the editor. */
let lastRenderedContent: { text: string; title: string } | null = null

/** Editor mode: false = editing (textarea), true = preview. */
let isPreview = false

/** Autosave timers (per date). */
const autosaveTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function mountDiary(root: HTMLElement, data: AppData): void {
  const today = todayISO()
  const entries = [...(data.diary ?? [])].sort((a, b) => b.date.localeCompare(a.date))
  if (!active) active = entries[0]?.date ?? today
  const entry = entries.find((e) => e.date === active)
  const entryExists = !!entry

  // ⚠️ Preserves the edit: if the user typed in the editor since the last render
  // (DOM differs from what we RENDERED) AND is not switching entries, it does
  // NOT replace the whole editor (that would kill caret and undo stack). BUT the
  // SIDE LIST always updates, otherwise the '+' and '🗑' buttons look dead (on
  // macOS/Safari clicking a button doesn't blur the editor).
  const editorEl = root.querySelector<HTMLTextAreaElement>('[data-diario-editor]')
  let editActive = false
  if (editorEl && lastRenderedContent && active === renderedDate) {
    const textValue = editorEl.value
    const titleValue = (root.querySelector<HTMLInputElement>('[data-diario-titulo]')?.value ?? '')
    editActive = textValue !== lastRenderedContent.text || titleValue !== lastRenderedContent.title
  }
  // Preserves caret/focus of the textarea if the re-render is only the autosave
  // (value already saved → editActive false → full render).
  const selectionBefore = editorEl ? { start: editorEl.selectionStart, end: editorEl.selectionEnd } : null
  const focusBefore = !!editorEl && document.activeElement === editorEl
  if (editActive && entryExists) {
    // updates only the side list + status; the editor stays intact
    const listEl = root.querySelector<HTMLElement>('.diary-files')
    if (listEl) {
      listEl.innerHTML = entries.length === 0
        ? '<div class="diary-empty">Nenhuma crônica ainda.<br>Clique em + pra começar hoje.</div>'
        : entries.map((e) => entryHtml(e, e.date === active)).join('')
    }
    const statusEl = root.querySelector<HTMLElement>('[data-diario-status]')
    if (statusEl) statusEl.textContent = 'Salvando…'
    return
  }

  root.innerHTML = `
    <header class="view-header">
      <h1>Diário</h1>
    </header>

    <div class="diary-layout">
      <aside class="diary-list" aria-label="Entradas do diário">
        <div class="diary-list-header">
          <span class="diary-list-title">Entradas</span>
          <div class="diary-list-buttons">
            <button class="btn btn-icon diary-import" data-diario-importar title="Importar crônicas (markdown)" aria-label="Importar crônicas (markdown)">
              <i class="fa-solid fa-file-import" aria-hidden="true"></i>
            </button>
            <button class="btn btn-icon diary-new" data-diario-novo title="Nova entrada de hoje" aria-label="Nova entrada de hoje">
              <i class="fa-solid fa-plus" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="diary-files">
          ${entries.length === 0
            ? '<div class="diary-empty">Nenhuma crônica ainda.<br>Clique em + pra começar hoje.</div>'
            : entries.map((e) => entryHtml(e, e.date === active)).join('')}
        </div>
      </aside>

      <section class="diary-editor" aria-label="Editor da entrada">
        <div class="diary-editor-header">
          <div class="diary-editor-data">
            ${entry?.date === today ? '<span class="badge badge--hoje">Hoje</span>' : ''}
            <input type="date" class="diary-data-input" data-diario-data value="${entry?.date ?? today}"
              max="${new Date().toISOString().slice(0, 10)}" title="Data da crônica" aria-label="Data da crônica" />
          </div>
          <div class="diary-editor-actions">
            <span class="diary-status" data-diario-status>${entry ? '' : 'Sem conteúdo ainda'}</span>
            ${entry ? `
              <button class="btn btn-icon" data-diario-excluir="${escapeHtml(entry.id)}" title="Excluir crônica" aria-label="Excluir crônica">
                <i class="fa-solid fa-trash" aria-hidden="true"></i>
              </button>` : ''}
          </div>
        </div>

        <input class="diary-title" data-diario-titulo type="text" placeholder="Título" maxlength="120"
          value="${escapeHtml(entry?.title ?? '')}" autocomplete="off" />

        <div class="diary-tools">
          <button class="btn btn-pequeno" data-diario-toggle title="Alternar entre editar e visualizar">Ver</button>
        </div>

        <div class="diary-editor-area">
          <textarea class="diary-textarea" data-diario-editor placeholder="Escreva sua crônica em markdown…"
            spellcheck="true" aria-label="Crônica em markdown">${escapeHtml(entry?.text ?? '')}</textarea>
          <div class="diary-preview" data-diario-preview hidden></div>
        </div>
        <p class="settings-hint diary-hint">Markdown: <code>## título</code> · <code>- lista</code> · <code>1.</code> · <code>&gt; citação</code> · <code>**negrito**</code> · <code>*itálico*</code> · <code>[link](url)</code> · <code>| tabela |</code></p>
      </section>
    </div>
  `

  installNewEntry(root)
  installImport(root)
  installList(root)
  installEditor(root, today)
  installDateChange(root)
  applyMode(root)

  // the editor DOM now represents this date and this content
  renderedDate = active
  lastRenderedContent = { text: entry?.text ?? '', title: entry?.title ?? '' }

  // Restores caret/focus if the re-render caught the user mid-editor.
  if (focusBefore && selectionBefore) {
    const fresh = root.querySelector<HTMLTextAreaElement>('[data-diario-editor]')
    if (fresh) {
      fresh.focus()
      fresh.setSelectionRange(Math.min(selectionBefore.start, fresh.value.length), Math.min(selectionBefore.end, fresh.value.length))
    }
  }
}

/** Applies the current mode (edit/preview) after a re-render. */
function applyMode(root: HTMLElement): void {
  const area = root.querySelector<HTMLTextAreaElement>('[data-diario-editor]')
  const preview = root.querySelector<HTMLElement>('[data-diario-preview]')
  const btn = root.querySelector<HTMLButtonElement>('[data-diario-toggle]')
  if (!area || !preview || !btn) return
  if (isPreview) {
    preview.innerHTML = renderMarkdown(area.value)
    preview.hidden = false
    area.hidden = true
    btn.textContent = 'Editar'
  } else {
    preview.hidden = true
    area.hidden = false
    btn.textContent = 'Ver'
  }
}

/** Changes the date of the open entry (moveEntry respects 1/day). */
function installDateChange(root: HTMLElement): void {
  const input = root.querySelector<HTMLInputElement>('[data-diario-data]')
  if (!input) return
  input.addEventListener('change', () => {
    const newDate = input.value
    const id = root.querySelector('[data-diario-excluir]')?.getAttribute('data-diario-excluir')
    if (!id) return
    const result = moveEntry(id, newDate)
    if (!result.ok) {
      notify(result.reason ?? 'Não deu para mudar a data.', 'erro')
      // reverts the input to the current date
      const entry = appStore.get().diary?.find((e) => e.id === id)
      input.value = entry?.date ?? todayISO()
      return
    }
    active = newDate
    notify('Crônica movida para ' + formatLongDate(newDate) + '.')
    appStore.set({ ...appStore.get() })
  })
}

function entryHtml(e: DiaryEntry, activeEntry: boolean): string {
  const title = e.title.trim() || 'Sem título'
  return `
    <button class="diary-file${activeEntry ? ' diary-file--active' : ''}" data-diario-abrir="${escapeHtml(e.date)}" title="${escapeHtml(formatLongDate(e.date))}">
      <span class="diary-file-data">${e.date.slice(8, 10)}/${e.date.slice(5, 7)}/${e.date.slice(0, 4)}</span>
      <span class="diary-file-title">${escapeHtml(title)}</span>
    </button>
  `
}

function installNewEntry(root: HTMLElement): void {
  root.querySelector('[data-diario-novo]')?.addEventListener('click', () => {
    const today = todayISO()
    active = today
    const data = appStore.get()
    const alreadyExists = (data.diary ?? []).some((e) => e.date === today)
    if (!alreadyExists) {
      // creates the entry NOW (empty) — the editor is born with .md-linha
      // structure, otherwise the Enter on the first keystroke is swallowed
      // (no line to split)
      saveEntry(today, { text: '' })
    } else {
      appStore.set({ ...appStore.get() })
    }
    setTimeout(() => root.querySelector<HTMLElement>('[data-diario-editor]')?.focus(), 50)
  })
}

/** Bulk import: .md file or pasted text with `## AAAA-MM-DD`. */
function installImport(root: HTMLElement): void {
  root.querySelector('[data-diario-importar]')?.addEventListener('click', () => {
    openModal(`
      <h2>Importar crônicas</h2>
      <p class="settings-hint">Cole o markdown com uma crônica por dia, cada uma começando com a data: <code>## AAAA-MM-DD</code>. Título opcional na primeira linha em negrito (<code>**Título**</code>). Dias que já existem são pulados.</p>
      <div class="form-group">
        <label>Ou escolha um arquivo .md</label>
        <input type="file" class="filter-input" accept=".md,.markdown,.txt" data-import-arquivo />
      </div>
      <div class="form-group">
        <textarea class="filter-textarea" data-import-texto rows="12" spellcheck="false"
          placeholder="## 2026-08-01&#10;**Título opcional**&#10;Corpo da crônica em markdown...&#10;&#10;## 2026-08-02&#10;..."></textarea>
      </div>
      <p class="settings-hint" data-import-status></p>
      <div class="form-actions">
        <button class="btn" data-modal-cancelar>Cancelar</button>
        <button class="btn btn-primary" data-import-executar>Importar</button>
      </div>
    `)
    const fileEl = modalBody.querySelector<HTMLInputElement>('[data-import-arquivo]')
    const textEl = modalBody.querySelector<HTMLTextAreaElement>('[data-import-texto]')
    const statusEl = modalBody.querySelector<HTMLElement>('[data-import-status]')
    fileEl?.addEventListener('change', () => {
      const file = fileEl.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        if (textEl && typeof reader.result === 'string') {
          textEl.value = reader.result
          if (statusEl) statusEl.textContent = `"${file.name}" carregado — confira e clique em Importar.`
        }
      }
      reader.readAsText(file, 'utf-8')
    })
    modalBody.querySelector('[data-import-executar]')?.addEventListener('click', () => {
      const entries = parseDiaryMarkdown(textEl?.value ?? '')
      if (entries.length === 0) {
        if (statusEl) statusEl.textContent = 'Nenhuma crônica com data no formato ## AAAA-MM-DD foi encontrada.'
        return
      }
      const res = importDiary(entries)
      let msg = `${res.imported} importada(s).`
      if (res.skipped.length > 0) msg += ` ${res.skipped.length} pulada(s) — já existiam: ${res.skipped.join(', ')}.`
      if (res.invalid.length > 0) msg += ` ${res.invalid.length} ignorada(s) — data inválida.`
      if (res.imported > 0) {
        const mostRecent = entries
          .map((e) => e.date)
          .filter((d) => !res.skipped.includes(d))
          .sort()
          .pop()
        if (mostRecent) active = mostRecent
        // ⚠️ Syncs the editor with the imported entry WITHOUT touching the
        // draft: the "active edit" guard (mountDiary) compares the old (empty)
        // DOM with the new (text) storage and would think there's unsaved
        // text, preserving an empty editor forever.
        const editor = root.querySelector<HTMLTextAreaElement>('[data-diario-editor]')
        const titleInput = root.querySelector<HTMLInputElement>('[data-diario-titulo]')
        if (editor && titleInput && !(editor.value || titleInput.value)) {
          const fresh = (appStore.get().diary ?? []).find((e) => e.date === active)
          if (fresh) {
            editor.value = fresh.text
            titleInput.value = fresh.title ?? ''
          }
        }
        appStore.set({ ...appStore.get() })
      }
      // closes the modal and shows the summary in the toast (user decision)
      closeModal()
      notify(msg)
    })
    modalBody.querySelector('[data-modal-cancelar]')?.addEventListener('click', closeModal)
  })
}

function installList(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>('[data-diario-abrir]').forEach((btn) => {
    btn.addEventListener('click', () => {
      active = btn.dataset.diarioAbrir ?? null
      appStore.set({ ...appStore.get() })
    })
  })
}

function installEditor(root: HTMLElement, today: string): void {
  const areaEl = root.querySelector<HTMLTextAreaElement>('[data-diario-editor]')
  const previewEl = root.querySelector<HTMLElement>('[data-diario-preview]')
  const titleEl = root.querySelector<HTMLInputElement>('[data-diario-titulo]')
  const statusEl = root.querySelector<HTMLElement>('[data-diario-status]')
  if (!areaEl || !titleEl) return

  const targetDate = active ?? today
  const area = areaEl // non-null from here (guard above)
  const title = titleEl

  /** Saves immediately (forces the write, clears timer). */
  function saveNow(): void {
    const text = area.value
    const titleValue = title.value.trim()
    // compares with what is REALLY saved (appStore, always current) — not with
    // a closure snapshot: the blur of a textarea REMOVED by the autosave
    // re-render would run with a stale snapshot, save again and cause a 2nd
    // chained re-render (that swallowed clicks — the button was replaced
    // between mousedown and mouseup).
    const currentEntry = (appStore.get().diary ?? []).find((e) => e.date === targetDate)
    if (text === (currentEntry?.text ?? '') && titleValue === (currentEntry?.title ?? '')) return
    const timer = autosaveTimers.get(targetDate)
    if (timer) clearTimeout(timer)
    autosaveTimers.delete(targetDate)
    if (text.trim() || titleValue) {
      saveEntry(targetDate, { title: titleValue, text })
      if (statusEl) statusEl.textContent = `Salvo ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    }
  }

  /** Autosave with debounce. */
  function scheduleSave(): void {
    const timer = autosaveTimers.get(targetDate)
    if (timer) clearTimeout(timer)
    if (statusEl) statusEl.textContent = 'Salvando…'
    autosaveTimers.set(
      targetDate,
      setTimeout(() => saveNow(), 800),
    )
  }

  // Editar/Ver toggle
  root.querySelector<HTMLButtonElement>('[data-diario-toggle]')?.addEventListener('click', () => {
    isPreview = !isPreview
    applyMode(root)
    if (!isPreview) area.focus()
  })

  // Typing: schedules save and, in preview mode, updates the preview live.
  area.addEventListener('input', () => {
    scheduleSave()
    if (isPreview && previewEl) {
      previewEl.innerHTML = renderMarkdown(area.value)
    }
  })

  // Title also auto-saves.
  title.addEventListener('input', scheduleSave)

  // Blur saves — BUT scheduled (next macrotask): saving SYNCHRONOUSLY on blur
  // fired appStore.set → re-render → the DOM was replaced between the mousedown
  // and mouseup of a click right after typing → click swallowed (delete/toggle
  // buttons seemed dead). With scheduling, the click completes first; the
  // save/re-render runs after, with no click in progress.
  area.addEventListener('blur', () => setTimeout(() => saveNow(), 0))
  title.addEventListener('blur', () => setTimeout(() => saveNow(), 0))

  // Delete
  root.querySelector<HTMLButtonElement>('[data-diario-excluir]')?.addEventListener('click', () => {
    const id = root.querySelector('[data-diario-excluir]')?.getAttribute('data-diario-excluir') ?? ''
    void confirm('Apagar esta crônica? Isso não pode ser desfeito.', 'Apagar crônica').then((ok) => {
      if (!ok) return
      deleteEntry(id)
      active = null // reopens on the most recent
      isPreview = false
      appStore.set({ ...appStore.get() })
      notify('Crônica apagada.')
    })
  })
}
