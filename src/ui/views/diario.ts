/** Visão Diário — lista de entradas à esquerda (como arquivos), editor à direita
 *  com textarea markdown nativo + toggle Editar/Ver (preview renderizado) e
 *  salvamento automático. */

import type { AppData, EntradaDiario } from '../../core/tipos'
import { hojeISO, dataPorExtenso } from '../../core/jogo'
import { appStore, excluirEntrada, moverEntrada, salvarEntrada } from '../../stores/app'
import { confirmar } from '../modal'
import { notificar } from '../toast'
import { escapar } from '../formTarefa'
import { renderizarMarkdown } from '../editorMd'

/** Data da entrada aberta no editor (módulo — sobrevive a re-renders). */
let aberta: string | null = null

/** Modo do editor: false = edição (textarea), true = visualização (preview). */
let modoVisualizacao = false

/** Timers de autosave (por data). */
const timersAutosave = new Map<string, ReturnType<typeof setTimeout>>()

export function montarDiario(raiz: HTMLElement, dados: AppData): void {
  const hoje = hojeISO()
  const entradas = [...(dados.diario ?? [])].sort((a, b) => b.data.localeCompare(a.data))
  if (!aberta) aberta = entradas[0]?.data ?? hoje
  const entrada = entradas.find((e) => e.data === aberta)
  const entradaExiste = !!entrada

  // ⚠️ Preserva a edição: se o textarea/título têm conteúdo ainda não salvo
  // (difere do storage), NÃO substitui o editor inteiro (isso mataria caret
  // e undo stack). MAS a LISTA LATERAL sempre atualiza, senão os botões '+'
  // e '🗑' parecem mortos (no macOS/Safari o clique num botão não tira o
  // foco do editor).
  const editorAtual = raiz.querySelector<HTMLTextAreaElement>('[data-diario-editor]')
  let edicaoAtiva = false
  if (editorAtual) {
    const textoAtual = editorAtual.value
    const tituloAtual = (raiz.querySelector<HTMLInputElement>('[data-diario-titulo]')?.value ?? '')
    edicaoAtiva = textoAtual !== (entrada?.texto ?? '') || tituloAtual !== (entrada?.titulo ?? '')
  }
  // Preserva caret/foco do textarea caso o re-render seja só do autosave
  // (valor já salvo → edicaoAtiva false → render completo).
  const selAntes = editorAtual ? { start: editorAtual.selectionStart, end: editorAtual.selectionEnd } : null
  const focoAntes = !!editorAtual && document.activeElement === editorAtual
  if (edicaoAtiva && entradaExiste) {
    // atualiza só a lista lateral + status; o editor fica intacto
    const listaEl = raiz.querySelector<HTMLElement>('.diario-arquivos')
    if (listaEl) {
      listaEl.innerHTML = entradas.length === 0
        ? '<div class="diario-vazio">Nenhuma crônica ainda.<br>Clique em + pra começar hoje.</div>'
        : entradas.map((e) => arquivoHtml(e, e.data === aberta)).join('')
    }
    const statusEl = raiz.querySelector<HTMLElement>('[data-diario-status]')
    if (statusEl) statusEl.textContent = 'Salvando…'
    return
  }

  raiz.innerHTML = `
    <header class="view-header">
      <h1>Diário</h1>
      <p class="view-sub">Uma crônica por dia. Edição em markdown com salvamento automático — tudo fica no seu dispositivo.</p>
    </header>

    <div class="diario-layout">
      <aside class="diario-lista" aria-label="Entradas do diário">
        <div class="diario-lista-cabecalho">
          <span class="diario-lista-titulo">Entradas</span>
          <button class="btn btn-icon diario-novo" data-diario-novo title="Nova entrada de hoje" aria-label="Nova entrada de hoje">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
          </button>
        </div>
        <div class="diario-arquivos">
          ${entradas.length === 0
            ? '<div class="diario-vazio">Nenhuma crônica ainda.<br>Clique em + pra começar hoje.</div>'
            : entradas.map((e) => arquivoHtml(e, e.data === aberta)).join('')}
        </div>
      </aside>

      <section class="diario-editor" aria-label="Editor da entrada">
        <div class="diario-editor-cabecalho">
          <div class="diario-editor-data">
            ${entrada?.data === hoje ? '<span class="badge badge--hoje">Hoje</span>' : ''}
            <input type="date" class="diario-data-input" data-diario-data value="${entrada?.data ?? hoje}"
              max="${new Date().toISOString().slice(0, 10)}" title="Data da crônica" aria-label="Data da crônica" />
          </div>
          <div class="diario-editor-acoes">
            <span class="diario-status" data-diario-status>${entrada ? '' : 'Sem conteúdo ainda'}</span>
            ${entrada ? `
              <button class="btn btn-icon" data-diario-excluir="${escapar(entrada.id)}" title="Excluir crônica" aria-label="Excluir crônica">
                <i class="fa-solid fa-trash" aria-hidden="true"></i>
              </button>` : ''}
          </div>
        </div>

        <input class="diario-titulo" data-diario-titulo type="text" placeholder="Título" maxlength="120"
          value="${escapar(entrada?.titulo ?? '')}" autocomplete="off" />

        <div class="diario-ferramentas">
          <button class="btn btn-pequeno" data-diario-toggle title="Alternar entre editar e visualizar">Ver</button>
        </div>

        <div class="diario-editor-area">
          <textarea class="diario-textarea" data-diario-editor placeholder="Escreva sua crônica em markdown…"
            spellcheck="true" aria-label="Crônica em markdown">${escapar(entrada?.texto ?? '')}</textarea>
          <div class="diario-preview" data-diario-preview hidden></div>
        </div>
        <p class="config-dica diario-dica">Markdown: <code>## título</code> · <code>- lista</code> · <code>1.</code> · <code>&gt; citação</code> · <code>**negrito**</code> · <code>*itálico*</code> · <code>[link](url)</code></p>
      </section>
    </div>
  `

  instalarNovaEntrada(raiz)
  instalarLista(raiz)
  instalarEditor(raiz, hoje)
  instalarMudancaData(raiz)
  aplicarModo(raiz)

  // Restaura caret/foco se o re-render pegou o usuário no meio do editor.
  if (focoAntes && selAntes) {
    const novo = raiz.querySelector<HTMLTextAreaElement>('[data-diario-editor]')
    if (novo) {
      novo.focus()
      novo.setSelectionRange(Math.min(selAntes.start, novo.value.length), Math.min(selAntes.end, novo.value.length))
    }
  }
}

