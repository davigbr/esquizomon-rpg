/** Visão Histórico — log extensivo de todas as ações do jogo. */

import type { AppData, LogEvento, TipoLog } from '../../core/tipos'
import { appStore } from '../../stores/app'
import { escapar } from '../util'

/** Ícone FA e rótulo por tipo de evento. */
const TIPOS: Record<TipoLog, { icone: string; rotulo: string }> = {
  tarefa: { icone: 'fa-list-check', rotulo: 'Tarefas' },
  habito: { icone: 'fa-repeat', rotulo: 'Hábitos' },
  invocacao: { icone: 'fa-wand-magic-sparkles', rotulo: 'Invocações' },
  carta: { icone: 'fa-layer-group', rotulo: 'Cartas' },
  nivel: { icone: 'fa-arrow-trend-up', rotulo: 'Nível' },
  dano: { icone: 'fa-heart-crack', rotulo: 'Dano' },
  sistema: { icone: 'fa-gear', rotulo: 'Sistema' },
}

let filtroTipo: TipoLog | '' = ''

/** Formata a hora de um evento (HH:MM). */
function horaDe(ts: string): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Data curta do dia (dd/mm) para o agrupamento. */
function diaDe(ts: string): string {
  const d = new Date(ts)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export function montarHistorico(raiz: HTMLElement, dados: AppData): void {
  const log = filtroTipo ? dados.log.filter((e) => e.tipo === filtroTipo) : dados.log

  // agrupa por dia (mais recente primeiro)
  const grupos = new Map<string, LogEvento[]>()
  for (const e of log) {
    const dia = diaDe(e.ts)
    const lista = grupos.get(dia) ?? []
    lista.push(e)
    grupos.set(dia, lista)
  }
  const dias = [...grupos.entries()]

  // contadores por tipo
  const contagem = dados.log.reduce(
    (acc, e) => {
      acc[e.tipo] = (acc[e.tipo] ?? 0) + 1
      return acc
    },
    {} as Partial<Record<TipoLog, number>>,
  )

  raiz.innerHTML = `
    <header class="view-header">
      <h1>Histórico</h1>
      <p class="view-sub">${dados.log.length} evento${dados.log.length === 1 ? '' : 's'} registrados · as últimas ações do seu território</p>
    </header>

    <div class="filtros historico-filtros">
      <button class="filtro-chip${filtroTipo === '' ? ' ativo' : ''}" data-filtro-tipo="">Tudo (${dados.log.length})</button>
      ${(Object.keys(TIPOS) as TipoLog[]).map((t) => `<button class="filtro-chip${filtroTipo === t ? ' ativo' : ''}" data-filtro-tipo="${t}">${TIPOS[t].rotulo} (${contagem[t] ?? 0})</button>`).join('')}
    </div>

    ${dias.length === 0 ? '<div class="vazio"><strong>Nenhum evento ainda.</strong><p>Conclua tarefas, invoque cartas e suba de nível — tudo fica registrado aqui.</p></div>' : ''}

    ${dias
      .map(
        ([dia, eventos]) => `
      <div class="historico-dia">
        <h3 class="historico-dia-titulo">${escapar(dia)}</h3>
        <ul class="historico-lista">
          ${eventos
            .map(
              (e) => `
            <li class="historico-item">
              <span class="historico-icone historico-icone--${e.tipo}" title="${TIPOS[e.tipo].rotulo}"><i class="fa-solid ${TIPOS[e.tipo].icone}" aria-hidden="true"></i></span>
              <span class="historico-texto">${escapar(e.texto)}</span>
              <time class="historico-hora" datetime="${escapar(e.ts)}">${horaDe(e.ts)}</time>
            </li>`,
            )
            .join('')}
        </ul>
      </div>`,
      )
      .join('')}
  `

  raiz.querySelectorAll('[data-filtro-tipo]').forEach((chip) => {
    chip.addEventListener('click', () => {
      filtroTipo = (chip.getAttribute('data-filtro-tipo') ?? '') as TipoLog | ''
      montarHistorico(raiz, appStore.get())
    })
  })
}
