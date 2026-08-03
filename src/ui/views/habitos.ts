/** Visão Hábitos — grade de hábitos com repetição +/− e sequência. */

import type { AppData, Tarefa } from '../../core/tipos'
import { calcularStreak, dificuldadeDe } from '../../core/jogo'
import { excluirTarefa, registrarHabito } from '../../stores/app'
import { abrirFormTarefa, escapar } from '../formTarefa'
import { notificar } from '../toast'
import { confirmar } from '../modal'

export function montarHabitos(raiz: HTMLElement, dados: AppData): void {
  const habitos = dados.tarefas.filter((t) => t.tipo === 'habito')

  raiz.innerHTML = `
    <header class="view-header">
      <h1>Hábitos</h1>
      <p class="view-sub">Repetíveis — positivos somam, negativos você evita.</p>
    </header>
    <div class="view-actions">
      <button class="btn btn-primary" data-novo-habito>+ Novo hábito</button>
    </div>
    ${habitos.length === 0 ? vazio('Nenhum hábito cadastrado.') : `
      <div class="habitos-grade">
        ${habitos.map(cardHabito).join('')}
      </div>
    `}
  `

  raiz.querySelector('[data-novo-habito]')!.addEventListener('click', () => {
    abrirFormTarefa()
  })

  raiz.addEventListener('click', (e) => {
    const alvo = e.target as HTMLElement
    const repeticao = alvo.closest('[data-repeticao]') as HTMLElement | null
    if (repeticao) {
      const id = repeticao.dataset.id!
      const sinal = repeticao.dataset.repeticao as 'positivo' | 'negativo'
      registrarHabito(id, sinal)
      if (sinal === 'positivo') notificar('Repetição registrada.')
      else notificar('Marcado como negativo.')
      return
    }
    const editar = alvo.closest('[data-editar]') as HTMLElement | null
    if (editar) {
      const t = dados.tarefas.find((x) => x.id === editar.dataset.id)
      if (t) abrirFormTarefa(t)
      return
    }
    const excluir = alvo.closest('[data-excluir]') as HTMLElement | null
    if (excluir) {
      const t = dados.tarefas.find((x) => x.id === excluir.dataset.id)
      if (t) {
        void confirmar(`Excluir o hábito "${t.titulo}"?`, 'Excluir').then((ok) => {
          if (ok) {
            excluirTarefa(t.id)
            notificar('Hábito excluído.')
          }
        })
      }
    }
  })
}

function cardHabito(t: Tarefa): string {
  const d = dificuldadeDe(t.dificuldade)
  const streak = calcularStreak(t.historico)
  const hoje = t.contador?.hoje ?? 0
  const sinal = t.sinal ?? 'positivo'
  return `
    <div class="habito-card">
      <div class="habito-card-cabecalho">
        <p class="habito-card-titulo">${escapar(t.titulo)}</p>
        <div class="habito-card-acoes">
          <button class="btn btn-icon" data-editar data-id="${t.id}" aria-label="Editar">✎</button>
          <button class="btn btn-icon" data-excluir data-id="${t.id}" aria-label="Excluir">🗑</button>
        </div>
      </div>
      <div class="habito-card-botoes">
        ${sinal === 'positivo' || sinal === 'ambos' ? `<button class="btn btn--habito btn--habito-positivo" data-repeticao="positivo" data-id="${t.id}">+</button>` : ''}
        ${sinal === 'negativo' || sinal === 'ambos' ? `<button class="btn btn--habito btn--habito-negativo" data-repeticao="negativo" data-id="${t.id}">−</button>` : ''}
      </div>
      <div class="habito-card-stats">
        <span>hoje <b>${hoje}</b></span>
        <span>sequência <b>${streak} dia${streak === 1 ? '' : 's'}</b></span>
        <span><b>${d.rotulo}</b></span>
      </div>
      <div class="habito-card-meta">
        ${t.tags.map((tag) => `<span class="badge badge--tag">#${escapar(tag)}</span>`).join('')}
      </div>
    </div>
  `
}

function vazio(texto: string): string {
  return `<div class="vazio"><strong>${escapar(texto)}</strong></div>`
}
