/** Editor de markdown "linhas vivas" — estilo Obsidian live preview.
 *
 *  Estrutura: cada linha é um <div class="md-linha" data-tipo="..."> com
 *  um <span class="md-prefixo" contenteditable="false"> para os marcadores
 *  de bloco (##, -, >) e o conteúdo inline formatado (strong/em/a/code).
 *  O caret é preservado por POSIÇÃO DE CARACTERE no texto puro — recompilar
 *  o editor e restaurar o caret por posição funciona porque mapeamos a
 *  posição → text node via caminhada em ordem document.
 */

/** Detecta o tipo de bloco de uma linha e devolve { tipo, prefixo, resto }. */
export function analisarLinha(texto: string): { tipo: string; prefixo: string; resto: string } {
  // Títulos: #, ##, ###
  const h = /^(#{1,3})\s+(.*)$/.exec(texto)
  if (h) return { tipo: `h${h[1].length}`, prefixo: `${h[1]} `, resto: h[2] }
  // Lista: - ou *
  const ul = /^[-*]\s+(.*)$/.exec(texto)
  if (ul) return { tipo: 'ul', prefixo: '• ', resto: ul[1] }
  // Lista numerada: 1.
  const ol = /^(\d+)\.\s+(.*)$/.exec(texto)
  if (ol) return { tipo: 'ol', prefixo: `${ol[1]}. `, resto: ol[2] }
  // Citação: >
  const q = /^>\s?(.*)$/.exec(texto)
  if (q) return { tipo: 'quote', prefixo: '> ', resto: q[1] }
  // Código em bloco: ``` (linha inteira)
  if (/^```/.test(texto)) return { tipo: 'code', prefixo: '', resto: texto }
  return { tipo: 'p', prefixo: '', resto: texto }
}

/** Escapa HTML (seguro para qualquer entrada). */
export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Formata inline: links → strong → em → code. Recebe texto JÁ escapado. */
export function formatarInline(esc: string): string {
  let s = esc.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  return s
}

/** Compila UMA linha em HTML (prefixo decorativo + conteúdo formatado). */
export function compilarLinha(texto: string): string {
  const { tipo, prefixo, resto } = analisarLinha(texto)
  const esc = escaparHtml(resto)
  const conteudo = tipo === 'code' ? `<code>${esc}</code>` : formatarInline(esc)
  const prefixoHtml = prefixo ? `<span class="md-prefixo" contenteditable="false">${escaparHtml(prefixo)}</span>` : ''
  return `<div class="md-linha md-linha--${tipo}" data-tipo="${tipo}">${prefixoHtml}<span class="md-conteudo">${conteudo}</span></div>`
}

/** Compila um texto inteiro (múltiplas linhas) em HTML do editor. */
export function compilarEditor(texto: string): string {
  return texto
    .split('\n')
    .map((linha) => compilarLinha(linha))
    .join('')
}

/** Extrai o texto puro do editor (incluindo prefixos decorativos), reconstruindo as linhas. */
export function editorParaTexto(ed: HTMLElement): string {
  const linhas = ed.querySelectorAll<HTMLElement>('.md-linha')
  if (linhas.length === 0) return ''
  return Array.from(linhas)
    .map((linha) => {
      const pref = linha.querySelector<HTMLElement>('.md-prefixo')
      const conteudo = linha.querySelector<HTMLElement>('.md-conteudo')
      const pre = pref ? pref.textContent ?? '' : ''
      const corpo = conteudo ? conteudo.textContent ?? '' : ''
      return pre + corpo
    })
    .join('\n')
}

/* ---------- caret por posição de caractere ---------- */

/** Retorna a posição global (índice no texto puro) do caret atual. */
export function caretParaPosicao(ed: HTMLElement): number {
  const sel = document.getSelection()
  if (!sel || sel.rangeCount === 0) return 0
  const range = sel.getRangeAt(0)
  if (!ed.contains(range.startContainer)) return 0

  const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT)
  let pos = 0
  let node: Node | null = walker.nextNode()
  while (node) {
    if (node === range.startContainer) return pos + range.startOffset
    pos += (node.textContent ?? '').length
    node = walker.nextNode()
  }
  return pos
}

/** Restaura o caret numa posição de caractere do texto puro. */
export function posicaoParaCaret(ed: HTMLElement, pos: number): void {
  const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT)
  let acumulado = 0
  let node: Node | null = walker.nextNode()
  while (node) {
    const len = (node.textContent ?? '').length
    if (acumulado + len >= pos) {
      const offset = Math.min(pos - acumulado, len)
      const range = document.createRange()
      range.setStart(node, offset)
      range.collapse(true)
      const sel = document.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      return
    }
    acumulado += len
    node = walker.nextNode()
  }
  // caiu no fim
  const sel = document.getSelection()
  if (sel && ed.lastChild) {
    const range = document.createRange()
    range.selectNodeContents(ed)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  }
}
