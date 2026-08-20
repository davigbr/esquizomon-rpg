/** Painel do chat da Fábula — conversas múltiplas, streaming, raciocínio colapsável.
 *  Persistência: cada conversa vive em `AppData.conversas` (via appStore). */

import type { AppData, Conversa, MensagemIA } from '../core/tipos'
import {
  adicionarMensagem,
  appStore,
  atualizarConversa,
  conversaPorId,
  criarConversa,
  excluirConversa,
} from '../stores/app'
import { enviarParaIA, ErroIA, type MsgChat } from '../ia/cliente'
import { montarSystemPrompt, montarSystemPromptEsquizoanalista } from '../ia/prompt'
import { extrairAcoes, detectarPedidoInvocacao, type AcaoIA } from '../ia/acoes'
import { coletarNotasDeComando } from '../ia/notasDeComando'
import { nomeDaCarta, resolverCartaId, tipoDaCarta, rotuloTipo, todasAsCartas } from '../core/baralho'
import { invocarCarta } from '../stores/app'
import { custoInvocacao, custoInvocacaoFabula } from '../core/jogo'
import { tocarSom } from './sons'
import { notificar } from './toast'
import { escapar } from './util'
import { renderizarMarkdown } from './editorMd'
import { abrirModalCarta } from './views/cartas'
import { confirmar } from './modal'

const PAINEL_CHAVE = 'esquizomon-rpg:chat-painel'
const LARGURA_CHAVE = 'esquizomon-rpg:chat-largura'
const LARGURA_MIN = 320
const LARGURA_MAX = 900
const LARGURA_PADRAO = 480

/** Estado da UI do painel (aberto/fechado, conversa ativa). Persistido separado das conversas. */
interface EstadoPainel {
  aberto: boolean
  conversaAtivaId: string | null
}

function carregarEstadoPainel(): EstadoPainel {
  try {
    const bruto = localStorage.getItem(PAINEL_CHAVE)
    if (!bruto) return { aberto: false, conversaAtivaId: null }
    const obj = JSON.parse(bruto) as Partial<EstadoPainel>
    return {
      aberto: obj.aberto === true,
      conversaAtivaId: typeof obj.conversaAtivaId === 'string' ? obj.conversaAtivaId : null,
    }
  } catch {
    return { aberto: false, conversaAtivaId: null }
  }
}

function salvarEstadoPainel(estado: EstadoPainel): void {
  try {
    localStorage.setItem(PAINEL_CHAVE, JSON.stringify(estado))
  } catch {
    /* storage bloqueado — sem persistência do painel */
  }
}

function carregarLargura(): number {
  try {
    const v = Number(localStorage.getItem(LARGURA_CHAVE))
    if (Number.isFinite(v) && v >= LARGURA_MIN && v <= LARGURA_MAX) return v
  } catch {
    /* storage bloqueado */
  }
  return LARGURA_PADRAO
}

function salvarLargura(largura: number): void {
  try {
    localStorage.setItem(LARGURA_CHAVE, String(Math.round(largura)))
  } catch {
    /* sem persistência */
  }
}

function aplicarLargura(largura: number): void {
  if (painel) painel.style.width = `${Math.round(largura)}px`
}

let painel: HTMLElement | null = null
let listaEl: HTMLElement | null = null
let msgsEl: HTMLElement | null = null
let inputEl: HTMLTextAreaElement | null = null
let formEl: HTMLFormElement | null = null
let estado: EstadoPainel = carregarEstadoPainel()
let ocupado = false
/** Renomeação de conversa: input no lugar do título do cabeçalho. */
let renomeando = false
let tituloNaEdicao = ''

/** Autocomplete de comandos (/invocar, /analisar) e de cartas desbloqueadas. */
interface Sugestao {
  rotulo: string
  detalhe: string
  inserir: () => void
}
const COMANDOS = [
  { nome: 'invocar', descricao: 'invoca uma carta (custa mana; sem nome = Fábula escolhe, custa mais)' },
  { nome: 'analisar', descricao: 'análise esquizoanalítica técnica (10 mana)' },
  { nome: 'capturas', descricao: 'varredura das cartas de captura desbloqueadas (25 mana)' },
] as const
let sugestoes: Sugestao[] = []
let sugestaoIdx = 0

/** Monta a casca do painel (uma vez) e injeta no body. Idempotente. */
export function montarChat(): void {
  if (painel) return
  painel = document.createElement('aside')
  painel.id = 'fabula-panel'
  painel.setAttribute('aria-label', 'Chat com a Fábula')
  painel.style.width = `${carregarLargura()}px`
  document.body.appendChild(painel)
  renderizar()
}