/** Aplica o modo atual (edição/visualização) depois de um re-render. */
function aplicarModo(raiz: HTMLElement): void {
  const area = raiz.querySelector<HTMLTextAreaElement>('[data-diario-editor]')
  const preview = raiz.querySelector<HTMLElement>('[data-diario-preview]')
  const btn = raiz.querySelector<HTMLButtonElement>('[data-diario-toggle]')
  if (!area || !preview || !btn) return
  if (modoVisualizacao) {
    preview.innerHTML = renderizarMarkdown(area.value)
    preview.hidden = false
    area.hidden = true
    btn.textContent = 'Editar'
  } else {
    preview.hidden = true
    area.hidden = false
    btn.textContent = 'Ver'
  }
}

/** Troca a data da entrada aberta (moverEntrada respeita 1/dia). */
function instalarMudancaData(raiz: HTMLElement): void {
  const input = raiz.querySelector<HTMLInputElement>('[data-diario-data]')
  if (!input) return
  input.addEventListener('change', () => {
    const nova = input.value
    const id = raiz.querySelector('[data-diario-excluir]')?.getAttribute('data-diario-excluir')
    if (!id) return
    const resultado = moverEntrada(id, nova)
    if (!resultado.ok) {
      notificar(resultado.motivo ?? 'Não deu para mudar a data.', 'erro')
      // reverte o input pra data atual
      const entrada = appStore.get().diario?.find((e) => e.id === id)
      input.value = entrada?.data ?? hojeISO()
      return
    }
    aberta = nova
    notificar('Crônica movida para ' + dataPorExtenso(nova) + '.')
    appStore.set({ ...appStore.get() })
  })
}

function arquivoHtml(e: EntradaDiario, ativo: boolean): string {
  const titulo = e.titulo.trim() || 'Sem título'
  return `
    <button class="diario-arquivo${ativo ? ' diario-arquivo--ativo' : ''}" data-diario-abrir="${escapar(e.data)}" title="${escapar(dataPorExtenso(e.data))}">
      <span class="diario-arquivo-data">${e.data.slice(8, 10)}/${e.data.slice(5, 7)}/${e.data.slice(0, 4)}</span>
      <span class="diario-arquivo-titulo">${escapar(titulo)}</span>
    </button>
  `
}

