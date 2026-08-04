/** Visão Cartas — galeria do baralho Esquizomon com desbloqueio por nível, modal e invocação com mana. */

import type { AppData } from '../../core/tipos'
import { carregarDeck, rotuloTipo, tipoDe, type Carta, type TipoCarta } from '../../core/baralho'
import { custoInvocacao, nivelBaralhoCompleto } from '../../core/jogo'
import { appStore, invocarCarta } from '../../stores/app'
import { abrirModal, fecharModal, modalBody } from '../modal'
import { notificar } from '../toast'
import { escapar } from '../formTarefa'

let deckCache: Carta[] | null = null
let filtroTipo: TipoCarta | '' = ''

/** Ordem dos tipos na galeria: monstros primeiro, depois capturas, por fim alianças. */
const ORDEM_TIPO: Record<TipoCarta, number> = { monstro: 0, captura: 1, alianca: 2 }

export async function montarCartas(raiz: HTMLElement, dados: AppData): Promise<void> {
  if (!deckCache) {
    try {
      deckCache = await carregarDeck()
    } catch {
      raiz.innerHTML = '<div class="vazio"><strong>Não consegui carregar o baralho.</strong></div>'
      return
    }
    // o deck acabou de chegar — o store pode ter mudado (sorteio inicial) enquanto esperávamos
    dados = appStore.get()
  }
  const deck = deckCache
  const desbloqueadas = new Set(dados.personagem.cartas)
  const total = deck.length

  const lista = (filtroTipo ? deck.filter((c) => c.type === filtroTipo) : deck)
    .sort((a, b) => {
      // sempre desbloqueadas primeiro; dentro de cada grupo, monstros → capturas → alianças
      const da = desbloqueadas.has(a.id) ? 0 : 1
      const db = desbloqueadas.has(b.id) ? 0 : 1
      return da - db || ORDEM_TIPO[a.type] - ORDEM_TIPO[b.type]
    })

  raiz.innerHTML = `
    <header class="view-header">
      <h1>Cartas</h1>
      <p class="view-sub">${desbloqueadas.size}/${total} desbloqueadas · nível ${nivelBaralhoCompleto()} completa o baralho</p>
    </header>

    <div class="filtros">
      <button class="filtro-chip${filtroTipo === '' ? ' ativo' : ''}" data-filtro-tipo="">Todas</button>
      <button class="filtro-chip${filtroTipo === 'monstro' ? ' ativo' : ''}" data-filtro-tipo="monstro">Monstros</button>
      <button class="filtro-chip${filtroTipo === 'captura' ? ' ativo' : ''}" data-filtro-tipo="captura">Capturas</button>
      <button class="filtro-chip${filtroTipo === 'alianca' ? ' ativo' : ''}" data-filtro-tipo="alianca">Alianças</button>
    </div>

    <div class="cartas-grade">
      ${lista.map((c) => cardCarta(c, desbloqueadas.has(c.id))).join('')}
    </div>
  `

  raiz.querySelectorAll('[data-filtro-tipo]').forEach((chip) => {
    chip.addEventListener('click', () => {
      filtroTipo = (chip.getAttribute('data-filtro-tipo') ?? '') as TipoCarta | ''
      void montarCartas(raiz, appStore.get())
    })
  })

  raiz.querySelectorAll('[data-invocar]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const id = btn.getAttribute('data-invocar')!
      const resultado = invocarCarta(id)
      notificar(resultado.ok ? `🜏 Carta invocada.` : resultado.motivo ?? 'Não deu para invocar.', resultado.ok ? 'ok' : 'erro')
    })
  })

  raiz.querySelectorAll('[data-carta]').forEach((item) => {
    item.addEventListener('click', (e) => {
      const alvo = e.target as HTMLElement
      if (alvo.closest('[data-invocar]')) return // o botão invocar trata o clique dele
      const id = item.getAttribute('data-carta')!
      // cartas bloqueadas ficam ocultas — nenhum modal revela a carta
      if (!appStore.get().personagem.cartas.includes(id)) {
        notificar('Carta bloqueada — suba de nível para desbloquear.')
        return
      }
      abrirModalCarta(id)
    })
  })
}

