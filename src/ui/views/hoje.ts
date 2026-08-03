/** Visão inicial — 3 colunas estilo Habitica: Hábitos | Recorrentes | Tarefas.
 *  Tudo é feito a partir desta tela: adicionar (modal com tipo pré-selecionado),
 *  alternar, repetir hábito, editar, excluir e filtrar.
 *  A data visível pode ser navegada (◀ ▶, máximo hoje) — tudo passa a refletir o dia selecionado. */

import type { AppData, Dificuldade, Tarefa, TipoTarefa } from '../../core/tipos'
import {
  calcularStreak,
  dataPorExtenso,
  diaDaSemana,
  diaDoMes,
  diaSemanaPorExtenso,
  diasAte,
  diasDesde,
  dificuldadeDe,
  hojeISO,
  somarDias,
} from '../../core/jogo'
import { alternarRecorrenteHoje, alternarUnica, appStore, excluirTarefa, registrarHabito, reordenarTarefas, tagsEmUso } from '../../stores/app'
import { abrirFormTarefa, escapar } from '../formTarefa'
import { renderizarNotas } from '../notas'
import { confirmar } from '../modal'
import { notificar } from '../toast'

/* Estado de filtro em nível de módulo — sobrevive aos re-renders do subscribe. */
let filtroTag: string | null = null
let filtroDif: Dificuldade | '' = ''
let mostrarConcluidas = false
let dataVisivel = hojeISO()
let handlerClique: ((e: Event) => void) | null = null

