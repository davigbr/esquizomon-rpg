/** Visão Diário — lista de entradas à esquerda (como arquivos), editor à direita
 *  com textarea markdown nativo + toggle Editar/Ver (preview renderizado) e
 *  salvamento automático. */

import type { AppData, EntradaDiario } from '../../core/tipos'
import { hojeISO, dataPorExtenso, MAX_CARTAS_RECOMPENSADAS_POR_ENTRADA, XP_POR_CARTA_CITADA } from '../../core/jogo'
import { carregarDeck, cartasCitadasNoTexto, nomeDaCarta } from '../../core/baralho'
import { appStore, excluirEntrada, importarDiario, moverEntrada, recompensarCartaCitada, salvarEntrada } from '../../stores/app'
import { abrirModal, fecharModal, modalBody, confirmar } from '../modal'
import { notificar } from '../toast'
import { escapar } from '../util'
import { renderizarMarkdown } from '../editorMd'
import { parsearMarkdownDiario } from '../importDiario'

/** Data da entrada aberta no editor (módulo — sobrevive a re-renders). */
let aberta: string | null = null

/** Data cujo conteúdo o DOM do editor representa (último render completo). */
let abertaRenderizada: string | null = null

/** Conteúdo com que o editor foi renderizado por último. A guarda de edição
 *  ativa compara o DOM com ESTE (o que renderizamos), não com o storage: assim
 *  escrita externa (import, sync) não parece "edição não salva", e trocar de
 *  entrada re-renderiza o editor. */
