/** Modal de criação/edição de tarefa — compartilhado entre as visões. */

import type { Dificuldade, Tarefa, TipoTarefa } from '../core/tipos'
import { DIAS_SEMANA, dificuldadeDe } from '../core/jogo'
import { atualizarTarefa, criarTarefa, tagsEmUso, appStore } from '../stores/app'
import { abrirModal } from './modal'
import { notificar } from './toast'

export function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const TIPOS: ReadonlyArray<{ id: TipoTarefa; nome: string; desc: string }> = [
  { id: 'recorrente', nome: 'Recorrente', desc: 'Se repete em dias da semana' },
  { id: 'unica', nome: 'Única', desc: 'Feita uma vez e finalizada' },
  { id: 'habito', nome: 'Hábito', desc: 'Repetível, positivo ou negativo' },
]

export function abrirFormTarefa(tarefa?: Tarefa): void {
  const tipoInicial: TipoTarefa = tarefa?.tipo ?? 'recorrente'
  const dificuldadeInicial: Dificuldade = tarefa?.dificuldade ?? 'media'
  const tags = tagsEmUso(storesSnapshot())
  const tagsAtuais = tarefa?.tags ?? []

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
            <div class="opcao-tipo${t.id === tipoInicial ? ' selecionada' : ''}" data-tipo="${t.id}" role="button" tabindex="0">
              <strong>${t.nome}</strong>
              <span>${t.desc}</span>
            </div>`,
          ).join('')}
        </div>
        <input type="hidden" name="tipo" value="${tipoInicial}" />
      </div>

      <div class="form-grupo">
        <label>Dificuldade</label>
        <select class="campo" name="dificuldade">
          ${DIFICULDADES_OPCOES(dificuldadeInicial)}
        </select>
        <small>Quanto mais difícil, mais XP a tarefa vale (e mais dano causa se falhar).</small>
      </div>

      <div class="form-grupo" data-campo-agenda>
        <label>Dias da semana</label>
        <div class="chips" data-dias-chips>
          ${DIAS_SEMANA.map((d, i) => {
            const ativo = (tarefa?.agenda?.dias ?? []).includes(i) || (!tarefa && true)
            return `<button type="button" class="chip${ativo ? ' ativo' : ''}" data-dia="${i}">${d}</button>`
          }).join('')}
        </div>
        <small>Recorrente sem dia marcado vale todos os dias.</small>
      </div>

      <div class="form-grupo" data-campo-sinal hidden>
        <label>Sinal do hábito</label>
        <select class="campo" name="sinal">
          <option value="positivo" ${tarefa?.sinal === 'positivo' || !tarefa?.sinal ? 'selected' : ''}>Positivo (somar)</option>
          <option value="negativo" ${tarefa?.sinal === 'negativo' ? 'selected' : ''}>Negativo (evitar)</option>
          <option value="ambos" ${tarefa?.sinal === 'ambos' ? 'selected' : ''}>Ambos</option>
        </select>
      </div>

      <div class="form-grupo">
        <label>Tags</label>
        <div class="chips" data-tags-chips>
          ${tags.map((t) => `<button type="button" class="chip${tagsAtuais.includes(t) ? ' ativo' : ''}" data-tag="${escapar(t)}">#${escapar(t)}</button>`).join('')}
          ${tagsAtuais.filter((t) => !tags.includes(t)).map((t) => `<button type="button" class="chip ativo" data-tag="${escapar(t)}">#${escapar(t)}</button>`).join('')}
        </div>
        <div class="tag-entrada">
          <input class="campo" name="tag-nova" placeholder="Nova tag" list="tags-sugeridas" />
          <datalist id="tags-sugeridas">${tags.map((t) => `<option value="${escapar(t)}"></option>`).join('')}</datalist>
          <button type="button" class="btn" data-add-tag>+</button>
        </div>
      </div>

      <div class="form-grupo">
        <label>Links</label>
        <input class="campo" name="links" value="${escapar((tarefa?.links ?? []).join('\n'))}" placeholder="Um link por linha (ex.: https://…)" />
        <small>Um link por linha.</small>
      </div>

      <div class="form-grupo">
        <label>Notas</label>
        <textarea class="campo" name="notas" placeholder="Detalhes, contexto, anotações…">${escapar(tarefa?.notas ?? '')}</textarea>
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
  const inputTipo = form.querySelector<HTMLInputElement>('input[name="tipo"]')!

  function aplicarTipo(tipo: TipoTarefa): void {
    opcoes.forEach((o) => o.classList.toggle('selecionada', o.getAttribute('data-tipo') === tipo))
    inputTipo.value = tipo
    campoAgenda.hidden = tipo !== 'recorrente'
    campoSinal.hidden = tipo !== 'habito'
  }
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

  const tagsChips = form.querySelector('[data-tags-chips]') as HTMLElement
  function tagsSelecionadas(): string[] {
    return [...tagsChips.querySelectorAll('.chip.ativo')].map((c) => c.getAttribute('data-tag')!)
  }
  tagsChips.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest('[data-tag]') as HTMLElement | null
    if (chip) chip.classList.toggle('ativo')
  })
  form.querySelector('[data-add-tag]')!.addEventListener('click', () => {
    const input = form.querySelector<HTMLInputElement>('input[name="tag-nova"]')!
    const nome = input.value.trim().replace(/^#/, '')
    if (!nome) return
    if (!tagsChips.querySelector(`[data-tag="${CSS.escape(nome)}"]`)) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'chip ativo'
      b.dataset.tag = nome
      b.textContent = `#${nome}`
      tagsChips.appendChild(b)
    }
    input.value = ''
  })

  const diasChips = form.querySelector('[data-dias-chips]') as HTMLElement
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
    const tipo = inputTipo.value as TipoTarefa
    const dificuldade = (form.querySelector<HTMLSelectElement>('select[name="dificuldade"]')!.value ?? 'media') as Dificuldade
    const links = (form.querySelector<HTMLInputElement>('input[name="links"]')!.value ?? '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const notas = (form.querySelector<HTMLTextAreaElement>('textarea[name="notas"]')!.value ?? '').trim()
    const tags = tagsSelecionadas()
    const agenda =
      tipo === 'recorrente'
        ? { dias: [...diasChips.querySelectorAll('.chip.ativo')].map((c) => Number(c.getAttribute('data-dia'))) }
        : undefined
    const sinal =
      tipo === 'habito'
        ? ((form.querySelector<HTMLSelectElement>('select[name="sinal"]')!.value ?? 'positivo') as Tarefa['sinal'])
        : undefined

    const resultado = tarefa
      ? atualizarTarefa(tarefa.id, { titulo, tipo, dificuldade, tags, links, notas, agenda, sinal })
      : criarTarefa({ titulo, tipo, dificuldade, tags, links, notas, agenda, sinal })
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

/** Snapshot do store sem importar o atom diretamente aqui (evita re-render em loop). */
function storesSnapshot() {
  return appStore.get()
}