function renderizar(): void {
  if (!painel) return
  // O innerHTML abaixo destrói o dropdown de sugestões — zera o estado.
  sugestoes = []
  sugestaoIdx = 0
  const dados: AppData = appStore.get()
  const conversas = dados.conversas ?? []
  // Auto-recuperação (bug real 2026-08-12): se o id da conversa ativa é ÓRFÃO
  // (ex.: import/export substituiu as conversas, ou painel antigo), seleciona a
  // conversa mais recente em vez de deixar o chat morto (input desabilitado).
  if (estado.conversaAtivaId && !conversas.some((c) => c.id === estado.conversaAtivaId)) {
    estado.conversaAtivaId = conversas[0]?.id ?? null
    salvarEstadoPainel(estado)
  }
  // Auto-início (usabilidade 2026-08-12, pedido do usuário): com o painel
  // ABERTO e nenhuma conversa (ex.: import substituiu os dados), cria uma nova
  // na hora — o chat nunca fica morto esperando o usuário achar o botão ✏.
  if (estado.aberto && conversas.length === 0) {
    const nova = criarConversa()
    if (nova) {
      estado.conversaAtivaId = nova.id
      salvarEstadoPainel(estado)
      notificar('Sem conversas — comecei uma nova pra você.')
    }
  }
  // Relê do store: o auto-início acima pode ter acabado de criar uma conversa
  // (a array `conversas` do topo é o snapshot ANTES da criação).
  const conversasAtuais = appStore.get().conversas ?? []
  const conversa = estado.conversaAtivaId
    ? conversasAtuais.find((c) => c.id === estado.conversaAtivaId) ?? undefined
    : undefined
  const ultima = conversa?.mensagens[conversa.mensagens.length - 1]
  const esperando = ocupado && ultima?.role === 'user'

  painel.classList.toggle('aberto', estado.aberto)
  document.body.classList.toggle('fabula-aberto', estado.aberto)

  painel.innerHTML = `
    <div class="fabula-resize" data-fabula-resize title="Arraste pra redimensionar" aria-label="Redimensionar painel"></div>
    <div class="fabula-lateral">
      <button class="btn btn-icon fabula-nova" data-fabula-nova title="Nova conversa" aria-label="Nova conversa">
        <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
      </button>
      <div class="fabula-lista" data-fabula-lista role="list" aria-label="Conversas">
        ${conversasAtuais.length === 0
          ? '<div class="fabula-vazio-lista">Sem conversas</div>'
          : conversasAtuais.map(itemConversa).join('')}
      </div>
    </div>

    <div class="fabula-conversa">
      <header class="fabula-cabecalho">
        ${renomeando && conversa
          ? `<input class="fabula-titulo-input" data-fabula-titulo-input value="${escapar(conversa.titulo ?? '')}" maxlength="60" aria-label="Título da conversa" title="Digite o novo título e Enter para salvar" />`
          : `<div class="fabula-titulo">
          <i class="fa-solid fa-feather" aria-hidden="true"></i>
          <div>
            <strong>Fábula</strong>
            <span class="fabula-sub">a Rizomante</span>
          </div>
        </div>`}
        <div class="fabula-cabecalho-acoes">
          <button class="btn btn-icon" data-fabula-renomear title="Renomear conversa" aria-label="Renomear conversa" ${conversa ? '' : 'disabled'}>
            <i class="fa-solid fa-pen" aria-hidden="true"></i>
          </button>
          <button class="btn btn-icon" data-fabula-excluir title="Apagar conversa" aria-label="Apagar conversa" ${conversa ? '' : 'disabled'}>
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
          </button>
          <button class="btn btn-icon" data-fabula-fechar aria-label="Fechar chat" title="Fechar">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
      </header>

      <div class="fabula-mensagens" data-fabula-mensagens>
        ${!conversa
          ? '<div class="fabula-vazio">Comece uma conversa com a Fábula. Ela tem acesso às suas tarefas, hábitos, cartas e personagem — e lembra do que foi dito antes.</div>'
          : conversa.mensagens.length === 0
            ? '<div class="fabula-vazio">Senta. Como você chega hoje? — e não vale responder "bem" sem me dizer o que "bem" quer dizer.</div>'
            : conversa.mensagens.map((m, i) => bolha(m, i)).join('')}
        ${esperando ? '<div class="fabula-bolha fabula-bolha--assistente fabula-digitando"><span></span><span></span><span></span></div>' : ''}
      </div>

      <form class="fabula-form" data-fabula-form>
        <textarea class="fabula-input" data-fabula-input rows="1" placeholder="${conversa ? '' : 'Crie uma conversa para começar'}" autocomplete="off" ${!conversa || ocupado ? 'disabled' : ''}></textarea>
        <button class="btn btn-icon" type="submit" aria-label="Enviar" ${!conversa || ocupado ? 'disabled' : ''}><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>
      </form>
      <p class="fabula-dica">Comandos: <b>/invocar &lt;carta&gt;</b> (custa mana) · <b>/invocar</b> sem nome (a Fábula escolhe, custa mais) · <b>/analisar</b> (10 mana, análise esquizoanalítica) · <b>/capturas</b> (25 mana, varredura das capturas desbloqueadas). Ou peça no texto: <b>invoca a carta &lt;nome&gt;</b>.</p>
    </div>
  `

  cachearRefs()
  instalarHandlers(conversa)
  rolarParaFim()
}

