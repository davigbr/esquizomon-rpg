/** Visão Cartas — galeria do baralho Esquizomon com desbloqueio por nível e invocação com mana. */

import type { AppData } from '../../core/tipos'
import { carregarDeck, rotuloTipo, tipoDe, type Carta, type TipoCarta } from '../../core/baralho'
import { custoInvocacao, nivelBaralhoCompleto } from '../../core/jogo'
import { invocarCarta } from '../../stores/app'
import { notificar } from '../toast'
import { escapar } from '../formTarefa'

let deckCache: Carta[] | null = null
let filtroTipo: TipoCarta | '' = ''

export async function montarCartas(raiz: HTMLElement, dados: AppData): Promise<void> {
  if (!deckCache) {
    try {
      deckCache = await carregarDeck()
    } catch {
      raiz.innerHTML = '<div class="vazio"><strong>Não consegui carregar o baralho.</strong></div>'
      return
    }
  }
  const deck = deckCache
  const desbloqueadas = new Set(dados.personagem.cartas)
  const mana = dados.personagem.mana
  const total = deck.length

  const lista = filtroTipo ? deck.filter((c) => c.type === filtroTipo) : deck

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
      <span class="filtros-rotulo" style="margin-left:auto">Mana: ${mana}</span>
    </div>

    <div class="cartas-grade">
      ${lista.map((c) => cardCarta(c, desbloqueadas.has(c.id), dados.personagem.invocacoes[c.id] ?? 0, mana)).join('')}
    </div>
  `

  raiz.querySelectorAll('[data-filtro-tipo]').forEach((chip) => {
    chip.addEventListener('click', () => {
      filtroTipo = (chip.getAttribute('data-filtro-tipo') ?? '') as TipoCarta | ''
      void montarCartas(raiz, dados)
    })
  })

  raiz.querySelectorAll('[data-invocar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-invocar')!
      const resultado = invocarCarta(id)
      notificar(resultado.ok ? `🜏 Carta invocada (${resultado.motivo ?? ''})`.trim() : resultado.motivo ?? 'Não deu para invocar.', resultado.ok ? 'ok' : 'erro')
    })
  })
}

function cardCarta(c: Carta, desbloqueada: boolean, invocacoes: number, mana: number): string {
  const custo = custoInvocacao(tipoDe(c), invocacoes)
  const pode = desbloqueada && mana >= custo
  return `
    <div class="carta-item${desbloqueada ? '' : ' carta-item--bloqueada'}">
      ${desbloqueada
        ? `<img class="carta-img" src="/images/cards/${escapar(c.id)}.png" alt="${escapar(c.name)}" loading="lazy" />`
        : `<div class="carta-lock"><i class="fa-solid fa-lock" aria-hidden="true"></i><span>Bloqueada</span></div>`}
      <div class="carta-nome">
        <span class="badge badge--${c.type}">${rotuloTipo(c.type)}</span>
        <span class="carta-titulo">${escapar(c.name)}</span>
      </div>
      <div class="carta-rodape">
        <span class="carta-custo" title="Custo de invocação (cresce com o uso até um teto)">
          <i class="fa-solid fa-droplet" aria-hidden="true"></i> ${custo}${invocacoes > 0 ? ` · ${invocacoes}×` : ''}
        </span>
        ${desbloqueada
          ? `<button class="btn btn-icon" data-invocar="${escapar(c.id)}" aria-label="Invocar ${escapar(c.name)}" ${pode ? '' : 'disabled'} title="${pode ? 'Invocar' : 'Mana insuficiente'}"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i></button>`
          : ''}
      </div>
    </div>
  `
}
