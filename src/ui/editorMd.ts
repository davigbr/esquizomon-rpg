/** Editor de markdown "linhas vivas" — estilo Obsidian live preview.
 *
 *  Estrutura: cada linha é um <div class="md-linha" data-tipo="..."> com
 *  um <span class="md-prefixo" contenteditable="false"> para os marcadores
 *  de bloco (##, -, >) e o conteúdo inline formatado (strong/em/a/code).
 *  O caret é preservado por POSIÇÃO DE CARACTERE no texto puro — recompilar
 *  o editor e restaurar o caret por posição funciona porque mapeamos a
 *  posição → text node via caminhada em ordem document.
 */

/** Detecta o tipo de bloco de uma linha e devolve { tipo, prefixo, resto }.
 *  `prefixo` é o marcador ORIGINAL (ex.: "- ", "## ") — o decorativo é
 *  derivado no compilarLinha (ul vira "• "). */
export function analisarLinha(texto: string): { tipo: string; prefixo: string; resto: string } {
  // Títulos: #, ##, ###
  const h = /^(#{1,3})\s+(.*)$/.exec(texto)
  if (h) return { tipo: `h${h[1].length}`, prefixo: `${h[1]} `, resto: h[2] }
  // Lista: - ou *
  const ul = /^([-*])\s+(.*)$/.exec(texto)
  if (ul) return { tipo: 'ul', prefixo: `${ul[1]} `, resto: ul[2] }
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

/** Prefixo VISUAL de cada tipo de bloco (o original pode ser "-", exibimos "•"). */
function prefixoDecorativo(tipo: string, prefixo: string): string {
  if (tipo === 'ul') return '• '
  return prefixo
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
  // links markdown [texto](url) E URLs cruas numa ÚNICA passada — se
  // processássemos separado, o 2º regex re-escaneava o HTML já gerado
  // (casa a URL dentro do href e aninha tags).
  let s = esc.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>"']+)/g,
    (_m, texto: string | undefined, url: string | undefined, crua: string | undefined) => {
      const href = (url ?? crua ?? '').replace(/"/g, '&quot;')
      if (url) {
        // link markdown [texto](url)
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${texto ?? ''}</a>`
      }
      // URL crua — marca data-raw-url pra serializar de volta sem o wrap [t](u)
      return `<a href="${href}" data-raw-url="1" target="_blank" rel="noopener noreferrer">${href}</a>`
    },
  )
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
  const decorativo = prefixoDecorativo(tipo, prefixo)
  const prefixoHtml = decorativo ? `<span class="md-prefixo" contenteditable="false">${escaparHtml(decorativo)}</span>` : ''
  // data-prefixo-orig guarda o marcador ORIGINAL (ex.: "- ") pra reconstruir
  // o markdown na extração (em vez do decorativo "• ").
  const origAttr = prefixo ? ` data-prefixo-orig="${escaparHtml(prefixo)}"` : ''
  return `<div class="md-linha md-linha--${tipo}" data-tipo="${tipo}"${origAttr}>${prefixoHtml}<span class="md-conteudo">${conteudo}</span></div>`
}

/** Compila um texto inteiro (múltiplas linhas) em HTML do editor. */
export function compilarEditor(texto: string): string {
  return texto
    .split('\n')
    .map((linha) => compilarLinha(linha))
    .join('')
}

/** Renderiza markdown cru em HTML de LEITURA (preview).
 *  Blocos: títulos, listas, citações, code fences, parágrafos.
 *  Inline: strong/em/links/code (via formatarInline). */
export function renderizarMarkdown(texto: string): string {
  const linhas = texto.split('\n')
  const blocos: string[] = []
  let i = 0

  const ehListaUl = (l: string): boolean => /^[-*]\s+/.test(l)
  const ehListaOl = (l: string): boolean => /^\d+\.\s+/.test(l)
  const ehTitulo = (l: string): boolean => /^#{1,3}\s+/.test(l)
  const ehCitacao = (l: string): boolean => /^>\s?/.test(l)
  const ehFence = (l: string): boolean => /^```/.test(l)
  const inline = (l: string): string => formatarInline(escaparHtml(l))

  while (i < linhas.length) {
    const linha = linhas[i]

    if (ehFence(linha)) {
      const buf: string[] = []
      i++
      while (i < linhas.length && !ehFence(linhas[i])) {
        buf.push(linhas[i])
        i++
      }
      i++ // fecha ```
      blocos.push(`<pre><code>${escaparHtml(buf.join('\n'))}</code></pre>`)
    } else if (ehTitulo(linha)) {
      const m = /^(#{1,3})\s+(.*)$/.exec(linha)!
      blocos.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`)
      i++
    } else if (ehCitacao(linha)) {
      const buf: string[] = []
      while (i < linhas.length && ehCitacao(linhas[i])) {
        buf.push(inline(linhas[i].replace(/^>\s?/, '')))
        i++
      }
      blocos.push(`<blockquote>${buf.join('<br>')}</blockquote>`)
    } else if (ehListaUl(linha)) {
      const itens: string[] = []
      while (i < linhas.length && ehListaUl(linhas[i])) {
        itens.push(`<li>${inline(linhas[i].replace(/^[-*]\s+/, ''))}</li>`)
        i++
      }
      blocos.push(`<ul>${itens.join('')}</ul>`)
    } else if (ehListaOl(linha)) {
      const itens: string[] = []
      while (i < linhas.length && ehListaOl(linhas[i])) {
        itens.push(`<li>${inline(linhas[i].replace(/^\d+\.\s+/, ''))}</li>`)
        i++
      }
      blocos.push(`<ol>${itens.join('')}</ol>`)
    } else if (linha.trim() === '') {
      i++
    } else {
      // parágrafo: junta linhas consecutivas que não iniciam outro bloco
      const buf = [linha]
      i++
      while (
        i < linhas.length &&
        linhas[i].trim() !== '' &&
        !ehTitulo(linhas[i]) &&
        !ehCitacao(linhas[i]) &&
        !ehListaUl(linhas[i]) &&
        !ehListaOl(linhas[i]) &&
        !ehFence(linhas[i])
      ) {
        buf.push(linhas[i])
        i++
      }
      blocos.push(`<p>${inline(buf.join('<br>'))}</p>`)
    }
  }

  if (blocos.length === 0) return '<p class="diario-preview-vazio">Sem conteúdo ainda.</p>'
  return blocos.join('\n')
}

/** Serializa um nó do DOM formatado DE VOLTA a markdown puro.
 *  strong → **x**, em → *x*, a → [t](href), code → `x`. */
function serializarNode(no: Node): string {
  if (no.nodeType === Node.TEXT_NODE) return no.textContent ?? ''
  if (no.nodeType !== Node.ELEMENT_NODE) return ''
  const el = no as HTMLElement
  const tag = el.tagName.toLowerCase()
  if (tag === 'br') return '\n'
  const filhos = Array.from(el.childNodes).map(serializarNode).join('')
  switch (tag) {
    case 'strong':
    case 'b':
      return `**${filhos}**`
    case 'em':
    case 'i':
      return `*${filhos}*`
    case 'code':
      return `\`${filhos}\``
    case 'a': {
      const href = el.getAttribute('href') ?? ''
      // URL crua (data-raw-url) volta como URL pura; link markdown vira [t](u)
      if (el.hasAttribute('data-raw-url')) return filhos
      return `[${filhos}](${href})`
    }
    default:
      return filhos
  }
}

/** Extrai o texto puro do editor, reconstruindo as linhas E o markdown.
 *  Robusto a QUALQUER estrutura que o browser crie no contenteditable
 *  (divs sem classe, <br>, text nodes soltos) — cada elemento filho de
 *  nível raiz conta como uma linha. Linhas vazias no MEIO são preservadas;
 *  só as vazias do FINAL (trailing newline) são removidas. */
export function editorParaTexto(ed: HTMLElement): string {
  const linhas: string[] = []
  let atual = ''

  const flush = (): void => {
    linhas.push(atual)
    atual = ''
  }

  for (const no of Array.from(ed.childNodes)) {
    if (no.nodeType === Node.ELEMENT_NODE) {
      const el = no as HTMLElement
      if (el.tagName === 'BR') {
        atual += '\n'
        continue
      }
      // linha: prefixo original (data-prefixo-orig) + conteúdo serializado de volta a markdown
      const prefOrig = el.getAttribute?.('data-prefixo-orig')
      const conteudo = el.querySelector?.('.md-conteudo')
      if (conteudo) {
        const pref = prefOrig ?? (el.querySelector('.md-prefixo')?.textContent ?? '')
        atual += pref + Array.from(conteudo.childNodes).map(serializarNode).join('')
      } else {
        // div sem nossa estrutura (criada pelo browser) — textContent puro
        atual += el.textContent ?? ''
      }
      flush()
    } else if (no.nodeType === Node.TEXT_NODE) {
      const t = no.textContent ?? ''
      if (t.trim() === '' && atual === '') continue
      atual += t
    }
  }
  flush()

  // Normaliza quebras internas (ex.: <br> serializado como \n).
  const resultado: string[] = []
  for (const linha of linhas) {
    const partes = linha.split('\n')
    if (partes.length > 1) {
      resultado.push(...partes)
    } else {
      resultado.push(linha)
    }
  }

  // Remove linhas vazias apenas no FINAL (trailing newline não conta como conteúdo).
  while (resultado.length > 0 && resultado[resultado.length - 1] === '') {
    resultado.pop()
  }

  return resultado.join('\n')
}

/* ---------- caret por posição de caractere ---------- */

/** Conta os caracteres de texto dentro de um elemento até o caret. */
function posicaoDentroDe(el: Element, start: Node, offset: number): number {
  if (start === el) return offset
  let pos = 0
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if (node === start) return pos + offset
    pos += (node.textContent ?? '').length
    node = walker.nextNode()
  }
  return pos
}

/** Retorna a posição do caret nos TEXT NODES do editor (sem contar \n
 *  estruturais entre linhas — consistente com posicaoParaCaret). */
export function caretParaPosicao(ed: HTMLElement): number {
  const sel = document.getSelection()
  if (!sel || sel.rangeCount === 0) return 0
  const range = sel.getRangeAt(0)
  const start = range.startContainer
  if (!ed.contains(start)) return 0

  const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT)
  let pos = 0
  let node: Node | null = walker.nextNode()
  while (node) {
    if (node === start) return pos + range.startOffset
    pos += (node.textContent ?? '').length
    node = walker.nextNode()
  }
  return pos
}

/** Serializa UMA linha .md-linha de volta a markdown puro.
 *  Robusto: captura o .md-conteudo formatado E text nodes soltos que o
 *  browser possa ter criado fora do span (ex.: quando o caret pousa
 *  fora do span). O prefixo decorativo é substituído pelo ORIGINAL. */
function serializarLinha(linhaEl: HTMLElement): string {
  const prefOrig = linhaEl.getAttribute('data-prefixo-orig') ?? ''
  let corpo = ''
  for (const no of Array.from(linhaEl.childNodes)) {
    if (no.nodeType === Node.TEXT_NODE) {
      corpo += no.textContent ?? ''
    } else if (no.nodeType === Node.ELEMENT_NODE) {
      const el = no as HTMLElement
      if (el.classList.contains('md-prefixo')) continue // decorativo → usa prefOrig
      if (el.classList.contains('md-conteudo')) {
        corpo += Array.from(el.childNodes).map(serializarNode).join('')
      } else {
        // qualquer outro elemento (ex.: strong solto, div do browser) — serializa filhos
        corpo += Array.from(el.childNodes).map(serializarNode).join('')
      }
    }
  }
  return prefOrig + corpo
}

/** Divide a linha onde está o caret em duas (Enter). DOM puro — sem posições
 *  globais, imune a inconsistências de \n estruturais entre linhas. */
export function quebrarLinhaNoCaret(ed: HTMLElement): boolean {
  const sel = document.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  const start = range.startContainer
  if (!ed.contains(start)) return false

  const linhaEl = (start instanceof HTMLElement
    ? start.closest('.md-linha')
    : start.parentElement?.closest('.md-linha')) as HTMLElement | null
  if (!linhaEl) return false

  // texto puro da linha (robusto a text nodes soltos)
  const textoLinha = serializarLinha(linhaEl)

  // offset do caret DENTRO da linha (inclui o prefixo decorativo, que tem o
  // mesmo comprimento do original — consistente)
  const offset = posicaoDentroDe(linhaEl, start, range.startOffset)

  const parteA = textoLinha.slice(0, offset)
  const parteB = textoLinha.slice(offset)

  // insere a linha B DEPOIS da atual, depois substitui a A pela metade A
  linhaEl.insertAdjacentHTML('afterend', compilarLinha(parteB))
  const linhaB = linhaEl.nextElementSibling as HTMLElement | null
  linhaEl.outerHTML = compilarLinha(parteA)

  // caret no início do conteúdo da linha B — GARANTE um text node vazio
  // dentro do span, senão o texto digitado cai fora do .md-conteudo.
  if (linhaB) {
    let conteudoB = linhaB.querySelector<HTMLElement>('.md-conteudo')
    if (conteudoB && conteudoB.childNodes.length === 0) {
      conteudoB.appendChild(document.createTextNode(''))
    }
    const destino: Node = conteudoB ?? linhaB
    const range2 = document.createRange()
    range2.setStart(destino, 0)
    range2.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range2)
  }
  return true
}

/** Normaliza a estrutura do editor se o browser criou conteúdo fora do
 *  formato .md-linha (text nodes soltos, divs sem classe). Recompila
 *  preservando o caret. */
export function normalizarEstrutura(ed: HTMLElement): boolean {
  const temLinha = ed.querySelector('.md-linha') !== null
  const soltos = Array.from(ed.childNodes).some(
    (no) =>
      no.nodeType === Node.TEXT_NODE ||
      (no.nodeType === Node.ELEMENT_NODE && !(no as HTMLElement).classList?.contains('md-linha') && (no as HTMLElement).tagName !== 'BR'),
  )
  if (temLinha && !soltos) return false

  const pos = caretParaPosicao(ed)
  const texto = editorParaTexto(ed)
  ed.innerHTML = compilarEditor(texto)
  posicaoParaCaret(ed, pos)
  return true
}

/** Restaura o caret numa posição de caractere do texto puro.
 *  Pousa no text node correto MESMO quando ele é vazio (ex.: linha nova). */
export function posicaoParaCaret(ed: HTMLElement, pos: number): void {
  const textNodes: Text[] = []
  const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    textNodes.push(node as Text)
    node = walker.nextNode()
  }
  if (textNodes.length === 0) return

  let acumulado = 0
  for (const tn of textNodes) {
    if (pos <= acumulado + tn.length) {
      const offset = Math.max(0, Math.min(pos - acumulado, tn.length))
      const range = document.createRange()
      range.setStart(tn, offset)
      range.collapse(true)
      const sel = document.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      return
    }
    acumulado += tn.length
  }
  // pos além do fim → fim do último text node (nunca fora das linhas)
  const ultimo = textNodes[textNodes.length - 1]
  const range = document.createRange()
  range.setStart(ultimo, ultimo.length)
  range.collapse(true)
  const sel = document.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}
