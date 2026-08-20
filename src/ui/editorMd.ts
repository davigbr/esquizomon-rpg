/** Markdown-lite rendering for READING (diary preview).
 *  Blocks: headings, lists, quotes, code fences, paragraphs.
 *  Inline: strong/em/links/code.
 *  (The old "live lines" contenteditable editor was replaced by
 *  textarea + this preview — the compile/caret functions were removed.) */

import { escapeHtml } from './util'

/** Formats inline: links → strong → em → code. Receives already-escaped text. */
export function formatInline(esc: string): string {
  // markdown links [text](url) AND raw URLs in a SINGLE pass — if we processed
  // them separately, the 2nd regex would re-scan the already-generated HTML
  // (matching the URL inside the href and nesting tags).
  let s = esc.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>"']+)/g,
    (_m, text: string | undefined, url: string | undefined, raw: string | undefined) => {
      const href = (url ?? raw ?? '').replace(/"/g, '&quot;')
      if (url) {
        // markdown link [text](url)
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text ?? ''}</a>`
      }
      // raw URL
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${href}</a>`
    },
  )
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  return s
}

/** Renders raw markdown into reading HTML (diary preview + Fable chat).
 *  Blocks: headings, lists, quotes, TABLES (pipe), code fences, paragraphs.
 *  Inline: links/strong/em/code.
 *  Each line is escaped+formatted BEFORE the join — the <br> is valid HTML;
 *  escaping it afterwards would make the user see a literal "<br>" instead
 *  of the newline. */
export function renderMarkdown(text: string): string {
  const lines = text.split('\n')
  const blocks: string[] = []
  let i = 0

  const isUl = (l: string): boolean => /^[-*]\s+/.test(l)
  const isOl = (l: string): boolean => /^\d+\.\s+/.test(l)
  const isHeading = (l: string): boolean => /^#{1,3}\s+/.test(l)
  const isQuote = (l: string): boolean => /^>\s?/.test(l)
  const isFence = (l: string): boolean => /^```/.test(l)
  const isTable = (l: string): boolean => /^\s*\|/.test(l) && l.includes('|')
  const inline = (l: string): string => formatInline(escapeHtml(l))

  /** Pipe table: 1st line is the header when the 2nd is the |---|---| separator. */
  const renderTable = (rows: string[]): string => {
    const clean = (l: string): string => l.trim().replace(/^\|/, '').replace(/\|$/, '')
    const cells = (l: string): string[] => clean(l).split('|').map((c) => c.trim())
    const isSep = (l: string): boolean => /^[\s|:|-]+$/.test(l) && l.includes('-')
    const rowsParsed = rows.map((l) => ({ raw: l, cells: cells(l), isSep: isSep(l) }))
    const hasHeader = rowsParsed.length > 1 && rowsParsed[1].isSep
    const headerCells = hasHeader ? rowsParsed[0] : null
    const body = (hasHeader ? rowsParsed.slice(2) : rowsParsed).filter((f) => !f.isSep)
    let html = ''
    if (headerCells) {
      html += `<thead><tr>${headerCells.cells.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`
    }
    html += `<tbody>${body
      .map((f) => `<tr>${f.cells.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
      .join('')}</tbody>`
    return `<table>${html}</table>`
  }

  while (i < lines.length) {
    const line = lines[i]

    if (isFence(line)) {
      const buf: string[] = []
      i++
      while (i < lines.length && !isFence(lines[i])) {
        buf.push(lines[i])
        i++
      }
      i++ // closes ```
      blocks.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`)
    } else if (isHeading(line)) {
      const m = /^(#{1,3})\s+(.*)$/.exec(line)!
      blocks.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`)
      i++
    } else if (isQuote(line)) {
      const buf: string[] = []
      while (i < lines.length && isQuote(lines[i])) {
        buf.push(inline(lines[i].replace(/^>\s?/, '')))
        i++
      }
      blocks.push(`<blockquote>${buf.join('<br>')}</blockquote>`)
    } else if (isUl(line)) {
      const items: string[] = []
      while (i < lines.length && isUl(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^[-*]\s+/, ''))}</li>`)
        i++
      }
      blocks.push(`<ul>${items.join('')}</ul>`)
    } else if (isOl(line)) {
      const items: string[] = []
      while (i < lines.length && isOl(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\d+\.\s+/, ''))}</li>`)
        i++
      }
      blocks.push(`<ol>${items.join('')}</ol>`)
    } else if (isTable(line)) {
      const bufT: string[] = [line]
      i++
      while (i < lines.length && isTable(lines[i])) {
        bufT.push(lines[i])
        i++
      }
      blocks.push(renderTable(bufT))
    } else if (line.trim() === '') {
      i++
    } else {
      // paragraph: joins consecutive lines that don't start another block
      const buf = [line]
      i++
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !isHeading(lines[i]) &&
        !isQuote(lines[i]) &&
        !isUl(lines[i]) &&
        !isOl(lines[i]) &&
        !isFence(lines[i])
      ) {
        buf.push(lines[i])
        i++
      }
      blocks.push(`<p>${buf.map(inline).join('<br>')}</p>`)
    }
  }

  if (blocks.length === 0) return '<p class="diary-preview-empty">Sem conteúdo ainda.</p>'
  return blocks.join('\n')
}
