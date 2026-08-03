/** Visão Hoje — recorrentes do dia, hábitos e únicas pendentes. */

import type { AppData, Tarefa } from '../../core/tipos'
import { diaDaSemana, hojeISO, hojePorExtenso, dificuldadeDe, calcularStreak } from '../../core/jogo'
import { alternarRecorrenteHoje, alternarUnica, registrarHabito } from '../../stores/app'
import { abrirFormTarefa, escapar } from '../formTarefa'
import { notificar } from '../toast'

export function montarHoje(raiz: HTMLElement, dados: AppData): void {
  const hoje = hojeISO()
  const dia = diaDaSemana()

  const recorrentes = dados.tarefas.filter((t) => t.tipo === 'recorrente' && valeHoje(t, dia))
  const pendentes = dados.tarefas.filter((t) => t.tipo === 'unica' && !t.concluida)
  const habitos = dados.tarefas.filter((t) => t.tipo === 'habito')

  raiz.innerHTML = `
    <header class="view-header">
      <h1>Hoje</h1>
      <p class="view-sub">${escapar(hojePorExtenso())}</p>
    </header>
    <div class="view-actions">
      <button class="btn btn-primary" data-nova-tarefa>+ Nova tarefa</button>
    </div>

    <section class="secao">
      <h2 class="secao-titulo">Recorrentes de hoje <span class="secao-contagem">${recorrentes.length}</span></h2>
      ${recorrentes.length === 0 ? vazio('Nada marcado para hoje.') : recorrentes.map((t) => cardRecorrente(t, hoje)).join('')}
    </section>

    <section class="secao">
      <h2 class="secao-titulo">Únicas pendentes <span class="secao-contagem">${pendentes.length}</span></h2>
      ${pendentes.length === 0 ? vazio('Nenhuma tarefa única pendente.') : pendentes.map((t) => cardUnica(t)).join('')}
    </section>

    <section class="secao">
      <h2 class="secao-titulo">Hábitos</h2>
      ${habitos.length === 0 ? vazio('Nenhum hábito cadastrado.') : habitos.map((t) => cardHabito(t)).join('')}
    </section>
  `

  raiz.querySelector('[data-nova-tarefa]')!.addEventListener('click', () => abrirFormTarefa())

  raiz.querySelectorAll('[data-alternar-rec]').forEach((el) => {
    el.addEventListener('click', () => alternarRecorrenteHoje((el as HTMLElement).dataset.id!))
  })
  raiz.querySelectorAll('[data-alternar-unica]').forEach((el) => {
    el.addEventListener('click', () => alternarUnica((el as HTMLElement).dataset.id!))
  })
  raiz.querySelectorAll('[data-habito]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.id!
      const sinal = (el as HTMLElement).dataset.habito as 'positivo' | 'negativo'
      registrarHabito(id, sinal)
      if (sinal === 'positivo') notificar('Repetição registrada.')
    })
  })
  raiz.querySelectorAll('[data-editar]').forEach((el) => {
    el.addEventListener('click', () => {
      const t = dados.tarefas.find((x) => x.id === (el as HTMLElement).dataset.id)
      if (t) abrirFormTarefa(t)
    })
  })
}

function valeHoje(t: Tarefa, dia: number): boolean {
  return !t.agenda || t.agenda.dias.length === 0 || t.agenda.dias.includes(dia)
}

function cardRecorrente(t: Tarefa, hoje: string): string {
  const feita = t.historico.includes(hoje)
  const d = dificuldadeDe(t.dificuldade)
  return `
    <div class="tarefa-card${feita ? ' concluida' : ''}">
      <button class="tarefa-check${feita ? ' marcado' : ''}" data-alternar-rec data-id="${t.id}" aria-label="Concluir hoje">✓</button>
      <div class="tarefa-corpo">
        <p class="tarefa-titulo">${escapar(t.titulo)}</p>
        ${t.notas ? `<p class="tarefa-notas">${escapar(t.notas)}</p>` : ''}
        <div class="tarefa-meta">
          <span class="badge badge--${t.dificuldade}">${d.rotulo}</span>
          ${t.tags.map((tag) => `<span class="badge badge--tag">#${escapar(tag)}</span>`).join('')}
          ${agendaRotulo(t)}
        </div>
      </div>
      <div class="tarefa-acoes">
        <button class="btn btn-icon" data-editar data-id="${t.id}" aria-label="Editar">✎</button>
      </div>
    </div>
  `
}

function agendaRotulo(t: Tarefa): string {
  if (!t.agenda || t.agenda.dias.length === 0) return '<span class="badge badge--agenda">todos os dias</span>'
  const nomes = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
  const dias = [...t.agenda.dias].sort((a, b) => a - b).map((d) => nomes[d])
  return `<span class="badge badge--agenda">${escapar(dias.join(', '))}</span>`
}

function cardUnica(t: Tarefa): string {
  const d = dificuldadeDe(t.dificuldade)
  return `
    <div class="tarefa-card">
      <button class="tarefa-check" data-alternar-unica data-id="${t.id}" aria-label="Concluir">✓</button>
      <div class="tarefa-corpo">
        <p class="tarefa-titulo">${escapar(t.titulo)}</p>
        ${t.notas ? `<p class="tarefa-notas">${escapar(t.notas)}</p>` : ''}
        <div class="tarefa-meta">
          <span class="badge badge--${t.dificuldade}">${d.rotulo}</span>
          ${t.tags.map((tag) => `<span class="badge badge--tag">#${escapar(tag)}</span>`).join('')}
        </div>
      </div>
      <div class="tarefa-acoes">
        <button class="btn btn-icon" data-editar data-id="${t.id}" aria-label="Editar">✎</button>
      </div>
    </div>
  `
}

function cardHabito(t: Tarefa): string {
  const d = dificuldadeDe(t.dificuldade)
  const streak = calcularStreak(t.historico)
  const hoje = t.contador?.hoje ?? 0
  const sinal = t.sinal ?? 'positivo'
  return `
    <div class="tarefa-card">
      <div class="tarefa-corpo">
        <p class="tarefa-titulo">${escapar(t.titulo)}</p>
        <div class="tarefa-meta">
          <span class="badge badge--${t.dificuldade}">${d.rotulo}</span>
          <span class="badge">hoje: ${hoje}</span>
          <span class="badge">sequência: ${streak} dia${streak === 1 ? '' : 's'}</span>
          ${t.tags.map((tag) => `<span class="badge badge--tag">#${escapar(tag)}</span>`).join('')}
        </div>
      </div>
      <div class="tarefa-acoes" style="gap:8px">
        ${sinal === 'positivo' || sinal === 'ambos' ? `<button class="btn btn--habito btn--habito-positivo" data-habito="positivo" data-id="${t.id}" aria-label="Repetição positiva">+</button>` : ''}
        ${sinal === 'negativo' || sinal === 'ambos' ? `<button class="btn btn--habito btn--habito-negativo" data-habito="negativo" data-id="${t.id}" aria-label="Repetição negativa">−</button>` : ''}
        <button class="btn btn-icon" data-editar data-id="${t.id}" aria-label="Editar">✎</button>
      </div>
    </div>
  `
}

function vazio(texto: string): string {
  return `<div class="vazio"><strong>${escapar(texto)}</strong></div>`
}
