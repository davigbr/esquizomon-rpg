/**
 * Renderização do conteúdo das mensagens do chat: a bolha (usuario/assistente),
 * markdown + miniatura clicável de cartas, e o markdown puro para copiar/colar.
 * Isoladodo DOM/painel — funções puras (dado → HTML/markdown).
 */
import type { MensagemIA } from '../core/tipos'
import { nomeDaCarta, resolverCartaId } from '../core/baralho'
import { renderizarMarkdown } from './editorMd'
import { escapar } from './util'

/** A bolha de uma mensagem. */
export function bolha(m: MensagemIA, idx: number): string {
  const btnCopiar = `<button type="button" class="fabula-copiar-msg" data-fabula-copiar-msg="${idx}" title="Copiar mensagem em markdown" aria-label="Copiar mensagem em markdown"><i class="fa-solid fa-copy" aria-hidden="true"></i></button>`
  if (m.role === 'user') {
    return `<div class="fabula-bolha fabula-bolha--usuario">${btnCopiar}<span class="fabula-bolha-texto">${escapar(m.content)}</span></div>`
  }
  const raciocinio = m.reasoning
    ? `<details class="fabula-reasoning">
        <summary><i class="fa-solid fa-brain" aria-hidden="true"></i> Raciocínio</summary>
        <pre>${escapar(m.reasoning)}</pre>
      </details>`
    : ''
  return `<div class="fabula-bolha fabula-bolha--assistente">${btnCopiar}<span class="fabula-bolha-texto">${renderizarConteudo(m.content)}</span>${raciocinio}</div>`
}

/** Renderiza o conteúdo da bolha do assistente: markdown + `[[carta:<id>]]`
 *  vira a miniatura CLICÁVEL (abre o modal da galeria). */
export function renderizarConteudo(conteudo: string): string {
  const renderizado = conteudo.trim() ? renderizarMarkdown(conteudo) : ''
  const comCartas = renderizado.replace(/\[\[carta:([\w-]+)\]\]/g, (_match, id: string) => {
    if (resolverCartaId(id) !== id) return _match
    const nome = nomeDaCarta(id)
    return `<button type="button" class="fabula-carta-btn" data-fabula-carta="${escapar(id)}" title="Ver carta: ${escapar(nome)}" aria-label="Ver carta: ${escapar(nome)}"><img class="fabula-carta" src="/images/cards/${escapar(id)}.png" alt="${escapar(nome)}" loading="lazy" /></button>`
  })
  // a miniatura sozinha num parágrafo não pode carregar as margens do <p>
  return comCartas.replace(/<p>(\s*<button class="fabula-carta-btn".*?<\/button>\s*)<\/p>/gs, '$1')
}

/** Gera o markdown de UMA mensagem pra colar em qualquer editor (Obsidian etc.).
 *  `[[carta:<id>]]` vira o nome da carta em itálico — fora do app não faz sentido. */
export function mensagemParaMarkdown(m: MensagemIA): string {
  return m.content.replace(/\[\[carta:([\w-]+)\]\]/g, (_match, id: string) => {
    if (resolverCartaId(id) !== id) return _match
    return `*${nomeDaCarta(id)}*`
  })
}
