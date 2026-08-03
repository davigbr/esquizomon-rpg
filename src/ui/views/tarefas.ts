/** Visão Tarefas — todas as recorrentes e únicas, com filtros por tag e dificuldade. */

import type { AppData, Dificuldade, Tarefa } from '../../core/tipos'
import { dificuldadeDe } from '../../core/jogo'
import { alternarRecorrenteHoje, alternarUnica, excluirTarefa, tagsEmUso } from '../../stores/app'
import { abrirFormTarefa, escapar } from '../formTarefa'
import { notificar } from '../toast'
import { confirmar } from '../modal'

export function montarTarefas(raiz: HTMLElement, dados: AppData): void {
  const tags = tagsEmUso(dados)

  raiz.innerHTML = `
    <header class="view-header">
      <h1>Tarefas</h1>
      <p class="view-sub">Recorrentes e únicas — ${dados.tarefas.filter((t) => t.tipo !== 'habito').length} no total.</p>
    </header>
    <div class="view-actions">
      <button class="btn btn-primary" data-nova-tarefa>+ Nova tarefa</button>
    </div>
    <div class="filtros">
      ${tags.map((tag) => `<button class="filtro-chip" data-filtro-tag="${escapar(tag)}">#${escapar(tag)}</button>`).join('')}
      <select class="filtro-select" data-filtro-dificuldade>
        <option value="">Todas as dificuldades</option>
        ${(['facil', 'media', 'dificil', 'extrema'] as Dificuldade[])
          .map((d) => `<option value="${d}">${dificuldadeDe(d).rotulo}</option>`)
          .join('')}
      </select>
    </div>
    <div data-lista-tarefas></div>
  `

  raiz.querySelector('[data-nova-tarefa]')!.addEventListener('click', () => abrirFormTarefa())

  const lista = raiz.querySelector('[data-lista-tarefas]')!
  const chips = [...raiz.querySelectorAll('[data-filtro-tag]')] as HTMLElement[]
  const select = raiz.querySelector<HTMLSelectElement>('[data-filtro-dificuldade]')!

  function aplicarFiltros(): void {
    const tagAtiva = chips.find((c) => c.classList.contains('ativo'))?.dataset.filtroTag
    const dif = select.value as Dificuldade | ''
    const f = (t: Tarefa) => {
      if (t.tipo === 'habito') return false
      if (tagAtiva && !t.tags.includes(tagAtiva)) return false
      if (dif && t.dificuldade !== dif) return false
      return true
    }
    const filtradas = dados.tarefas.filter(f)
    const recorrentes = filtradas.filter((t) => t.tipo === 'recorrente')
    const unicas = filtradas.filter((t) => t.tipo === 'unica')
    const unicasPendentes = unicas.filter((t) => !t.concluida)
    const unicasFeitas = unicas.filter((t) => t.concluida)

    lista.innerHTML = `
      <section class="secao">
        <h2 class="secao-titulo">Recorrentes <span class="secao-contagem">${recorrentes.length}</span></h2>
        ${recorrentes.length === 0 ? vazio('Nenhuma tarefa recorrente.') : recorrentes.map((t) => cardRecorrente(t)).join('')}
      </section>
      <section class="secao">
        <h2 class="secao-titulo">Únicas pendentes <span class="secao-contagem">${unicasPendentes.length}</span></h2>
        ${unicasPendentes.length === 0 ? vazio('Nenhuma tarefa única pendente.') : unicasPendentes.map((t) => cardUnica(t, false)).join('')}
      </section>
      ${unicasFeitas.length > 0 ? `
        <section class="secao">
          <h2 class="secao-titulo">Concluídas <span class="secao-contagem">${unicasFeitas.length}</span></h2>
          ${unicasFeitas.map((t) => cardUnica(t, true)).join('')}
        </section>` : ''}
    `
  }

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const ativo = chip.classList.toggle('ativo')
      chips.forEach((c) => {
        if (c !== chip) c.classList.remove('ativo')
      })
      if (!ativo) chip.classList.remove('ativo')
      aplicarFiltros()
    })
  })
  select.addEventListener('change', aplicarFiltros)

  lista.addEventListener('click', (e) => {
    const alvo = e.target as HTMLElement
    const check = alvo.closest('[data-alternar]') as HTMLElement | null
    if (check) {
      const id = check.dataset.id!
      if (check.dataset.alternar === 'rec') alternarRecorrenteHoje(id)
      else alternarUnica(id)
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
        void confirmar(`Excluir a tarefa "${t.titulo}"?`, 'Excluir').then((ok) => {
          if (ok) {
            excluirTarefa(t.id)
            notificar('Tarefa excluída.')
          }
        })
      }
    }
  })

  aplicarFiltros()
}

function cardRecorrente(t: Tarefa): string {
  const d = dificuldadeDe(t.dificuldade)
  const dias = t.agenda && t.agenda.dias.length > 0 ? agendaTexto(t) : 'todos os dias'
  return `
    <div class="tarefa-card">
      <div class="tarefa-corpo">
        <p class="tarefa-titulo">${escapar(t.titulo)}</p>
        ${t.notas ? `<p class="tarefa-notas">${escapar(t.notas)}</p>` : ''}
        <div class="tarefa-meta">
          <span class="badge badge--tipo">recorrente</span>
          <span class="badge badge--${t.dificuldade}">${d.rotulo}</span>
          <span class="badge badge--agenda">${escapar(dias)}</span>
          ${t.tags.map((tag) => `<span class="badge badge--tag">#${escapar(tag)}</span>`).join('')}
        </div>
      </div>
      <div class="tarefa-acoes">
        <button class="btn btn-icon" data-alternar="rec" data-id="${t.id}" aria-label="Alternar dia de hoje">◐</button>
        <button class="btn btn-icon" data-editar data-id="${t.id}" aria-label="Editar">✎</button>
        <button class="btn btn-icon" data-excluir data-id="${t.id}" aria-label="Excluir">🗑</button>
      </div>
    </div>
  `
}

function cardUnica(t: Tarefa, concluida: boolean): string {
  const d = dificuldadeDe(t.dificuldade)
  return `
    <div class="tarefa-card${concluida ? ' concluida' : ''}">
      <div class="tarefa-corpo">
        <p class="tarefa-titulo">${escapar(t.titulo)}</p>
        ${t.notas ? `<p class="tarefa-notas">${escapar(t.notas)}</p>` : ''}
        <div class="tarefa-meta">
          <span class="badge badge--tipo">única</span>
          <span class="badge badge--${t.dificuldade}">${d.rotulo}</span>
          ${t.tags.map((tag) => `<span class="badge badge--tag">#${escapar(tag)}</span>`).join('')}
        </div>
      </div>
      <div class="tarefa-acoes">
        <button class="btn btn-icon" data-alternar="unica" data-id="${t.id}" aria-label="${concluida ? 'Reabrir' : 'Concluir'}">${concluida ? '↺' : '✓'}</button>
        <button class="btn btn-icon" data-editar data-id="${t.id}" aria-label="Editar">✎</button>
        <button class="btn btn-icon" data-excluir data-id="${t.id}" aria-label="Excluir">🗑</button>
      </div>
    </div>
  `
}

function agendaTexto(t: Tarefa): string {
  const nomes = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
  return [...t.agenda!.dias].sort((a, b) => a - b).map((d) => nomes[d]).join(', ')
}

function vazio(texto: string): string {
  return `<div class="vazio"><strong>${escapar(texto)}</strong></div>`
}