export function montarHoje(raiz: HTMLElement, dados: AppData): void {
  const hojeReal = hojeISO()
  const ehHoje = dataVisivel === hojeReal
  const ehOntem = dataVisivel === somarDias(hojeReal, -1)
  const rotulo = ehHoje ? 'Hoje' : ehOntem ? 'Ontem' : diaSemanaPorExtenso(dataVisivel)
  const dia = diaDaSemana(new Date(dataVisivel + 'T12:00:00'))
  const diaMes = diaDoMes(new Date(dataVisivel + 'T12:00:00'))
  const tags = tagsEmUso(dados)

  const passa = (t: Tarefa): boolean => {
    if (filtroTag && !t.tags.includes(filtroTag)) return false
    if (filtroDif && t.dificuldade !== filtroDif) return false
    return true
  }

  const habitos = dados.tarefas.filter((t) => t.tipo === 'habito' && passa(t))
  const recorrentes = dados.tarefas.filter((t) => t.tipo === 'recorrente' && valeHoje(t, dia, diaMes) && passa(t))
  const unicas = dados.tarefas.filter((t) => t.tipo === 'unica' && passa(t))
  const pendentes = unicas.filter((t) => !t.concluida)
  const feitas = mostrarConcluidas ? unicas.filter((t) => t.concluida && t.historico.includes(dataVisivel)) : []

  const filtroAtivo = filtroTag !== null || filtroDif !== ''
  const p = dados.personagem
  const pctHp = Math.round((p.hp / p.hpMax) * 100)
  const pctMana = Math.round((p.mana / p.manaMax) * 100)
  const pctXp = Math.round((p.xp / p.xpProximo) * 100)

  raiz.innerHTML = `
    <header class="view-header">
      <div class="view-header-navegacao">
        <button class="btn btn-icon" data-dia-anterior aria-label="Dia anterior">◀</button>
        <h1>${escapar(rotulo)}</h1>
        <button class="btn btn-icon" data-dia-seguinte aria-label="Dia seguinte" ${ehHoje ? 'disabled' : ''}>▶</button>
      </div>
      <p class="view-sub">${escapar(dataPorExtenso(dataVisivel))}</p>
    </header>

    <div class="ficha-compacta">
      <div class="ficha-nivel">Nv <b>${p.nivel}</b></div>
      <div class="ficha-barra" title="HP">
        <span class="ficha-barra-rotulo">HP</span>
        <div class="ficha-barra-trilho"><div class="ficha-barra-preenchimento ficha-barra--hp" style="width:${pctHp}%"></div></div>
        <span class="ficha-barra-valor">${p.hp}/${p.hpMax}</span>
      </div>
      <div class="ficha-barra" title="Mana">
        <span class="ficha-barra-rotulo">MANA</span>
        <div class="ficha-barra-trilho"><div class="ficha-barra-preenchimento ficha-barra--mana" style="width:${pctMana}%"></div></div>
        <span class="ficha-barra-valor">${p.mana}/${p.manaMax}</span>
      </div>
      <div class="ficha-barra" title="XP">
        <span class="ficha-barra-rotulo">XP</span>
        <div class="ficha-barra-trilho"><div class="ficha-barra-preenchimento ficha-barra--xp" style="width:${pctXp}%"></div></div>
        <span class="ficha-barra-valor">${p.xp}/${p.xpProximo}</span>
      </div>
      ${p.esgotado ? '<div class="ficha-esgotado">⚠ Esgotado — sem regeneração de mana até o próximo dia. Conclua tarefas para se recuperar.</div>' : ''}
    </div>

    <div class="filtros">
      ${tags.length > 0
        ? `<span class="filtros-rotulo">Tag:</span>${tags
            .map((tag) => `<button class="filtro-chip${filtroTag === tag ? ' ativo' : ''}" data-filtro-tag="${escapar(tag)}">#${escapar(tag)}</button>`)
            .join('')}`
        : ''}
      <select class="filtro-select" data-filtro-dificuldade>
        <option value="">Todas as dificuldades</option>
        ${(['facil', 'media', 'dificil', 'extrema'] as Dificuldade[])
          .map((d) => `<option value="${d}" ${filtroDif === d ? 'selected' : ''}>${dificuldadeDe(d).rotulo}</option>`)
          .join('')}
      </select>
      <button class="filtro-chip${mostrarConcluidas ? ' ativo' : ''}" data-filtro-concluidas>✓ Concluídas</button>
      ${filtroAtivo ? '<button class="btn btn-icon" data-limpar-filtros aria-label="Limpar filtros">✕</button>' : ''}
    </div>

    <div class="colunas">
      <section class="coluna">
        <header class="coluna-cabecalho">
          <h2>Hábitos</h2>
          <span class="coluna-contagem">${habitos.length}</span>
          <button class="btn btn-icon coluna-add" data-novo-tipo="habito" aria-label="Novo hábito">+</button>
        </header>
        <div class="coluna-cards">
          ${habitos.length === 0 ? vazioColuna('Nada aqui. Use + para adicionar.') : habitos.map((t) => cardHabito(t, ehHoje)).join('')}
        </div>
      </section>

      <section class="coluna">
        <header class="coluna-cabecalho">
          <h2>Recorrentes</h2>
          <span class="coluna-contagem">${recorrentes.length}</span>
          <button class="btn btn-icon coluna-add" data-novo-tipo="recorrente" aria-label="Nova recorrente">+</button>
        </header>
        <div class="coluna-cards">
          ${recorrentes.length === 0 ? vazioColuna('Nada marcado para este dia.') : recorrentes.map((t) => cardRecorrente(t, dataVisivel)).join('')}
        </div>
      </section>

      <section class="coluna">
        <header class="coluna-cabecalho">
          <h2>Tarefas</h2>
          <span class="coluna-contagem">${pendentes.length}</span>
          <button class="btn btn-icon coluna-add" data-novo-tipo="unica" aria-label="Nova tarefa">+</button>
        </header>
        <div class="coluna-cards">
          ${pendentes.length === 0 && feitas.length === 0 ? vazioColuna('Nada aqui. Use + para adicionar.') : ''}
          ${pendentes.map((t) => cardUnica(t, false)).join('')}
          ${feitas.length > 0 ? `<div class="coluna-sub">Concluídas · ${feitas.length}</div>${feitas.map((t) => cardUnica(t, true)).join('')}` : ''}
        </div>
      </section>
    </div>
  `

  /* ---------- navegação de data ---------- */
  raiz.querySelector('[data-dia-anterior]')!.addEventListener('click', () => {
    dataVisivel = somarDias(dataVisivel, -1)
    montarHoje(raiz, appStore.get())
  })
  raiz.querySelector('[data-dia-seguinte]')!.addEventListener('click', () => {
    if (dataVisivel < hojeReal) {
      dataVisivel = somarDias(dataVisivel, 1)
      montarHoje(raiz, appStore.get())
    }
  })

  /* ---------- adicionar por coluna ---------- */
  raiz.querySelectorAll('[data-novo-tipo]').forEach((el) => {
    el.addEventListener('click', () => {
      abrirFormTarefa(undefined, el.getAttribute('data-novo-tipo') as TipoTarefa)
    })
  })

  /* ---------- filtros ---------- */
  raiz.querySelectorAll('[data-filtro-tag]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const tag = chip.getAttribute('data-filtro-tag')!
      filtroTag = filtroTag === tag ? null : tag
      montarHoje(raiz, appStore.get())
    })
  })
  raiz.querySelector('[data-filtro-dificuldade]')?.addEventListener('change', (e) => {
    filtroDif = (e.target as HTMLSelectElement).value as Dificuldade | ''
    montarHoje(raiz, appStore.get())
  })
  raiz.querySelector('[data-filtro-concluidas]')?.addEventListener('click', () => {
    mostrarConcluidas = !mostrarConcluidas
    montarHoje(raiz, appStore.get())
  })
  raiz.querySelector('[data-limpar-filtros]')?.addEventListener('click', () => {
    filtroTag = null
    filtroDif = ''
    mostrarConcluidas = false
    montarHoje(raiz, appStore.get())
  })

  /* ---------- drag & drop (reordenar dentro da coluna) ---------- */
  let arrastandoId: string | null = null

  raiz.querySelectorAll('.coluna-cards').forEach((cards) => {
    cards.addEventListener('dragstart', (e) => {
      const ev = e as DragEvent
      const alvo = (ev.target as HTMLElement).closest<HTMLElement>('.tarefa-card[data-id]')
      if (!alvo) return
      arrastandoId = alvo.dataset.id ?? null
      alvo.classList.add('arrastando')
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'
    })
    cards.addEventListener('dragend', () => {
      arrastandoId = null
      cards.querySelectorAll('.arrastando, .arrasto-alvo').forEach((el) => el.classList.remove('arrastando', 'arrasto-alvo'))
    })
    cards.addEventListener('dragover', (e) => {
      const ev = e as DragEvent
      ev.preventDefault()
      if (!arrastandoId) return
      const alvo = (ev.target as HTMLElement).closest<HTMLElement>('.tarefa-card[data-id]')
      cards.querySelectorAll('.arrasto-alvo').forEach((el) => el.classList.remove('arrasto-alvo'))
      if (alvo && alvo.dataset.id !== arrastandoId) alvo.classList.add('arrasto-alvo')
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
    })
    cards.addEventListener('drop', (e) => {
      const ev = e as DragEvent
      ev.preventDefault()
      if (!arrastandoId) return
      const alvo = (ev.target as HTMLElement).closest<HTMLElement>('.tarefa-card[data-id]')
      if (alvo && alvo.dataset.id !== arrastandoId) {
        const ids = [...cards.querySelectorAll<HTMLElement>('.tarefa-card[data-id]')].map((c) => c.dataset.id!)
        const origem = ids.indexOf(arrastandoId)
        const destino = ids.indexOf(alvo.dataset.id!)
        if (origem !== -1 && destino !== -1) {
          ids.splice(origem, 1)
          ids.splice(destino, 0, arrastandoId)
          reordenarTarefas(ids)
          notificar('Ordem atualizada.')
        }
      }
      arrastandoId = null
      cards.querySelectorAll('.arrastando, .arrasto-alvo').forEach((el) => el.classList.remove('arrastando', 'arrasto-alvo'))
    })
  })

  /* ---------- ações nos cards (delegadas) ---------- */
  if (handlerClique) raiz.removeEventListener('click', handlerClique)
  handlerClique = (e: Event) => {
    const alvo = e.target as HTMLElement
    const acao = alvo.closest<HTMLElement>('[data-alternar-rec],[data-alternar-unica],[data-habito],[data-editar],[data-excluir]')
    if (!acao) return
    const id = acao.dataset.id!

    if (acao.dataset.alternarRec !== undefined) {
      alternarRecorrenteHoje(id, dataVisivel)
      return
    }
    if (acao.dataset.alternarUnica !== undefined) {
      alternarUnica(id, dataVisivel)
      return
    }
    if (acao.dataset.habito) {
      registrarHabito(id, acao.dataset.habito as 'positivo' | 'negativo', dataVisivel)
      if (acao.dataset.habito === 'positivo') notificar('Repetição registrada.')
      else notificar('Marcado como negativo.')
      return
    }
    if (acao.dataset.editar !== undefined) {
      const t = dados.tarefas.find((x) => x.id === id)
      if (t) abrirFormTarefa(t)
      return
    }
    if (acao.dataset.excluir !== undefined) {
      const t = dados.tarefas.find((x) => x.id === id)
      if (t) {
        void confirmar(`Excluir "${t.titulo}"?`, 'Excluir').then((ok) => {
          if (ok) {
            excluirTarefa(id)
            notificar('Excluído.')
          }
        })
      }
    }
  }
  raiz.addEventListener('click', handlerClique)
}

