/** Visão Diário — lista de entradas à esquerda (como arquivos), editor à direita
 *  com live preview de markdown (linhas vivas, estilo Obsidian) e salvamento automático. */

import type { AppData, EntradaDiario } from '../../core/tipos'
import { hojeISO, dataPorExtenso } from '../../core/jogo'
import { appStore, excluirEntrada, moverEntrada, salvarEntrada } from '../../stores/app'
import { confirmar } from '../modal'
import { notificar } from '../toast'
import { escapar } from '../formTarefa'
import { compilarEditor, editorParaTexto, caretParaPosicao, posicaoParaCaret, analisarLinha } from '../editorMd'

/** Data da entrada aberta no editor (módulo — sobrevive a re-renders). */
let aberta: string | null = null

/** Timers de autosave (por data). */
const timersAutosave = new Map<string, ReturnType<typeof setTimeout>>()

export function montarDiario(raiz: HTMLElement, dados: AppData): void {
  const hoje = hojeISO()
  const entradas = [...(dados.diario ?? [])].sort((a, b) => b.data.localeCompare(a.data))
  if (!aberta) aberta = entradas[0]?.data ?? hoje
  // Se a data aberta não tem entrada ainda (ex.: hoje, sem registro), cria em branco na hora de editar.
  const entrada = entradas.find((e) => e.data === aberta)

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

        <input class="diario-titulo" data-diario-titulo type="text" placeholder="Título (opcional)" maxlength="120"
          value="${escapar(entrada?.titulo ?? '')}" autocomplete="off" />

        <div class="diario-editor-area" data-diario-editor contenteditable="true" spellcheck="true" aria-label="Crônica em markdown">
          ${entrada ? compilarEditor(entrada.texto) : ''}
        </div>
        <p class="config-dica diario-dica">Markdown: <code>## título</code> · <code>- lista</code> · <code>1.</code> · <code>&gt; citação</code> · <code>**negrito**</code> · <code>*itálico*</code> · <code>[link](url)</code></p>
      </section>
    </div>
  `

  instalarNovaEntrada(raiz)
  instalarLista(raiz)
  instalarEditor(raiz, hoje)
  instalarMudancaData(raiz)
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
    // garante a entrada de hoje existe (vazia) — salvarEntrada cria com texto vazio; mas não
    // queremos criar registro só por abrir. Em vez disso: só seleciona; o editor cria ao salvar.
    const dados = appStore.get()
    const jaExiste = (dados.diario ?? []).some((e) => e.data === hoje)
    if (!jaExiste) {
      // abrir em branco sem persistir ainda
      aberta = hoje
    }
    appStore.set({ ...appStore.get() })
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
  const area = raiz.querySelector<HTMLElement>('[data-diario-editor]')
  const tituloEl = raiz.querySelector<HTMLInputElement>('[data-diario-titulo]')
  const statusEl = raiz.querySelector<HTMLElement>('[data-diario-status]')
  if (!area || !tituloEl) return

  const areaEl: HTMLElement = area
  const titulo: HTMLInputElement = tituloEl
  const dataAlvo = aberta ?? hoje

  /** Salva imediatamente (força o write, limpa timer). */
  function salvarAgora(): void {
    const timer = timersAutosave.get(dataAlvo)
    if (timer) clearTimeout(timer)
    timersAutosave.delete(dataAlvo)
    const texto = editorParaTexto(areaEl)
    const tituloValor = titulo.value.trim()
    if (texto.trim() || tituloValor) {
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

  /** Recompila o editor preservando o caret por posição. */
  function recompilar(): void {
    const pos = caretParaPosicao(areaEl)
    const texto = editorParaTexto(areaEl)
    areaEl.innerHTML = compilarEditor(texto)
    posicaoParaCaret(areaEl, pos)
  }

  // Input: se a linha atual mudou de tipo de bloco, recompila (live preview); senão só agenda salvar.
  areaEl.addEventListener('input', () => {
    agendarSalvar()

    const sel = document.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const no = sel.getRangeAt(0).startContainer
    const linha = no instanceof HTMLElement ? no.closest('.md-linha') : (no.parentElement?.closest('.md-linha'))
    if (!linha) return

    const textoLinha = (linha.querySelector('.md-prefixo')?.textContent ?? '') + (linha.querySelector('.md-conteudo')?.textContent ?? '')
    const tipoAtual = linha.getAttribute('data-tipo') ?? ''
    const novoTipo = analisarLinha(textoLinha).tipo
    if (novoTipo !== tipoAtual) {
      recompilar()
    }
  })

  // Enter: insere a quebra nós mesmos (determinístico). Sem preventDefault,
  // o browser cria estruturas fora do formato .md-linha e a recompilação
  // perderia a linha anterior.
  areaEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const pos = caretParaPosicao(areaEl)
      const texto = editorParaTexto(areaEl)
      const novoTexto = texto.slice(0, pos) + '\n' + texto.slice(pos)
      areaEl.innerHTML = compilarEditor(novoTexto)
      // caret no início da nova linha
      posicaoParaCaret(areaEl, pos + 1)
      agendarSalvar()
    }
  })

  // Título também salva automático.
  titulo.addEventListener('input', agendarSalvar)

  // Blur: recompila (formatação inline final) e salva.
  areaEl.addEventListener('blur', () => {
    recompilar()
    salvarAgora()
  })
  titulo.addEventListener('blur', () => salvarAgora())

  // Excluir
  raiz.querySelector<HTMLButtonElement>('[data-diario-excluir]')?.addEventListener('click', () => {
    const id = raiz.querySelector('[data-diario-excluir]')?.getAttribute('data-diario-excluir') ?? ''
    void confirmar('Apagar esta crônica? Isso não pode ser desfeito.', 'Apagar crônica').then((ok) => {
      if (!ok) return
      excluirEntrada(id)
      aberta = null // reabre na mais recente
      appStore.set({ ...appStore.get() })
      notificar('Crônica apagada.')
    })
  })
}