function itemConversa(c: Conversa): string {
  const ativa = c.id === estado.conversaAtivaId
  const preview = c.mensagens[c.mensagens.length - 1]?.content ?? 'Nova conversa'
  return `<button class="fabula-item ${ativa ? 'fabula-item--ativa' : ''}" data-conversa="${escapar(c.id)}" role="listitem" title="${escapar(c.titulo)}">
    <span class="fabula-item-titulo">${escapar(c.titulo || 'Sem título')}</span>
    <span class="fabula-item-preview">${escapar(preview.slice(0, 40))}</span>
  </button>`
}

function cachearRefs(): void {
  if (!painel) return
  listaEl = painel.querySelector('[data-fabula-lista]')
  msgsEl = painel.querySelector('[data-fabula-mensagens]')
  inputEl = painel.querySelector('[data-fabula-input]')
  formEl = painel.querySelector('[data-fabula-form]')
}

function instalarHandlers(conversa: Conversa | undefined): void {
  if (!painel) return
  painel.querySelector('[data-fabula-fechar]')!.addEventListener('click', () => alternarChat(false))
  painel.querySelector('[data-fabula-nova]')!.addEventListener('click', () => novaConversa())
  const btnRenomear = painel.querySelector<HTMLButtonElement>('[data-fabula-renomear]')
  if (btnRenomear && conversa) {
    btnRenomear.addEventListener('click', () => iniciarRenomeacao(conversa.id))
  }
  // Cópia por mensagem: delegação no container (cada bolha tem seu botão)
  msgsEl?.addEventListener('click', (e) => {
    const alvo = (e.target as HTMLElement).closest<HTMLElement>('[data-fabula-copiar-msg]')
    if (alvo) {
      const idx = Number(alvo.dataset.fabulaCopiarMsg)
      const m = conversaAtual()?.mensagens[idx]
      if (m) void copiarMensagem(m)
      return
    }
    // miniatura da carta → mesmo modal da galeria
    const carta = (e.target as HTMLElement).closest<HTMLElement>('[data-fabula-carta]')
    if (carta) {
      const id = carta.dataset.fabulaCarta ?? ''
      if (!id) return
      if (appStore.get().personagem.cartas.includes(id)) {
        abrirModalCarta(id)
      } else {
        notificar('Carta bloqueada — suba de nível para desbloquear.')
      }
    }
  })
  // Input de renomeação: Enter salva, Escape cancela, blur salva (com guarda).
  const tituloInput = painel.querySelector<HTMLInputElement>('[data-fabula-titulo-input]')
  if (tituloInput) {
    const finalizarRenomeacao = () => {
      const novo = tituloInput.value.trim()
      const c = conversaAtual()
      renomeando = false
      if (c && novo && novo !== tituloNaEdicao) atualizarConversa(c.id, { titulo: novo })
      tituloNaEdicao = ''
      renderizar()
    }
    tituloInput.addEventListener('keydown', (e) => {
      const ev = e as KeyboardEvent
      if (ev.key === 'Enter') {
        ev.preventDefault()
        finalizarRenomeacao()
      } else if (ev.key === 'Escape') {
        tituloInput.value = tituloNaEdicao // cancela: volta ao título original
        finalizarRenomeacao()
      }
    })
    tituloInput.addEventListener('blur', finalizarRenomeacao)
  }
  const btnExcluir = painel.querySelector('[data-fabula-excluir]') as HTMLButtonElement | null
  if (btnExcluir && conversa) {
    btnExcluir.addEventListener('click', () => void apagarConversaAtual())
  }
  listaEl?.querySelectorAll<HTMLButtonElement>('[data-conversa]').forEach((btn) => {
    btn.addEventListener('click', () => selecionarConversa(btn.dataset.conversa ?? ''))
  })
  instalarResize()
  if (formEl && inputEl && conversa) {
    // Enter envia / Shift+Enter quebra linha — mas com sugestões abertas,
    // Enter/Tab/Setas navegam e completam o comando (autocomplete).
    inputEl.addEventListener('keydown', (e) => {
      const ev = e as KeyboardEvent
      if (sugestoes.length > 0) {
        if (ev.key === 'ArrowDown') {
          ev.preventDefault()
          moverSugestao(1)
        } else if (ev.key === 'ArrowUp') {
          ev.preventDefault()
          moverSugestao(-1)
        } else if (ev.key === 'Enter' || ev.key === 'Tab') {
          ev.preventDefault()
          aplicarSugestao()
        } else if (ev.key === 'Escape') {
          ev.preventDefault()
          fecharSugestoes()
        }
        return
      }
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault()
        formEl?.requestSubmit()
      }
    })
    // Auto-resize do textarea + autocomplete de comandos/cartas
    inputEl.addEventListener('input', () => {
      inputEl!.style.height = 'auto'
      inputEl!.style.height = Math.min(inputEl!.scrollHeight, 200) + 'px'
      atualizarSugestoes()
    })
    // Fecha as sugestões ao sair (atraso pequeno pra o clique no item completar)
    inputEl.addEventListener('blur', () => {
      setTimeout(() => fecharSugestoes(), 150)
    })
    formEl.addEventListener('submit', (e) => {
      e.preventDefault()
      const texto = inputEl!.value.trim()
      if (!texto || ocupado) return
      inputEl!.value = ''
      inputEl!.style.height = 'auto'
      fecharSugestoes()
      void enviar(texto)
    })
  }
}

