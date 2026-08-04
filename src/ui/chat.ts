/** Painel do chat da Fábula — interação livre com a IA, com acesso ao contexto do app. */

import type { AppData } from '../core/tipos'
import { appStore } from '../stores/app'
import { conversarComFabula, ErroIA, type MsgChat } from '../ia/cliente'
import { montarSystemPrompt } from '../ia/prompt'
import { notificar } from './toast'
import { escapar } from './formTarefa'

const CHAT_KEY = 'esquizomon-rpg:chat'
const MAX_HISTORICO = 20

let painel: HTMLElement | null = null
let mensagens: MsgChat[] = []
let ocupado = false

function carregarConversa(): MsgChat[] {
  try {
    const bruto = localStorage.getItem(CHAT_KEY)
    if (!bruto) return []
    const arr = JSON.parse(bruto) as MsgChat[]
    return arr.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
  } catch {
    return []
  }
}

function salvarConversa(): void {
  try {
    localStorage.setItem(CHAT_KEY, JSON.stringify(mensagens.slice(-MAX_HISTORICO)))
  } catch {
    /* storage bloqueado — conversa só em memória */
  }
}

export function chatAberto(): boolean {
  return painel !== null && painel.classList.contains('aberto')
}

/** Monta o painel (uma vez) e injeta no body. */
export function montarChat(): void {
  if (painel) return
  painel = document.createElement('aside')
  painel.id = 'fabula-panel'
  painel.setAttribute('aria-label', 'Chat com a Fábula')
  document.body.appendChild(painel)
  mensagens = carregarConversa()
  renderizar()
}

function renderizar(): void {
  if (!painel) return
  const ultima = mensagens[mensagens.length - 1]
  const esperando = ocupado && ultima?.role === 'user'

  painel.innerHTML = `
    <header class="fabula-cabecalho">
      <div class="fabula-titulo">
        <i class="fa-solid fa-feather" aria-hidden="true"></i>
        <div>
          <strong>Fábula</strong>
          <span class="fabula-sub">a Cronista</span>
        </div>
      </div>
      <button class="btn btn-icon" data-fabula-fechar aria-label="Fechar chat"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    </header>

    <div class="fabula-mensagens" data-fabula-mensagens>
      ${mensagens.length === 0 ? '<div class="fabula-vazio">Senta. Como você chega hoje? — e não vale responder "bem" sem me dizer o que "bem" quer dizer.</div>' : ''}
      ${mensagens.map((m) => bolha(m)).join('')}
      ${esperando ? '<div class="fabula-bolha fabula-bolha--assistente fabula-digitando"><span></span><span></span><span></span></div>' : ''}
    </div>

    <form class="fabula-form" data-fabula-form>
      <input class="fabula-input" data-fabula-input placeholder="Converse com Fábula…" autocomplete="off" ${ocupado ? 'disabled' : ''} />
      <button class="btn btn-icon" type="submit" aria-label="Enviar" ${ocupado ? 'disabled' : ''}><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>
    </form>
  `

  painel.querySelector('[data-fabula-fechar]')!.addEventListener('click', () => alternarChat(false))

  const form = painel.querySelector('[data-fabula-form]') as HTMLFormElement
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const input = painel!.querySelector('[data-fabula-input]') as HTMLInputElement
    const texto = input.value.trim()
    if (!texto || ocupado) return
    input.value = ''
    void enviar(texto)
  })

  const area = painel.querySelector('[data-fabula-mensagens]')!
  area.scrollTop = area.scrollHeight
}

function bolha(m: MsgChat): string {
  const papel = m.role === 'user' ? 'usuario' : 'assistente'
  return `<div class="fabula-bolha fabula-bolha--${papel}">${escapar(m.content)}</div>`
}

/** Abre/fecha o painel. */
export function alternarChat(abrir?: boolean): void {
  if (!painel) montarChat()
  if (!painel) return
  const vaiAbrir = abrir ?? !chatAberto()
  painel.classList.toggle('aberto', vaiAbrir)
  document.body.classList.toggle('fabula-aberto', vaiAbrir)
  if (vaiAbrir) {
    const input = painel.querySelector<HTMLInputElement>('[data-fabula-input]')
    input?.focus()
  }
}

/** Envia a mensagem do usuário para a Fábula com streaming. */
async function enviar(texto: string): Promise<void> {
  const dados: AppData = appStore.get()
  const ia = dados.configuracao.ia
  if (!ia || ia.provider === 'nenhum') {
    notificar('Configure a IA em Config → Fábula antes de conversar.', 'erro')
    return
  }

  mensagens.push({ role: 'user', content: texto })
  salvarConversa()
  ocupado = true
  renderizar()

  const historico: MsgChat[] = [{ role: 'system', content: montarSystemPrompt(dados) }, ...mensagens.slice(-MAX_HISTORICO)]

  let resposta = ''
  try {
    await conversarComFabula(ia, historico, (delta) => {
      resposta += delta
      const area = painel?.querySelector('[data-fabula-mensagens]')
      const ultima = area?.lastElementChild as HTMLElement | undefined
      if (ultima && ultima.classList.contains('fabula-bolha--assistente') && ultima.dataset.stream === '1') {
        ultima.textContent = resposta
      } else {
        const nova = document.createElement('div')
        nova.className = 'fabula-bolha fabula-bolha--assistente'
        nova.dataset.stream = '1'
        nova.textContent = resposta
        area?.appendChild(nova)
      }
      if (area) area.scrollTop = area.scrollHeight
    })
    mensagens.push({ role: 'assistant', content: resposta })
  } catch (err) {
    const msg = err instanceof ErroIA ? err.message : 'Não consegui falar com a IA. Confira se o proxy está rodando (npm run serve-ia).'
    notificar(msg, 'erro')
    if (resposta) mensagens.push({ role: 'assistant', content: resposta })
  } finally {
    ocupado = false
    salvarConversa()
    renderizar()
  }
}