function valeHoje(t: Tarefa, dia: number, diaMes: number): boolean {
  if (t.agenda?.diasDoMes && t.agenda.diasDoMes.length > 0) return t.agenda.diasDoMes.includes(diaMes)
  return !t.agenda || t.agenda.dias.length === 0 || t.agenda.dias.includes(dia)
}

function cardHabito(t: Tarefa, ehHoje: boolean): string {
  const d = dificuldadeDe(t.dificuldade)
  const streak = calcularStreak(t.historico, dataVisivel)
  const hoje = ehHoje ? (t.contador?.hoje ?? 0) : 0
  const sinal = t.sinal ?? 'positivo'
  const antiga = classeAntiga(t)
  // botões sempre visíveis; desabilitados quando o hábito não tem aquele sinal
  const podePositivo = sinal === 'positivo' || sinal === 'ambos'
  const podeNegativo = sinal === 'negativo' || sinal === 'ambos'
  return `
    <div class="tarefa-card${antiga}" draggable="true" data-id="${t.id}">
      <div class="tarefa-corpo">
        <p class="tarefa-titulo">${escapar(t.titulo)}</p>
        ${t.notas ? `<p class="tarefa-notas">${renderizarNotas(t.notas)}</p>` : ''}
        <div class="tarefa-meta">
          <span class="badge badge--${t.dificuldade}">${d.rotulo}</span>
          <span class="badge">hoje ${hoje} · seq ${streak}</span>
          ${t.esfera ? `<span class="badge badge--esfera">◈ ${escapar(t.esfera)}</span>` : ''}
          ${t.tags.map((tag) => `<span class="badge badge--tag">#${escapar(tag)}</span>`).join('')}
          ${badgeIdade(t)}
        </div>
      </div>
      <div class="tarefa-acoes">
        <button class="btn btn--habito btn--habito-positivo" data-habito="positivo" data-id="${t.id}" aria-label="Repetição positiva" ${!podePositivo || !ehHoje ? 'disabled' : ''}>+</button>
        <button class="btn btn--habito btn--habito-negativo" data-habito="negativo" data-id="${t.id}" aria-label="Repetição negativa" ${!podeNegativo || !ehHoje ? 'disabled' : ''}>−</button>
        <button class="btn btn-icon" data-editar data-id="${t.id}" aria-label="Editar">✎</button>
        <button class="btn btn-icon" data-excluir data-id="${t.id}" aria-label="Excluir">🗑</button>
      </div>
    </div>
  `
}

function cardRecorrente(t: Tarefa, data: string): string {
  const feita = t.historico.includes(data)
  const d = dificuldadeDe(t.dificuldade)
  const agenda = agendaRotulo(t)
  const antiga = classeAntiga(t)
  return `
    <div class="tarefa-card${feita ? ' concluida' : ''}${antiga}" draggable="true" data-id="${t.id}">
      <button class="tarefa-check${feita ? ' marcado' : ''}" data-alternar-rec data-id="${t.id}" aria-label="Concluir neste dia">✓</button>
      <div class="tarefa-corpo">
        <p class="tarefa-titulo">${escapar(t.titulo)}</p>
        ${t.notas ? `<p class="tarefa-notas">${renderizarNotas(t.notas)}</p>` : ''}
        <div class="tarefa-meta">
          <span class="badge badge--${t.dificuldade}">${d.rotulo}</span>
          ${t.esfera ? `<span class="badge badge--esfera">◈ ${escapar(t.esfera)}</span>` : ''}
          ${t.tags.map((tag) => `<span class="badge badge--tag">#${escapar(tag)}</span>`).join('')}
          ${agenda}
          ${badgeIdade(t)}
        </div>
      </div>
      <div class="tarefa-acoes">
        <button class="btn btn-icon" data-editar data-id="${t.id}" aria-label="Editar">✎</button>
        <button class="btn btn-icon" data-excluir data-id="${t.id}" aria-label="Excluir">🗑</button>
      </div>
    </div>
  `
}

function cardUnica(t: Tarefa, feita: boolean): string {
  const d = dificuldadeDe(t.dificuldade)
  const antiga = classeAntiga(t)
  const due = badgeDueDate(t)
  return `
    <div class="tarefa-card${feita ? ' concluida' : ''}${antiga}" draggable="true" data-id="${t.id}">
      <button class="tarefa-check${feita ? ' marcado' : ''}" data-alternar-unica data-id="${t.id}" aria-label="${feita ? 'Reabrir' : 'Concluir'}">${feita ? '↺' : '✓'}</button>
      <div class="tarefa-corpo">
        <p class="tarefa-titulo">${escapar(t.titulo)}</p>
        ${t.notas ? `<p class="tarefa-notas">${renderizarNotas(t.notas)}</p>` : ''}
        <div class="tarefa-meta">
          <span class="badge badge--${t.dificuldade}">${d.rotulo}</span>
          ${t.esfera ? `<span class="badge badge--esfera">◈ ${escapar(t.esfera)}</span>` : ''}
          ${t.tags.map((tag) => `<span class="badge badge--tag">#${escapar(tag)}</span>`).join('')}
          ${due}
          ${badgeIdade(t)}
        </div>
      </div>
      <div class="tarefa-acoes">
        <button class="btn btn-icon" data-editar data-id="${t.id}" aria-label="Editar">✎</button>
        <button class="btn btn-icon" data-excluir data-id="${t.id}" aria-label="Excluir">🗑</button>
      </div>
    </div>
  `
}

/** Badge de vencimento com cor por proximidade (só tarefas únicas com data). */
function badgeDueDate(t: Tarefa): string {
  if (t.tipo !== 'unica' || !t.dueDate) return ''
  const dias = diasAte(t.dueDate, dataVisivel)
  const data = new Date(t.dueDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
  if (dias < 0) return `<span class="badge badge--due badge--due-vencida">venceu ${-dias}d · ${data}</span>`
  if (dias === 0) return `<span class="badge badge--due badge--due-urgente">vence neste dia · ${data}</span>`
  if (dias <= 2) return `<span class="badge badge--due badge--due-urgente">${dias}d · ${data}</span>`
  if (dias <= 7) return `<span class="badge badge--due badge--due-proxima">${dias}d · ${data}</span>`
  return `<span class="badge badge--due">${dias}d · ${data}</span>`
}

/** Classe de envelhecimento baseada na data de criação. */
function classeAntiga(t: Tarefa): string {
  const dias = diasDesde(t.criadaEm)
  if (dias > 30) return ' tarefa-antiga'
  if (dias > 14) return ' tarefa-velha'
  return ''
}

function badgeIdade(t: Tarefa): string {
  const dias = diasDesde(t.criadaEm)
  if (dias > 30) return `<span class="badge">criada há ${dias} dias</span>`
  return ''
}

function agendaRotulo(t: Tarefa): string {
  if (t.agenda?.diasDoMes && t.agenda.diasDoMes.length > 0) {
    return `<span class="badge badge--agenda">dia ${t.agenda.diasDoMes.join(', ')}</span>`
  }
  if (!t.agenda || t.agenda.dias.length === 0) return ''
  const nomes = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
  const dias = [...t.agenda.dias].sort((a, b) => a - b).map((d) => nomes[d])
  return `<span class="badge badge--agenda">${escapar(dias.join(', '))}</span>`
}

function vazioColuna(texto: string): string {
  return `<div class="vazio vazio-coluna"><strong>${escapar(texto)}</strong></div>`
}