/** Drag horizontal na borda esquerda do painel — redimensiona largura. */
function instalarResize(): void {
  if (!painel) return
  const alca = painel.querySelector<HTMLElement>('[data-fabula-resize]')
  if (!alca) return

  alca.addEventListener('pointerdown', (eDown) => {
    if (!painel) return
    eDown.preventDefault()
    alca.setPointerCapture(eDown.pointerId)
    const inicioX = eDown.clientX
    const larguraInicial = painel.getBoundingClientRect().width
    document.body.classList.add('fabula-resizing')

    const mover = (eMove: PointerEvent) => {
      if (!painel) return
      // Arrastar pra ESQUERDA aumenta o painel (borda esquerda é a "frente" do resize)
      const dx = inicioX - eMove.clientX
      const nova = Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, larguraInicial + dx))
      aplicarLargura(nova)
    }

    const fim = () => {
      alca.removeEventListener('pointermove', mover)
      alca.removeEventListener('pointerup', fim)
      alca.removeEventListener('pointercancel', fim)
      document.body.classList.remove('fabula-resizing')
      if (painel) salvarLargura(painel.getBoundingClientRect().width)
    }

    alca.addEventListener('pointermove', mover)
    alca.addEventListener('pointerup', fim)
    alca.addEventListener('pointercancel', fim)
  })
}

/** Atualiza o dropdown de sugestões conforme o input (até o caret):
 *  "/" + começo de comando → lista os comandos; "/invocar " + texto → lista as
 *  cartas desbloqueadas. Fecha se não parecer um comando. */
function atualizarSugestoes(): void {
  if (!painel || !inputEl) return
  const valor = inputEl.value
  const caret = inputEl.selectionStart ?? valor.length
  const prefixo = valor.slice(0, caret)
  const mComando = prefixo.match(/^\/([a-z-]*)$/i)
  const mCarta = prefixo.match(/^\/invocar\s+(.*)$/i)
  const dados = appStore.get()
  const desbloqueadas = new Set(dados.personagem.cartas)
  let itens: Sugestao[] = []
  if (mComando) {
    const base = mComando[1].toLowerCase()
    // Só sugere PREFIXOS — comando exato (/invocar, /analisar) não abre dropdown,
    // senão Enter completaria em loop em vez de enviar.
    itens = COMANDOS.filter((c) => c.nome.startsWith(base) && c.nome !== base).map((c) => ({
      rotulo: `/${c.nome}`,
      detalhe: c.descricao,
      inserir: () => {
        inputEl!.value = `/${c.nome} `
        inputEl!.focus()
        atualizarSugestoes() // depois de "/invocar ", lista as cartas
      },
    }))
  } else if (mCarta) {
    const q = mCarta[1].toLocaleLowerCase('pt-BR')
    itens = todasAsCartas()
      .filter((c) => desbloqueadas.has(c.id))
      .filter((c) => c.name.toLocaleLowerCase('pt-BR').includes(q))
      .slice(0, 8)
      .map((c) => ({
        rotulo: c.name,
        detalhe: `${rotuloTipo(c.type)} · invocada ${dados.personagem.invocacoes[c.id] ?? 0}×`,
        inserir: () => {
          inputEl!.value = `/invocar ${c.name}`
          inputEl!.focus()
          fecharSugestoes()
        },
      }))
  }
  renderSugestoes(itens)
}

function renderSugestoes(itens: Sugestao[]): void {
  sugestoes = itens
  sugestaoIdx = 0
  const existente = painel?.querySelector<HTMLElement>('[data-fabula-sugestoes]')
  if (itens.length === 0) {
    existente?.remove()
    return
  }
  let el = existente
  if (!el) {
    el = document.createElement('div')
    el.className = 'fabula-sugestoes'
    el.dataset.fabulaSugestoes = ''
    el.setAttribute('role', 'listbox')
    el.setAttribute('aria-label', 'Comandos e cartas')
    painel!.appendChild(el)
  }
  el.innerHTML = itens
    .map(
      (s, i) =>
        `<button type="button" class="fabula-sugestao${i === sugestaoIdx ? ' fabula-sugestao--ativa' : ''}" data-fabula-sugestao="${i}" role="option" aria-selected="${i === sugestaoIdx}">
          <span class="fabula-sugestao-rotulo">${escapar(s.rotulo)}</span>
          <span class="fabula-sugestao-detalhe">${escapar(s.detalhe)}</span>
        </button>`,
    )
    .join('')
  el.querySelectorAll<HTMLButtonElement>('[data-fabula-sugestao]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault() // mantém o foco no input; o blur não fecha antes do clique
      const idx = Number(btn.dataset.fabulaSugestao)
      sugestoes[idx]?.inserir()
    })
  })
}