function cardCarta(c: Carta, desbloqueada: boolean): string {
  const invocacoes = appStore.get().personagem.invocacoes[c.id] ?? 0
  const custo = custoInvocacao(tipoDe(c), invocacoes)
  const mana = appStore.get().personagem.mana
  const pode = desbloqueada && mana >= custo
  return `
    <div class="carta-item${desbloqueada ? '' : ' carta-item--bloqueada'}" data-carta="${escapar(c.id)}" title="${escapar(c.name)}">
      ${desbloqueada
        ? `<img class="carta-img" src="/images/cards/${escapar(c.id)}.png" alt="${escapar(c.name)}" loading="lazy" />`
        : `<div class="carta-lock"><i class="fa-solid fa-lock" aria-hidden="true"></i><span class="carta-lock-nome">${escapar(c.name)}</span></div>`}
      <div class="carta-rodape">
        <span class="badge badge--${c.type}">${rotuloTipo(c.type)}</span>
        ${desbloqueada
          ? `<button class="btn btn-icon" data-invocar="${escapar(c.id)}" aria-label="Invocar ${escapar(c.name)}" ${pode ? '' : 'disabled'} title="${pode ? 'Invocar' : 'Mana insuficiente'}"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i></button>`
          : ''}
      </div>
    </div>
  `
}

function abrirModalCarta(id: string): void {
  const deck = deckCache ?? []
  const dados = appStore.get()
  // apenas cartas desbloqueadas navegam no modal
  const desbloqueadas = deck.filter((c) => dados.personagem.cartas.includes(c.id))
  const indice = desbloqueadas.findIndex((c) => c.id === id)
  const carta = desbloqueadas[indice] ?? deck.find((c) => c.id === id)
  if (!carta) return
  const anterior = desbloqueadas[indice - 1]
  const proxima = desbloqueadas[indice + 1]
  const invocacoes = dados.personagem.invocacoes[id] ?? 0
  const custo = custoInvocacao(tipoDe(carta), invocacoes)

  abrirModal(`
    <div class="carta-modal">
      <button class="carta-modal-seta" data-modal-anterior aria-label="Carta anterior" ${anterior ? '' : 'disabled'}>
        <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
      </button>
      <div class="carta-modal-central">
        <img class="carta-modal-img" src="/images/cards/${escapar(id)}.png" alt="${escapar(carta.name)}" />
        <div class="carta-modal-info">
          <span class="badge badge--${carta.type}">${rotuloTipo(carta.type)}</span>
          <h2>${escapar(carta.name)}</h2>
          <p class="carta-modal-custo"><i class="fa-solid fa-droplet" aria-hidden="true"></i> ${custo} mana${invocacoes > 0 ? ` · invocada ${invocacoes}×` : ''}</p>
          <button class="btn btn-primary" data-modal-invocar>Invocar</button>
        </div>
      </div>
      <button class="carta-modal-seta" data-modal-proxima aria-label="Próxima carta" ${proxima ? '' : 'disabled'}>
        <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  `)

  modalBody.querySelector('[data-modal-anterior]')?.addEventListener('click', () => {
    if (anterior) abrirModalCarta(anterior.id)
  })
  modalBody.querySelector('[data-modal-proxima]')?.addEventListener('click', () => {
    if (proxima) abrirModalCarta(proxima.id)
  })
  modalBody.querySelector('[data-modal-invocar]')?.addEventListener('click', () => {
    const resultado = invocarCarta(id)
    if (resultado.ok) {
      notificar(`🜏 ${carta.name} invocada.`)
      fecharModal()
      void montarCartas(document.getElementById('app')!, appStore.get())
    } else {
      notificar(resultado.motivo ?? 'Não deu para invocar.', 'erro')
    }
  })
}