function instalarNovaEntrada(raiz: HTMLElement): void {
  raiz.querySelector('[data-diario-novo]')?.addEventListener('click', () => {
    const hoje = hojeISO()
    aberta = hoje
    const dados = appStore.get()
    const jaExiste = (dados.diario ?? []).some((e) => e.data === hoje)
    if (!jaExiste) {
      // cria a entrada AGORA (vazia) — o editor nasce com estrutura .md-linha,
      // senão o Enter na primeira digitação é engolido (sem linha pra dividir)
      salvarEntrada(hoje, { texto: '' })
    } else {
      appStore.set({ ...appStore.get() })
    }
    setTimeout(() => raiz.querySelector<HTMLElement>('[data-diario-editor]')?.focus(), 50)
  })
}

function instalarLista(raiz: HTMLElement): void {
  raiz.querySelectorAll<HTMLButtonElement>('[data-diario-abrir]').forEach((btn) => {
    btn.addEventListener('click', () => {
      aberta = btn.dataset.diarioAbrir ?? null
      appStore.set({ ...appStore.get() })
    })
  })
}

function instalarEditor(raiz: HTMLElement, hoje: string): void {
  const areaEl = raiz.querySelector<HTMLTextAreaElement>('[data-diario-editor]')
  const previewEl = raiz.querySelector<HTMLElement>('[data-diario-preview]')
  const tituloEl = raiz.querySelector<HTMLInputElement>('[data-diario-titulo]')
  const statusEl = raiz.querySelector<HTMLElement>('[data-diario-status]')
  if (!areaEl || !tituloEl) return

  const dataAlvo = aberta ?? hoje
  const area = areaEl // não-nulo a partir daqui (guard acima)
  const titulo = tituloEl

  /** Último estado salvo — usado pra pular saves redundantes (o blur do
   *  textarea substituído por um re-render NÃO pode re-salvar e re-renderizar
   *  em loop infinito). */
  let ultimoSalvo = { texto: area.value, titulo: titulo.value.trim() }

  /** Salva imediatamente (força o write, limpa timer). */
  function salvarAgora(): void {
    const texto = area.value
    const tituloValor = titulo.value.trim()
    // nada mudou desde o último save → não faz set (evita loop blur→set→re-render→blur)
    if (texto === ultimoSalvo.texto && tituloValor === ultimoSalvo.titulo) return
    const timer = timersAutosave.get(dataAlvo)
    if (timer) clearTimeout(timer)
    timersAutosave.delete(dataAlvo)
    if (texto.trim() || tituloValor) {
      ultimoSalvo = { texto, titulo: tituloValor }
      salvarEntrada(dataAlvo, { titulo: tituloValor, texto })
      if (statusEl) statusEl.textContent = `Salvo ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    }
  }

  /** Autosave com debounce. */
  function agendarSalvar(): void {
    const timer = timersAutosave.get(dataAlvo)
    if (timer) clearTimeout(timer)
    if (statusEl) statusEl.textContent = 'Salvando…'
    timersAutosave.set(
      dataAlvo,
      setTimeout(() => salvarAgora(), 800),
    )
  }

  // Toggle Editar/Ver
  raiz.querySelector<HTMLButtonElement>('[data-diario-toggle]')?.addEventListener('click', () => {
    modoVisualizacao = !modoVisualizacao
    aplicarModo(raiz)
    if (!modoVisualizacao) area.focus()
  })

  // Digitação: agenda salvar e, no modo Ver, atualiza o preview ao vivo.
  area.addEventListener('input', () => {
    agendarSalvar()
    if (modoVisualizacao && previewEl) {
      previewEl.innerHTML = renderizarMarkdown(area.value)
    }
  })

  // Título também salva automático.
  titulo.addEventListener('input', agendarSalvar)

  // Blur salva.
  area.addEventListener('blur', () => salvarAgora())
  titulo.addEventListener('blur', () => salvarAgora())

  // Excluir
  raiz.querySelector<HTMLButtonElement>('[data-diario-excluir]')?.addEventListener('click', () => {
    const id = raiz.querySelector('[data-diario-excluir]')?.getAttribute('data-diario-excluir') ?? ''
    void confirmar('Apagar esta crônica? Isso não pode ser desfeito.', 'Apagar crônica').then((ok) => {
      if (!ok) return
      excluirEntrada(id)
      aberta = null // reabre na mais recente
      modoVisualizacao = false
      appStore.set({ ...appStore.get() })
      notificar('Crônica apagada.')
    })
  })
}