function moverSugestao(delta: number): void {
  if (sugestoes.length === 0) return
  sugestaoIdx = (sugestaoIdx + delta + sugestoes.length) % sugestoes.length
  painel?.querySelectorAll<HTMLButtonElement>('[data-fabula-sugestao]').forEach((btn, i) => {
    btn.classList.toggle('fabula-sugestao--ativa', i === sugestaoIdx)
    btn.setAttribute('aria-selected', String(i === sugestaoIdx))
  })
}

function aplicarSugestao(): void {
  sugestoes[sugestaoIdx]?.inserir()
}

function fecharSugestoes(): void {
  sugestoes = []
  sugestaoIdx = 0
  painel?.querySelector('[data-fabula-sugestoes]')?.remove()
}

function rolarParaFim(): void {
  if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight
}

function bolha(m: MensagemIA, idx: number): string {
  const btnCopiar = `<button type="button" class="fabula-copiar-msg" data-fabula-copiar-msg="${idx}" title="Copiar mensagem em markdown" aria-label="Copiar mensagem em markdown"><i class="fa-solid fa-copy" aria-hidden="true"></i></button>`
  if (m.role === 'user') {
    return `<div class="fabula-bolha fabula-bolha--usuario">${btnCopiar}<span class="fabula-bolha-texto">${escapar(m.content)}</span></div>`
  }
  const raciocinio = m.reasoning
    ? `<details class="fabula-reasoning">
        <summary><i class="fa-solid fa-brain" aria-hidden="true"></i> Raciocínio</summary>
        <pre>${escapar(m.reasoning)}</pre>
      </details>`
    : ''
  return `<div class="fabula-bolha fabula-bolha--assistente">${btnCopiar}<span class="fabula-bolha-texto">${renderizarConteudo(m.content)}</span>${raciocinio}</div>`
}

/** Renderiza o conteúdo da bolha do assistente: markdown (negrito, listas,
 *  tabelas, itálico…) + o marcador [[carta:<id>]] vira a miniatura CLICÁVEL
 *  (abre o mesmo modal da galeria — 2026-08-12). */
function renderizarConteudo(conteudo: string): string {
  const renderizado = conteudo.trim() ? renderizarMarkdown(conteudo) : ''
  let html = renderizado.replace(/\[\[carta:([\w-]+)\]\]/g, (_match, id: string) => {
    if (resolverCartaId(id) !== id) return _match
    const nome = nomeDaCarta(id)
    return `<button type="button" class="fabula-carta-btn" data-fabula-carta="${escapar(id)}" title="Ver carta: ${escapar(nome)}" aria-label="Ver carta: ${escapar(nome)}"><img class="fabula-carta" src="/images/cards/${escapar(id)}.png" alt="${escapar(nome)}" loading="lazy" /></button>`
  })
  // a miniatura sozinha num parágrafo não pode carregar as margens do <p>
  // (espaço antes/depois que o usuário reclamou)
  html = html.replace(/<p>(\s*<button class="fabula-carta-btn".*?<\/button>\s*)<\/p>/gs, '$1')
  return html
}

/** Gera o markdown de UMA mensagem pra colar em qualquer editor (Obsidian etc.).
 *  `[[carta:<id>]]` vira o nome da carta em itálico — fora do app o marcador
 *  não faz sentido. Exportado pro E2E. */
export function mensagemParaMarkdown(m: MensagemIA): string {
  return m.content.replace(/\[\[carta:([\w-]+)\]\]/g, (_match, id: string) => {
    if (resolverCartaId(id) !== id) return _match
    return `*${nomeDaCarta(id)}*`
  })
}

async function copiarMensagem(m: MensagemIA): Promise<void> {
  const ok = await copiarParaAreaDeTransferencia(mensagemParaMarkdown(m))
  notificar(ok ? 'Mensagem copiada em markdown.' : 'Não consegui copiar a mensagem.', ok ? 'ok' : 'erro')
}