let ultimoRenderConteudo: { texto: string; titulo: string } | null = null

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

  // ⚠️ Preserva a edição: se o usuário digitou no editor desde o último render
  // (DOM difere do que RENDERIZAMOS) E não está trocando de entrada, NÃO
  // substitui o editor inteiro (isso mataria caret e undo stack). MAS a LISTA
  // LATERAL sempre atualiza, senão os botões '+' e '🗑' parecem mortos (no
  // macOS/Safari o clique num botão não tira o foco do editor).
  const editorAtual = raiz.querySelector<HTMLTextAreaElement>('[data-diario-editor]')
  let edicaoAtiva = false
  if (editorAtual && ultimoRenderConteudo && aberta === abertaRenderizada) {
    const textoAtual = editorAtual.value
    const tituloAtual = (raiz.querySelector<HTMLInputElement>('[data-diario-titulo]')?.value ?? '')
    edicaoAtiva = textoAtual !== ultimoRenderConteudo.texto || tituloAtual !== ultimoRenderConteudo.titulo
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
    </header>

    <div class="diario-layout">
      <aside class="diario-lista" aria-label="Entradas do diário">
        <div class="diario-lista-cabecalho">
          <span class="diario-lista-titulo">Entradas</span>
          <div class="diario-lista-botoes">
            <button class="btn btn-icon diario-importar" data-diario-importar title="Importar crônicas (markdown)" aria-label="Importar crônicas (markdown)">
              <i class="fa-solid fa-file-import" aria-hidden="true"></i>
            </button>
            <button class="btn btn-icon diario-novo" data-diario-novo title="Nova entrada de hoje" aria-label="Nova entrada de hoje">
              <i class="fa-solid fa-plus" aria-hidden="true"></i>
            </button>
          </div>
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
  instalarImportar(raiz)
  instalarLista(raiz)
  instalarEditor(raiz, hoje)
  instalarMudancaData(raiz)
  aplicarModo(raiz)

  // o DOM do editor agora representa esta data e este conteúdo
  abertaRenderizada = aberta
  ultimoRenderConteudo = { texto: entrada?.texto ?? '', titulo: entrada?.titulo ?? '' }

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

/** Importação em massa: arquivo .md ou texto colado com `## AAAA-MM-DD`. */
function instalarImportar(raiz: HTMLElement): void {
  raiz.querySelector('[data-diario-importar]')?.addEventListener('click', () => {
    abrirModal(`
      <h2>Importar crônicas</h2>
      <p class="config-dica">Cole o markdown com uma crônica por dia, cada uma começando com a data: <code>## AAAA-MM-DD</code>. Título opcional na primeira linha em negrito (<code>**Título**</code>). Dias que já existem são pulados.</p>
      <div class="form-grupo">
        <label>Ou escolha um arquivo .md</label>
        <input type="file" class="filtro-input" accept=".md,.markdown,.txt" data-import-arquivo />
      </div>
      <div class="form-grupo">
        <textarea class="filtro-textarea" data-import-texto rows="12" spellcheck="false"
          placeholder="## 2026-08-01&#10;**Título opcional**&#10;Corpo da crônica em markdown...&#10;&#10;## 2026-08-02&#10;..."></textarea>
      </div>
      <p class="config-dica" data-import-status></p>
      <div class="form-acoes">
        <button class="btn" data-modal-cancelar>Cancelar</button>
        <button class="btn btn-primary" data-import-executar>Importar</button>
      </div>
    `)
    const arquivoEl = modalBody.querySelector<HTMLInputElement>('[data-import-arquivo]')
    const textoEl = modalBody.querySelector<HTMLTextAreaElement>('[data-import-texto]')
    const statusEl = modalBody.querySelector<HTMLElement>('[data-import-status]')
    arquivoEl?.addEventListener('change', () => {
      const arquivo = arquivoEl.files?.[0]
      if (!arquivo) return
      const leitor = new FileReader()
      leitor.onload = () => {
        if (textoEl && typeof leitor.result === 'string') {
          textoEl.value = leitor.result
          if (statusEl) statusEl.textContent = `"${arquivo.name}" carregado — confira e clique em Importar.`
        }
      }
      leitor.readAsText(arquivo, 'utf-8')
    })
    modalBody.querySelector('[data-import-executar]')?.addEventListener('click', () => {
      const entradas = parsearMarkdownDiario(textoEl?.value ?? '')
      if (entradas.length === 0) {
        if (statusEl) statusEl.textContent = 'Nenhuma crônica com data no formato ## AAAA-MM-DD foi encontrada.'
        return
      }
      const res = importarDiario(entradas)
      let msg = `${res.importadas} importada(s).`
      if (res.puladas.length > 0) msg += ` ${res.puladas.length} pulada(s) — já existiam: ${res.puladas.join(', ')}.`
      if (res.invalidas.length > 0) msg += ` ${res.invalidas.length} ignorada(s) — data inválida.`
      if (res.importadas > 0) {
        const maisRecente = entradas
          .map((e) => e.data)
          .filter((d) => !res.puladas.includes(d))
          .sort()
          .pop()
        if (maisRecente) aberta = maisRecente
        // ⚠️ Sincroniza o editor com a entrada importada SEM tocar em
        // rascunho: o guard de "edição ativa" (montarDiario) compara o DOM
        // velho (vazio) com o storage novo (texto) e acharia que há texto
        // não salvo, preservando um editor vazio pra sempre.
        const editor = raiz.querySelector<HTMLTextAreaElement>('[data-diario-editor]')
        const tituloInput = raiz.querySelector<HTMLInputElement>('[data-diario-titulo]')
        if (editor && tituloInput && !(editor.value || tituloInput.value)) {
          const nova = (appStore.get().diario ?? []).find((e) => e.data === aberta)
          if (nova) {
            editor.value = nova.texto
            tituloInput.value = nova.titulo ?? ''
          }
        }
        appStore.set({ ...appStore.get() })
      }
      // fecha o modal e mostra o resumo no toast (decisão do usuário)
      fecharModal()
      notificar(msg)
    })
    modalBody.querySelector('[data-modal-cancelar]')?.addEventListener('click', fecharModal)
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

  /** Salva imediatamente (força o write, limpa timer). */
  function salvarAgora(): void {
    const texto = area.value
    const tituloValor = titulo.value.trim()
    // compara com o que está REALMENTE salvo (appStore, sempre atual) — não com
    // um snapshot da closure: o blur de um textarea REMOVIDO pelo re-render do
    // autosave rodaria com snapshot velho, salvaria de novo e causaria um 2º
    // re-render em cadeia (que engolia cliques — o botão era substituído entre
    // mousedown e mouseup).
    const entradaAtual = (appStore.get().diario ?? []).find((e) => e.data === dataAlvo)
    if (texto === (entradaAtual?.texto ?? '') && tituloValor === (entradaAtual?.titulo ?? '')) return
    const timer = timersAutosave.get(dataAlvo)
    if (timer) clearTimeout(timer)
    timersAutosave.delete(dataAlvo)
    if (texto.trim() || tituloValor) {
      salvarEntrada(dataAlvo, { titulo: tituloValor, texto })
      if (statusEl) statusEl.textContent = `Salvo ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      void recompensarCitacoes(dataAlvo, texto)
    }
  }

  /** Detecta cartas desbloqueadas citadas no texto e recompensa (máx. N por entrada,
   *  dedup via entrada.recompensas — idempotente mesmo rodando no autosave). */
  async function recompensarCitacoes(data: string, texto: string): Promise<void> {
    if (!texto.trim()) return
    const deck = await carregarDeck().catch(() => null)
    if (!deck) return
    const desbloqueadas = new Set(appStore.get().personagem.cartas)
    const citadas = cartasCitadasNoTexto(texto, desbloqueadas)
    const entrada = (appStore.get().diario ?? []).find((e) => e.data === data)
    const ja = new Set(entrada?.recompensas ?? [])
    const novas = citadas.filter((id) => !ja.has(id)).slice(0, MAX_CARTAS_RECOMPENSADAS_POR_ENTRADA)
    if (novas.length === 0) return
    const nomes: string[] = []
    for (const id of novas) {
      if (recompensarCartaCitada(data, id)) nomes.push(nomeDaCarta(id))
    }
    if (nomes.length > 0) {
      notificar(`A Fábula anotou: você usou a carta ${nomes.join(' e ')} no diário (+${XP_POR_CARTA_CITADA * nomes.length} XP)`)
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

  // Blur salva — MAS agendado (próxima macrotask): salvar SÍNCRONO no blur
  // disparava appStore.set → re-render → o DOM era substituído entre o
  // mousedown e o mouseup de um clique logo após digitar → clique engolido
  // (botões excluir/toggle pareciam mortos). Com o agendamento, o clique
  // completa primeiro; o save/re-render roda depois, sem clique em andamento.
  area.addEventListener('blur', () => setTimeout(() => salvarAgora(), 0))
  titulo.addEventListener('blur', () => setTimeout(() => salvarAgora(), 0))

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
