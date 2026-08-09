/** Visão Diário — 1 entrada por dia (texto ou voz), lista cronológica reversa. */

import type { AppData, EntradaDiario } from '../../core/tipos'
import { hojeISO, dataPorExtenso, diaSemanaPorExtenso } from '../../core/jogo'
import { appStore, diarioAtual, excluirEntrada, salvarEntrada } from '../../stores/app'
import { confirmar } from '../modal'
import { notificar } from '../toast'
import { escapar } from '../formTarefa'
import { renderizarNotas } from '../notas'
import { gravarVoz, suportaVoz } from '../diario'

/** Estado da view (módulo — sobrevive a re-renders). */
let editandoData: string | null = null

function reRender(): void {
  appStore.set({ ...appStore.get() })
}

export function montarDiario(raiz: HTMLElement, dados: AppData): void {
  const hoje = hojeISO()
  const entradas = dados.diario ?? []
  const entradaHoje = entradas.find((e) => e.data === hoje)
  const editando = editandoData ? entradas.find((e) => e.data === editandoData) : undefined
  const temVoz = suportaVoz()

  raiz.innerHTML = `
    <header class="view-header">
      <h1>Diário</h1>
      <p class="view-sub">Uma crônica por dia. O que você registra aqui não vai a lugar nenhum — fica só no seu dispositivo.</p>
    </header>

    <div class="config-secao diario-form-secao">
      <h3>${editando && editando.data !== hoje ? `Editando — ${dataPorExtenso(editando.data)}` : 'Hoje'}</h3>
      ${editando && editando.data !== hoje
        ? `<p class="config-dica">Você está editando uma entrada antiga. Salvar substitui a entrada daquele dia.</p>`
        : ''}
      <form class="diario-form" data-diario-form>
        <input class="diario-titulo" data-diario-titulo type="text" placeholder="Título (opcional)" maxlength="120"
          value="${escapar(editando?.titulo ?? entradaHoje?.titulo ?? '')}" autocomplete="off" />
        <div class="diario-texto-linha">
          <textarea class="diario-texto" data-diario-texto rows="6" placeholder="O que aconteceu hoje? Escreve ou dita…">${escapar(editando?.texto ?? entradaHoje?.texto ?? '')}</textarea>
          ${temVoz
            ? `<button type="button" class="btn btn-icon diario-mic" data-diario-mic title="Dictar por voz" aria-label="Dictar por voz">
                <i class="fa-solid fa-microphone" aria-hidden="true"></i>
              </button>`
            : ''}
        </div>
        <div class="diario-form-acoes">
          <span class="config-dica" data-diario-status></span>
          <div class="diario-botoes">
            ${editando && editando.data !== hoje
              ? `<button type="button" class="btn btn--texto" data-diario-cancelar>Cancelar</button>`
              : ''}
            <button type="submit" class="btn btn-primary" data-diario-salvar>
              <i class="fa-solid fa-feather-pointed" aria-hidden="true"></i> Salvar crônica
            </button>
          </div>
        </div>
      </form>
    </div>

    <div class="config-secao">
      <h3>Entradas anteriores</h3>
      ${entradas.length === 0
        ? '<p class="config-dica">Nenhuma crônica ainda. Escreva a primeira hoje — mesmo que seja uma linha.</p>'
        : `<div class="diario-lista">
            ${entradas
              .map((e) => cardEntrada(e, e.data === hoje))
              .join('')}
          </div>`}
    </div>
  `

  instalarForm(raiz, hoje)
  instalarLista(raiz)
}

function cardEntrada(e: EntradaDiario, ehHoje: boolean): string {
  const titulo = e.titulo
    ? `<h4 class="diario-card-titulo">${escapar(e.titulo)}</h4>`
    : ''
  const corpo = renderizarNotas(e.texto)
  return `
    <article class="diario-card${ehHoje ? ' diario-card--hoje' : ''}">
      <div class="diario-card-cabecalho">
        <div class="diario-card-data">
          ${ehHoje ? '<span class="badge badge--hoje">Hoje</span>' : ''}
          <span>${diaSemanaPorExtenso(e.data)} · ${dataPorExtenso(e.data)}</span>
        </div>
        <div class="diario-card-acoes">
          <button class="btn btn-icon" data-diario-editar="${escapar(e.id)}" title="Editar" aria-label="Editar">
            <i class="fa-solid fa-pen" aria-hidden="true"></i>
          </button>
          <button class="btn btn-icon" data-diario-excluir="${escapar(e.id)}" title="Excluir" aria-label="Excluir">
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      ${titulo}
      <div class="diario-card-texto">${corpo}</div>
    </article>
  `
}

function instalarForm(raiz: HTMLElement, hoje: string): void {
  const form = raiz.querySelector<HTMLFormElement>('[data-diario-form]')
  const tituloEl = raiz.querySelector<HTMLInputElement>('[data-diario-titulo]')
  const textoEl = raiz.querySelector<HTMLTextAreaElement>('[data-diario-texto]')
  const micEl = raiz.querySelector<HTMLButtonElement>('[data-diario-mic]')
  const statusEl = raiz.querySelector<HTMLElement>('[data-diario-status]')

  let gravacao: ReturnType<typeof gravarVoz> | null = null
  let gravando = false

  form?.addEventListener('submit', (e) => {
    e.preventDefault()
    const texto = textoEl?.value.trim() ?? ''
    const titulo = tituloEl?.value.trim() ?? ''
    if (!texto) {
      notificar('Escreva ou dite alguma coisa antes de salvar.', 'erro')
      return
    }
    const dataAlvo = editandoData ?? hoje
    salvarEntrada(dataAlvo, { titulo, texto })
    editandoData = null
    notificar('Crônica salva.')
  })

  raiz.querySelector<HTMLButtonElement>('[data-diario-cancelar]')?.addEventListener('click', () => {
    editandoData = null
    reRender()
  })

  // Voz
  if (micEl && textoEl) {
    micEl.addEventListener('click', () => {
      if (gravando) {
        gravacao?.parar()
        return
      }
      gravacao = gravarVoz({
        aoParcial: (texto) => {
          textoEl.value = texto
          textoEl.dispatchEvent(new Event('input'))
        },
        aoFinal: (texto) => {
          textoEl.value = texto
          gravando = false
          micEl.classList.remove('diario-mic--gravando')
          if (statusEl) statusEl.textContent = ''
        },
        aoErro: (msg) => {
          gravando = false
          micEl.classList.remove('diario-mic--gravando')
          notificar(msg, 'erro')
        },
      })
      if (gravacao) {
        gravando = true
        micEl.classList.add('diario-mic--gravando')
        if (statusEl) statusEl.textContent = 'Escutando…'
      }
    })
  }
}

function instalarLista(raiz: HTMLElement): void {
  raiz.querySelectorAll<HTMLButtonElement>('[data-diario-editar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.diarioEditar ?? ''
      const entrada = diarioAtual().find((e) => e.id === id)
      if (!entrada) return
      editandoData = entrada.data
      reRender()
    })
  })

  raiz.querySelectorAll<HTMLButtonElement>('[data-diario-excluir]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.diarioExcluir ?? ''
      void confirmar('Apagar esta crônica? Isso não pode ser desfeito.', 'Apagar crônica').then((ok) => {
        if (!ok) return
        excluirEntrada(id)
        if (editandoData) editandoData = null
        notificar('Crônica apagada.')
      })
    })
  })
}