/** Clipboard API com fallback (textarea + execCommand) pra contextos sem permissão. */
async function copiarParaAreaDeTransferencia(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = texto
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

/** Abre/fecha o painel. */
export function alternarChat(abrir?: boolean): void {
  if (!painel) montarChat()
  if (!painel) return
  const vaiAbrir = abrir ?? !estado.aberto
  estado.aberto = vaiAbrir
  salvarEstadoPainel(estado)
  renderizar()
  if (vaiAbrir) inputEl?.focus()
}

function selecionarConversa(id: string): void {
  if (!id) return
  renomeando = false
  estado.conversaAtivaId = id
  salvarEstadoPainel(estado)
  renderizar()
}

function novaConversa(): void {
  renomeando = false
  const c = criarConversa()
  estado.conversaAtivaId = c.id
  estado.aberto = true
  salvarEstadoPainel(estado)
  renderizar()
}

/** Abre o input de renomeação no cabeçalho, com o título atual selecionado. */
function iniciarRenomeacao(id: string): void {
  const c = conversaPorId(id)
  if (!c) return
  tituloNaEdicao = c.titulo ?? ''
  renomeando = true
  renderizar()
  const input = painel?.querySelector<HTMLInputElement>('[data-fabula-titulo-input]')
  input?.focus()
  input?.select()
}

async function apagarConversaAtual(): Promise<void> {
  const id = estado.conversaAtivaId
  if (!id) return
  renomeando = false
  const ok = await confirmar('Apagar esta conversa? Isso não pode ser desfeito.', 'Apagar conversa')
  if (!ok) return
  excluirConversa(id)
  // Seleciona a conversa mais recente restante (ou nenhuma).
  const restantes = (appStore.get().conversas ?? []).filter((c) => c.id !== id)
  estado.conversaAtivaId = restantes[0]?.id ?? null
  salvarEstadoPainel(estado)
  renderizar()
  notificar('Conversa apagada.')
}

function conversaAtual(): Conversa | undefined {
  if (!estado.conversaAtivaId) return undefined
  return conversaPorId(estado.conversaAtivaId)
}

/** Envia a mensagem do usuário. */
async function enviar(texto: string): Promise<void> {
  const conversa = conversaAtual()
  if (!conversa) return
  const dados: AppData = appStore.get()
  const ia = dados.configuracao.ia
  if (!ia || ia.provider === 'nenhum' || !ia.apiKey.trim()) {
    notificar('Configure a IA em Config → Fábula antes de conversar.', 'erro')
    return
  }

  // 0. comandos (/) — a lógica (flags, desconto agendado e notas de sistema)
  // fica em `notasDeComando`; o texto CRU do comando vai pro histórico e pra
  // Fábula, e o app orquestra a ação por cima (mana, invocação).
  const notas = coletarNotasDeComando(texto, dados)

  // 1. push user (texto cru — o comando aparece como digitado)
  const userMsg: MensagemIA = { role: 'user', content: texto, ts: new Date().toISOString() }
  adicionarMensagem(conversa.id, userMsg)
  // Garante que a conversa ativa é a que estamos editando (re-ordenada por atualizadaEm).
  estado.conversaAtivaId = conversa.id
  salvarEstadoPainel(estado)
  renderizar()

  // 2. prepara histórico pra IA — ⚠️ RELÊ a conversa DEPOIS do push: o snapshot
  // capturado no início NÃO tem a mensagem atual (adicionarMensagem recria o
  // objeto) — a IA respondia sem ver o que o usuário digitou (bug real:
  // "cada mensagem começa a conversa do zero").
  const atualizada = conversaAtual() ?? conversa
  const systemPrompt = notas.analisePedida
    ? montarSystemPromptEsquizoanalista(dados)
    : montarSystemPrompt(dados)
  const historico: MsgChat[] = [
    { role: 'system', content: systemPrompt },
    ...atualizada.mensagens.map((m) => ({ role: m.role, content: m.content })),
  ]

  // 3. pedido de invocação: executa NO APP (determinístico) e avisa a Fábula
  // via mensagem de sistema — não depende do modelo emitir o marcador.
  const pedidoInvocacao = detectarPedidoInvocacao(texto)
  const notaInvocacao = pedidoInvocacao ? prepararInvocacao(pedidoInvocacao) : null
  if (notaInvocacao) historico.push({ role: 'system', content: notaInvocacao.nota })

  // 3b. notas dos comandos (/) + recompensa por menção no diário — vêm prontas
  // do módulo notasDeComando (a Fábula lê o diário na interação e celebra).
  if (notas.avisoMencoes) notificar(notas.avisoMencoes)
  historico.push(...notas.sistema)

  // 4. streaming
  let resposta = ''
  let raciocinio = ''
  ocupado = true
  renderizar()
  try {
    await enviarParaIA(ia, historico, {
      onContent: (delta) => {
        resposta += delta
        // Atualização in-place (sem re-render completo) pra evitar perder foco / lag
        const area = msgsEl
        if (!area) return
        let ultima = area.querySelector<HTMLElement>('.fabula-bolha--assistente[data-stream="1"]')
        if (!ultima) {
          ultima = document.createElement('div')
          ultima.className = 'fabula-bolha fabula-bolha--assistente'
          ultima.dataset.stream = '1'
          area.appendChild(ultima)
        }
        // Preserva o <details> de raciocínio se já existir; se não, monta depois.
        const raciocinioEl = ultima.querySelector<HTMLElement>('.fabula-reasoning')
        // Exibe sem os marcadores ([[acao:...]] e [[carta:...]]) — o streaming mostra o texto cru
        ultima.textContent = resposta.replace(/\[\[(?:acao|carta):[\s\S]*?\]\]/g, '')
        if (raciocinioEl) ultima.appendChild(raciocinioEl)
        area.scrollTop = area.scrollHeight
      },
      onReasoning: (delta) => {
        raciocinio += delta
        // O raciocínio entra num <details> no fim da bolha; é inserido só quando
        // o content começar (callback onContent acima).
        const area = msgsEl
        if (!area) return
        const ultima = area.querySelector<HTMLElement>('.fabula-bolha--assistente[data-stream="1"]')
        if (!ultima) return
        let raciocinioEl = ultima.querySelector<HTMLElement>('.fabula-reasoning')
        if (!raciocinioEl) {
          const det = document.createElement('details')
          det.className = 'fabula-reasoning'
          det.open = true // visível enquanto escreve
          const sum = document.createElement('summary')
          sum.innerHTML = '<i class="fa-solid fa-brain" aria-hidden="true"></i> Raciocínio'
          const pre = document.createElement('pre')
          det.appendChild(sum)
          det.appendChild(pre)
          ultima.appendChild(det)
          raciocinioEl = det
        }
        const pre = raciocinioEl.querySelector('pre')
        if (pre) pre.textContent = raciocinio
        area.scrollTop = area.scrollHeight
      },
    })
    // Resposta veio: cobra a mana dos comandos AGORA (falha no retorno não cobra)
    if (notas.descontoPendente) {
      const p = appStore.get().personagem
      appStore.set({ ...appStore.get(), personagem: { ...p, mana: p.mana - notas.descontoPendente.custo } })
      notificar(`${notas.descontoPendente.rotulo} (−${notas.descontoPendente.custo} mana)`)
      tocarSom('analise')
      notas.descontoPendente = null
    }
    // Resposta vazia do modelo (ex.: só raciocínio, ou recusa silenciosa):
    // mostra erro em vez de salvar uma bolha vazia (bug real 2026-08-12).
    if (!resposta.trim()) {
      notificar('A Fábula não respondeu nada. Tente de novo.', 'erro')
      return
    }
    // 4. executa as ações da Fábula (marcador [[acao:...]]) e salva a mensagem.
    // Regra (2026-08-12): marcador SÓ executa quando o turno é a ESCOLHA da
    // Fábula (/invocar sem nome); eco do marcador após invocação do app ou
    // marcador emitido por conta própria é ignorado (mana intacta).
    const { texto: textoLimpo, acoes } = extrairAcoes(resposta)
    let conteudoFinal = textoLimpo
    let cartaInvocadaNoTurno: string | null = notaInvocacao?.cartaId ?? null
    for (const acao of acoes) {
      const exec = executarAcao(acao, { appJaInvocou: notaInvocacao !== null, escolhaFabula: notas.escolhaFabula })
      if (exec.nota) conteudoFinal += `\n\n${exec.nota}`
      if (exec.cartaId) cartaInvocadaNoTurno = exec.cartaId
    }
    // Garante a miniatura da carta: se houve invocação no turno (pedido direto
    // OU escolha da Fábula) e a resposta não trouxe o marcador, anexa no fim.
    if (cartaInvocadaNoTurno && !conteudoFinal.includes(`[[carta:${cartaInvocadaNoTurno}]]`)) {
      conteudoFinal += `\n\n[[carta:${cartaInvocadaNoTurno}]]`
    }
    const assistantMsg: MensagemIA = {
      role: 'assistant',
      content: conteudoFinal,
      reasoning: raciocinio || undefined,
      ts: new Date().toISOString(),
    }
    adicionarMensagem(conversa.id, assistantMsg)
  } catch (err) {
    // falha no retorno → NÃO cobra a mana dos comandos
    notas.descontoPendente = null
    const msg = err instanceof ErroIA ? err.message : 'Não consegui falar com a IA.'
    notificar(msg, 'erro')
    if (resposta) {
      // Persiste o que chegou pra o usuário não perder.
      const parcial: MensagemIA = {
        role: 'assistant',
        content: resposta,
        reasoning: raciocinio || undefined,
        ts: new Date().toISOString(),
      }
      adicionarMensagem(conversa.id, parcial)
    }
  } finally {
    ocupado = false
    renderizar()
  }
}

/** Executa uma ação proposta pela Fábula e devolve a nota a anexar + a carta
 *  invocada (para a miniatura). Regras (2026-08-12): o app é a única porta de
 *  invocação — o marcador SÓ executa quando o turno é a ESCOLHA da Fábula
 *  (/invocar sem nome, custo premium ×1,5); marcador ecoado após invocação do
 *  app, ou emitido por conta própria, é ignorado sem gastar mana. */
function executarAcao(
  acao: AcaoIA,
  ctx: { appJaInvocou: boolean; escolhaFabula: boolean },
): { nota: string; cartaId: string | null } {
  if (acao.tipo !== 'invocar') return { nota: '', cartaId: null }
  if (ctx.appJaInvocou) return { nota: '', cartaId: null } // eco do marcador — app já executou
  // Marcador fora do turno de escolha da Fábula (menção, pedido mal entendido):
  // NUNCA executa — mana intacta, aviso amigável.
  if (!ctx.escolhaFabula) {
    return { nota: '⚡ Invocação só por pedido explícito: use "invoca a carta <nome>" ou o comando /invocar.', cartaId: null }
  }
  const id = resolverCartaId(acao.carta)
  if (!id) return { nota: '⚡ Invocação não realizada: carta não encontrada.', cartaId: null }
  const p = appStore.get().personagem
  const nome = nomeDaCarta(id)
  if (!p.cartas.includes(id)) {
    return { nota: `⚡ A carta ${nome} ainda está bloqueada — não invocada.`, cartaId: null }
  }
  const custo = ctx.escolhaFabula
    ? custoInvocacaoFabula(tipoDaCarta(id), p.invocacoes[id] ?? 0)
    : custoInvocacao(tipoDaCarta(id), p.invocacoes[id] ?? 0)
  if (p.mana < custo) {
    return { nota: `⚡ Invocação não realizada: mana insuficiente (precisa de ${custo}).`, cartaId: null }
  }
  const resultado = invocarCarta(id, custo)
  if (!resultado.ok) {
    return { nota: `⚡ Invocação não realizada: ${resultado.motivo ?? 'não foi possível.'}`, cartaId: null }
  }
  return {
    nota: `⚡ Invocação executada: ${nome} (−${custo} mana)${ctx.escolhaFabula ? ' — escolhida pela Fábula (custo premium)' : ''}.`,
    cartaId: id,
  }
}

/** Prepara a invocação pedida pelo usuário: executa no app (mana, log, toast)
 *  e devolve a nota de sistema que a Fábula deve respeitar na resposta.
 *  cartaId = carta efetivamente invocada (para a miniatura); null se não houve
 *  invocação (bloqueada/sem mana/desconhecida). Retorna null se o termo não é
 *  uma carta conhecida (deixa a Fábula lidar). */
function prepararInvocacao(termo: string): { nota: string; cartaId: string | null } | null {
  // Tolerância a artigo: "invoca o Ninho Enclausurado" resolve igual ("invoca a carta X")
  const id = resolverCartaId(termo) ?? resolverCartaId(termo.replace(/^(o|a|os|as)\s+/i, ''))
  if (!id) return null
  const nome = nomeDaCarta(id)
  const p = appStore.get().personagem
  if (!p.cartas.includes(id)) {
    return {
      nota: `O jogador pediu a carta "${nome}", que ainda está BLOQUEADA. Diga que ela não se revelou ainda e desperte a curiosidade. NÃO invoque.`,
      cartaId: null,
    }
  }
  const custo = custoInvocacao(tipoDaCarta(id), p.invocacoes[id] ?? 0)
  if (p.mana < custo) {
    return {
      nota: `O jogador pediu a carta "${nome}" mas a mana (${p.mana}/${p.manaMax}) não cobre o custo (${custo}). Recuse com delicadeza ("guarde suas forças — amanhã a mana volta"), SEM invocar.`,
      cartaId: null,
    }
  }
  const resultado = invocarCarta(id)
  if (!resultado.ok) {
    return { nota: `Não foi possível invocar "${nome}": ${resultado.motivo ?? 'erro desconhecido'}.`, cartaId: null }
  }
  notificar(`Carta invocada: ${nome} (−${custo} mana)`)
  return {
    nota: `A carta "${nome}" FOI invocada agora (custou ${custo} mana; restam ${p.mana - custo}). Responda de forma EXTENSA e compreensiva sobre essa carta: elabore os possíveis efeitos dela na vida do jogador — o que ela torna visível, o que pode mudar na rotina dele, o que observar, como compor com ela como monstro/apoio. NÃO seja lacônico nem enigmático. Use a carta como apoio pra pergunta do jogador e devolva a pergunta a ele no fim. NÃO repita o marcador de ação; inclua sim o marcador [[carta:${id}]] (a interface mostra a miniatura).`,
    cartaId: id,
  }
}

/** Chamado quando o appStore muda — re-renderiza pra refletir mudanças externas
 *  (ex.: o usuário configurou a IA em outra aba/janela). Não mexe em estado local. */
export function reagirMudancaStore(): void {
  if (painel) renderizar()
}
