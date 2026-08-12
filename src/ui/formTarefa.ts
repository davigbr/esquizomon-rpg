/** Modal de criação/edição de tarefa — compartilhado entre as visões.
 *  `tipoInicial` pré-seleciona o tipo (usado pelos botões "+" de cada coluna). */

import type { Agenda, Dificuldade, Tarefa, TipoTarefa } from '../core/tipos'
import { DIAS_SEMANA, dificuldadeDe } from '../core/jogo'
import { appStore, atualizarTarefa, criarTarefa, tagsEmUso } from '../stores/app'
import { abrirModal } from './modal'
import { notificar } from './toast'
import { escapar } from './util'

const TIPOS: ReadonlyArray<{ id: TipoTarefa; nome: string; desc: string }> = [
  { id: 'recorrente', nome: 'Recorrente', desc: 'Se repete em dias' },
  { id: 'unica', nome: 'Única', desc: 'Feita uma vez e finalizada' },
  { id: 'habito', nome: 'Hábito', desc: 'Repetível, positivo ou negativo' },
]

function agendaInicial(t?: Tarefa): { dias: number[]; diasDoMes?: number[] } {
  return {
    dias: t?.agenda?.dias ?? [],
    diasDoMes: t?.agenda?.diasDoMes,
  }
}

export function abrirFormTarefa(tarefa?: Tarefa, tipoInicial?: TipoTarefa): void {
  const tipo: TipoTarefa = tarefa?.tipo ?? tipoInicial ?? 'recorrente'
  const dificuldade: Dificuldade = tarefa?.dificuldade ?? 'facil'
  const tags = tagsEmUso(appStore.get())
  const tagsAtuais = tarefa?.tags ?? []
  const agenda = agendaInicial(tarefa)
  const repeticao: 'todos' | 'semana' | 'mes' = !tarefa
    ? 'semana'
    : agenda.diasDoMes && agenda.diasDoMes.length > 0
      ? 'mes'
      : agenda.dias.length > 0
        ? 'semana'
        : 'todos'

  abrirModal(`
    <h2>${tarefa ? 'Editar tarefa' : 'Nova tarefa'}</h2>
    <form data-form-tarefa>
      <div class="form-grupo">
        <label>O que é? <span class="obrigatorio">*</span></label>
        <input class="campo" name="titulo" value="${escapar(tarefa?.titulo ?? '')}" placeholder="Ex.: revisar fichas do mestrado" autofocus required />
      </div>

      <div class="form-grupo">
        <label>Tipo de tarefa</label>
        <div class="opcoes-tipo" data-tipo-opcoes>
          ${TIPOS.map(
            (t) => `
            <div class="opcao-tipo${t.id === tipo ? ' selecionada' : ''}" data-tipo="${t.id}" role="button" tabindex="0">
              <strong>${t.nome}</strong>
              <span>${t.desc}</span>
            </div>`,
          ).join('')}
        </div>
        <input type="hidden" name="tipo" value="${tipo}" />
      </div>

      <div class="form-grupo">
        <label>Dificuldade</label>
        <select class="campo" name="dificuldade">
          ${DIFICULDADES_OPCOES(dificuldade)}
        </select>
        <small>Quanto mais difícil, mais XP a tarefa vale (e mais dano causa se falhar).</small>
      </div>

      <div class="form-grupo" data-campo-agenda>
        <label>Repetição</label>
        <select class="campo" name="repeticao" data-repeticao-select>
          <option value="todos" ${repeticao === 'todos' ? 'selected' : ''}>Todos os dias</option>
          <option value="semana" ${repeticao === 'semana' ? 'selected' : ''}>Dias da semana</option>
          <option value="mes" ${repeticao === 'mes' ? 'selected' : ''}>Dias do mês</option>
        </select>
        <div class="chips" data-dias-chips ${repeticao === 'semana' ? '' : 'hidden'}>
          ${DIAS_SEMANA.map((d, i) => {
            const ativo = agenda.dias.includes(i)
            return `<button type="button" class="chip${ativo ? ' ativo' : ''}" data-dia="${i}">${d}</button>`
          }).join('')}
        </div>
        <input class="campo" name="dias-mes" data-dias-mes placeholder="Ex.: 1, 15, 30" value="${escapar((agenda.diasDoMes ?? []).join(', '))}" ${repeticao === 'mes' ? '' : 'hidden'} />
        <small data-agenda-dica>${repeticao === 'mes' ? 'Dias do mês separados por vírgula.' : 'Recorrente sem dia marcado vale todos os dias.'}</small>
      </div>

      <div class="form-grupo" data-campo-sinal hidden>
        <label>Sinal do hábito</label>
        <select class="campo" name="sinal">
          <option value="positivo" ${tarefa?.sinal === 'positivo' || !tarefa?.sinal ? 'selected' : ''}>Positivo (somar)</option>
          <option value="negativo" ${tarefa?.sinal === 'negativo' ? 'selected' : ''}>Negativo (evitar)</option>
          <option value="ambos" ${tarefa?.sinal === 'ambos' ? 'selected' : ''}>Ambos</option>
        </select>
      </div>

      <div class="form-grupo" data-campo-due hidden>
        <label>Vence em</label>
        <input type="date" class="campo" name="due-date" value="${escapar(tarefa?.dueDate ?? '')}" />
        <small>A cor do card muda conforme a data se aproxima.</small>
      </div>

      <div class="form-grupo">
        <label>Esfera</label>
        <input class="campo" name="esfera" value="${escapar(tarefa?.esfera ?? '')}" placeholder="Ex.: Estudo, Corpo, Criação…" list="esferas-sugeridas" />
        <datalist id="esferas-sugeridas">
          <option value="Estudo"></option>
          <option value="Corpo"></option>
          <option value="Criação"></option>
          <option value="Vínculos"></option>
          <option value="Cuidado"></option>
        </datalist>
        <small>O domínio da vida que esta tarefa alimenta — aparece no seu perfil de esferas.</small>
      </div>

      <div class="form-grupo">
        <label>Tags</label>
        <div class="tag-lista" data-tags-chips>
          ${tags.map((t) => `<button type="button" class="tag-linha${tagsAtuais.includes(t) ? ' ativo' : ''}" data-tag="${escapar(t)}"><span class="tag-linha-check">✓</span><span class="tag-linha-nome">#${escapar(t)}</span></button>`).join('')}
          ${tagsAtuais.filter((t) => !tags.includes(t)).map((t) => `<button type="button" class="tag-linha ativo" data-tag="${escapar(t)}"><span class="tag-linha-check">✓</span><span class="tag-linha-nome">#${escapar(t)}</span></button>`).join('')}
        </div>
        <div class="tag-entrada">
          <input class="campo" name="tag-nova" placeholder="Nova tag (Enter para adicionar)" list="tags-sugeridas" />
          <datalist id="tags-sugeridas">${tags.map((t) => `<option value="${escapar(t)}"></option>`).join('')}</datalist>
          <button type="button" class="btn" data-add-tag>+</button>
        </div>
        <small>Clique para marcar; Enter no campo adiciona a tag.</small>
      </div>

      <div class="form-grupo">
        <label>Notas</label>
        <textarea class="campo" name="notas" placeholder="Detalhes, contexto, anotações…">${escapar(tarefa?.notas ?? '')}</textarea>
        <small>Aceita **negrito**, *itálico* e links (https://…).</small>
      </div>

      <div class="form-acoes">
        <button type="button" class="btn" data-cancelar>Cancelar</button>
        <button type="submit" class="btn btn-primary">${tarefa ? 'Salvar' : 'Criar'}</button>
      </div>
    </form>
  `)

  const form = document.querySelector('[data-form-tarefa]') as HTMLFormElement
  const opcoes = form.querySelectorAll('[data-tipo]')
  const campoAgenda = form.querySelector('[data-campo-agenda]') as HTMLElement
  const campoSinal = form.querySelector('[data-campo-sinal]') as HTMLElement
  const campoDue = form.querySelector('[data-campo-due]') as HTMLElement
  const inputTipo = form.querySelector<HTMLInputElement>('input[name="tipo"]')!
  const repeticaoSelect = form.querySelector<HTMLSelectElement>('[data-repeticao-select]')!
  const diasChips = form.querySelector('[data-dias-chips]') as HTMLElement
  const diasMes = form.querySelector<HTMLInputElement>('[data-dias-mes]')!
  const agendaDica = form.querySelector<HTMLElement>('[data-agenda-dica]')!

  function aplicarTipo(t: TipoTarefa): void {
    opcoes.forEach((o) => o.classList.toggle('selecionada', o.getAttribute('data-tipo') === t))
    inputTipo.value = t
    campoAgenda.hidden = t !== 'recorrente'
    campoSinal.hidden = t !== 'habito'
    campoDue.hidden = t !== 'unica'
  }
  aplicarTipo(inputTipo.value as TipoTarefa)
  opcoes.forEach((o) => {
    o.addEventListener('click', () => aplicarTipo(o.getAttribute('data-tipo') as TipoTarefa))
    o.addEventListener('keydown', (e) => {
      const ev = e as KeyboardEvent
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault()
        aplicarTipo(o.getAttribute('data-tipo') as TipoTarefa)
      }
    })
  })

  function aplicarRepeticao(r: 'todos' | 'semana' | 'mes'): void {
    diasChips.hidden = r !== 'semana'
    diasMes.hidden = r !== 'mes'
    agendaDica.textContent = r === 'mes' ? 'Dias do mês separados por vírgula.' : 'Recorrente sem dia marcado vale todos os dias.'
  }
  repeticaoSelect.addEventListener('change', () => {
    aplicarRepeticao(repeticaoSelect.value as 'todos' | 'semana' | 'mes')
  })

  const tagsChips = form.querySelector('[data-tags-chips]') as HTMLElement
  function tagsSelecionadas(): string[] {
    return [...tagsChips.querySelectorAll('.tag-linha.ativo')].map((c) => c.getAttribute('data-tag')!)
  }
  function adicionarTagChip(nome: string): void {
    const limpo = nome.trim().replace(/^#/, '')
    if (!limpo) return
    if (!tagsChips.querySelector(`[data-tag="${CSS.escape(limpo)}"]`)) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'tag-linha ativo'
      b.dataset.tag = limpo
      b.innerHTML = `<span class="tag-linha-check">✓</span><span class="tag-linha-nome">#${escapar(limpo)}</span>`
      tagsChips.appendChild(b)
    }
  }
  tagsChips.addEventListener('click', (e) => {
    const linha = (e.target as HTMLElement).closest('[data-tag]') as HTMLElement | null
    if (linha) linha.classList.toggle('ativo')
  })
  const inputTagNova = form.querySelector<HTMLInputElement>('input[name="tag-nova"]')!
  form.querySelector('[data-add-tag]')!.addEventListener('click', () => {
    adicionarTagChip(inputTagNova.value)
    inputTagNova.value = ''
    inputTagNova.focus()
  })
  // Enter no campo de tag adiciona a tag em vez de submeter a tarefa
  inputTagNova.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent
    if (ev.key === 'Enter') {
      ev.preventDefault()
      adicionarTagChip(inputTagNova.value)
      inputTagNova.value = ''
    }
  })

  diasChips.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest('[data-dia]') as HTMLElement | null
    if (chip) chip.classList.toggle('ativo')
  })

  form.querySelector('[data-cancelar]')!.addEventListener('click', () => {
    document.getElementById('modal-close')?.click()
  })

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const titulo = (form.querySelector<HTMLInputElement>('input[name="titulo"]')!.value ?? '').trim()
    if (!titulo) {
      notificar('Dê um nome para a tarefa.', 'erro')
      return
    }
    const tipoAtual = inputTipo.value as TipoTarefa
    const dificuldade = (form.querySelector<HTMLSelectElement>('select[name="dificuldade"]')!.value ?? 'facil') as Dificuldade
    const notas = (form.querySelector<HTMLTextAreaElement>('textarea[name="notas"]')!.value ?? '').trim()
    const tags = tagsSelecionadas()
    const esfera = (form.querySelector<HTMLInputElement>('input[name="esfera"]')!.value ?? '').trim() || undefined
    const dueDate = tipoAtual === 'unica'
      ? (form.querySelector<HTMLInputElement>('input[name="due-date"]')!.value || undefined)
      : undefined
    let agenda: Agenda | undefined
    if (tipoAtual === 'recorrente') {
      const r = repeticaoSelect.value as 'todos' | 'semana' | 'mes'
      if (r === 'mes') {
        const diasMesVal = diasMes.value
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31)
        agenda = { dias: [], diasDoMes: [...new Set(diasMesVal)].sort((a, b) => a - b) }
      } else if (r === 'semana') {
        const dias = [...diasChips.querySelectorAll('.chip.ativo')].map((c) => Number(c.getAttribute('data-dia')))
        agenda = { dias }
      } else {
        agenda = { dias: [] }
      }
    }
    const sinal =
      tipoAtual === 'habito'
        ? ((form.querySelector<HTMLSelectElement>('select[name="sinal"]')!.value ?? 'positivo') as Tarefa['sinal'])
        : undefined

    const resultado = tarefa
      ? atualizarTarefa(tarefa.id, { titulo, tipo: tipoAtual, dificuldade, tags, notas, esfera, dueDate, agenda, sinal })
      : criarTarefa({ titulo, tipo: tipoAtual, dificuldade, tags, notas, esfera, dueDate, agenda, sinal })
    if (!resultado.ok) {
      notificar(resultado.motivo ?? 'Não deu para salvar.', 'erro')
      return
    }
    document.getElementById('modal-close')?.click()
    notificar(tarefa ? 'Tarefa atualizada.' : 'Tarefa criada.')
  })
}

function DIFICULDADES_OPCOES(atual: Dificuldade): string {
  const ordem: Dificuldade[] = ['facil', 'media', 'dificil', 'extrema']
  return ordem
    .map((id) => {
      const d = dificuldadeDe(id)
      return `<option value="${id}" ${id === atual ? 'selected' : ''}>${d.rotulo} (×${d.multiplicador})</option>`
    })
    .join('')
}
