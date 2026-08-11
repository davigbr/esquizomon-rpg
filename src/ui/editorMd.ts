/** Renderização de markdown-lite para LEITURA (preview do diário).
 *  Blocos: títulos, listas, citações, code fences, parágrafos.
 *  Inline: strong/em/links/code.
 *  (O antigo editor "linhas vivas" contenteditable foi substituído por
 *  textarea + este preview — as funções de compilação/caret foram removidas.) */

import { escapar } from './util'

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
      // URL crua
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${href}</a>`
    },
  )
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  return s
}

/** Renderiza markdown cru em HTML de leitura (preview).
 *  Cada linha é escapada+formatada ANTES do join — o <br> é HTML legítimo,
 *  escapá-lo depois faria o usuário ver "<br>" literal no lugar do Enter. */
export function renderizarMarkdown(texto: string): string {
  const linhas = texto.split('\n')
  const blocos: string[] = []
  let i = 0

  const ehListaUl = (l: string): boolean => /^[-*]\s+/.test(l)
  const ehListaOl = (l: string): boolean => /^\d+\.\s+/.test(l)
  const ehTitulo = (l: string): boolean => /^#{1,3}\s+/.test(l)
  const ehCitacao = (l: string): boolean => /^>\s?/.test(l)
  const ehFence = (l: string): boolean => /^```/.test(l)
  const inline = (l: string): string => formatarInline(escapar(l))

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
      blocos.push(`<pre><code>${escapar(buf.join('\n'))}</code></pre>`)
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
      blocos.push(`<p>${buf.map(inline).join('<br>')}</p>`)
    }
  }

  if (blocos.length === 0) return '<p class="diario-preview-vazio">Sem conteúdo ainda.</p>'
  return blocos.join('\n')
}
