/** Painel do chat da Fábula — conversas múltiplas, streaming, raciocínio colapsável.
 *  Persistência: cada conversa vive em `AppData.conversas` (via appStore). */

import type { AppData, Conversa, MensagemIA } from '../core/tipos'
import {
  adicionarMensagem,
  appStore,
  conversaPorId,
  criarConversa,
  excluirConversa,
} from '../stores/app'
import { enviarParaIA, ErroIA, type MsgChat } from '../ia/cliente'
import { montarSystemPrompt } from '../ia/prompt'
import { notificar } from './toast'
import { escapar } from './formTarefa'
import { confirmar } from './modal'

const PAINEL_CHAVE = 'esquizomon-rpg:chat-painel'

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

let painel: HTMLElement | null = null
let listaEl: HTMLElement | null = null
let msgsEl: HTMLElement | null = null
let inputEl: HTMLTextAreaElement | null = null
let formEl: HTMLFormElement | null = null
let estado: EstadoPainel = carregarEstadoPainel()
let ocupado = false

/** Monta a casca do painel (uma vez) e injeta no body. Idempotente. */
export function montarChat(): void {
  if (painel) return
  painel = document.createElement('aside')
  painel.id = 'fabula-panel'
  painel.setAttribute('aria-label', 'Chat com a Fábula')
  document.body.appendChild(painel)
  renderizar()
}

function renderizar(): void {
  if (!painel) return
  const dados: AppData = appStore.get()
  const conversas = dados.conversas ?? []
  const conversa = estado.conversaAtivaId ? conversas.find((c) => c.id === estado.conversaAtivaId) ?? undefined : undefined
  const ultima = conversa?.mensagens[conversa.mensagens.length - 1]
  const esperando = ocupado && ultima?.role === 'user'

  painel.classList.toggle('aberto', estado.aberto)
  document.body.classList.toggle('fabula-aberto', estado.aberto)

  painel.innerHTML = `
    <div class="fabula-lateral">
      <button class="btn btn-icon fabula-nova" data-fabula-nova title="Nova conversa" aria-label="Nova conversa">
        <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
      </button>
      <div class="fabula-lista" data-fabula-lista role="list" aria-label="Conversas">
        ${conversas.length === 0
          ? '<div class="fabula-vazio-lista">Sem conversas</div>'
          : conversas.map(itemConversa).join('')}
      </div>
    </div>

    <div class="fabula-conversa">
      <header class="fabula-cabecalho">
        <div class="fabula-titulo">
          <i class="fa-solid fa-feather" aria-hidden="true"></i>
          <div>
            <strong>Fábula</strong>
            <span class="fabula-sub">a Cronista</span>
          </div>
        </div>
        <div class="fabula-cabecalho-acoes">
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
            : conversa.mensagens.map(bolha).join('')}
        ${esperando ? '<div class="fabula-bolha fabula-bolha--assistente fabula-digitando"><span></span><span></span><span></span></div>' : ''}
      </div>

      <form class="fabula-form" data-fabula-form>
        <textarea class="fabula-input" data-fabula-input rows="1" placeholder="${conversa ? 'Converse com Fábula…' : 'Crie uma conversa para começar'}" autocomplete="off" ${!conversa || ocupado ? 'disabled' : ''}></textarea>
        <button class="btn btn-icon" type="submit" aria-label="Enviar" ${!conversa || ocupado ? 'disabled' : ''}><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>
      </form>
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
  const btnExcluir = painel.querySelector('[data-fabula-excluir]') as HTMLButtonElement | null
  if (btnExcluir && conversa) {
    btnExcluir.addEventListener('click', () => void apagarConversaAtual())
  }
  listaEl?.querySelectorAll<HTMLButtonElement>('[data-conversa]').forEach((btn) => {
    btn.addEventListener('click', () => selecionarConversa(btn.dataset.conversa ?? ''))
  })
  if (formEl && inputEl && conversa) {
    // Enter envia / Shift+Enter quebra linha
    inputEl.addEventListener('keydown', (e) => {
      const ev = e as KeyboardEvent
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault()
        formEl?.requestSubmit()
      }
    })
    // Auto-resize do textarea
    inputEl.addEventListener('input', () => {
      inputEl!.style.height = 'auto'
      inputEl!.style.height = Math.min(inputEl!.scrollHeight, 140) + 'px'
    })
    formEl.addEventListener('submit', (e) => {
      e.preventDefault()
      const texto = inputEl!.value.trim()
      if (!texto || ocupado) return
      inputEl!.value = ''
      inputEl!.style.height = 'auto'
      void enviar(texto)
    })
  }
}

function rolarParaFim(): void {
  if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight
}

function bolha(m: MensagemIA): string {
  if (m.role === 'user') {
    return `<div class="fabula-bolha fabula-bolha--usuario">${escapar(m.content)}</div>`
  }
  const raciocinio = m.reasoning
    ? `<details class="fabula-reasoning">
        <summary><i class="fa-solid fa-brain" aria-hidden="true"></i> Raciocínio</summary>
        <pre>${escapar(m.reasoning)}</pre>
      </details>`
    : ''
  return `<div class="fabula-bolha fabula-bolha--assistente">${escapar(m.content)}${raciocinio}</div>`
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

export function chatAberto(): boolean {
  return estado.aberto
}

function selecionarConversa(id: string): void {
  if (!id) return
  estado.conversaAtivaId = id
  salvarEstadoPainel(estado)
  renderizar()
}

function novaConversa(): void {
  const c = criarConversa()
  estado.conversaAtivaId = c.id
  estado.aberto = true
  salvarEstadoPainel(estado)
  renderizar()
}

async function apagarConversaAtual(): Promise<void> {
  const id = estado.conversaAtivaId
  if (!id) return
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

  // 1. push user
  const userMsg: MensagemIA = { role: 'user', content: texto, ts: new Date().toISOString() }
  adicionarMensagem(conversa.id, userMsg)
  // Garante que a conversa ativa é a que estamos editando (re-ordenada por atualizadaEm).
  estado.conversaAtivaId = conversa.id
  salvarEstadoPainel(estado)
  renderizar()

  // 2. prepara histórico pra IA
  const systemPrompt = montarSystemPrompt(dados)
  const historico: MsgChat[] = [
    { role: 'system', content: systemPrompt },
    ...conversa.mensagens.map((m) => ({ role: m.role, content: m.content })),
  ]

  // 3. streaming
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
        ultima.textContent = resposta
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
    // 4. push assistant (com raciocínio) no store
    const assistantMsg: MensagemIA = {
      role: 'assistant',
      content: resposta,
      reasoning: raciocinio || undefined,
      ts: new Date().toISOString(),
    }
    adicionarMensagem(conversa.id, assistantMsg)
  } catch (err) {
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

/** Chamado quando o appStore muda — re-renderiza pra refletir mudanças externas
 *  (ex.: o usuário configurou a IA em outra aba/janela). Não mexe em estado local. */
export function reagirMudancaStore(): void {
  if (painel) renderizar()
}
