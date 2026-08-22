/** Markdown parser for bulk diary import.
 *
 *  Accepted format: blocks starting with a heading with date in
 *  `## AAAA-MM-DD` format (any `#` level works). Optional title on the FIRST
 *  line of the block in **bold** (`**Título**`); the rest of the block is the
 *  body (markdown preserved as-is). Text outside date blocks is ignored.
 */

export interface ImportableEntry {
  date: string
  title?: string
  text: string
}

const RE_HEADING_DATE = /^#{1,6}\s+(\d{4}-\d{2}-\d{2})\s*$/

export function parseDiaryMarkdown(text: string): ImportableEntry[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const entries: ImportableEntry[] = []
  let block: { date: string; lines: string[] } | null = null

  for (const line of lines) {
    const m = line.match(RE_HEADING_DATE)
    if (m) {
      if (block) entries.push(finalizeBlock(block))
      block = { date: m[1], lines: [] }
      continue
    }
    if (block) block.lines.push(line)
  }
  if (block) entries.push(finalizeBlock(block))

  return entries
}

function finalizeBlock(block: { date: string; lines: string[] }): ImportableEntry {
  const body = block.lines.map((l) => l.trimEnd())
  // removes empty lines from the top
  let i = 0
  while (i < body.length && body[i].trim() === '') i++
  const rest = body.slice(i)

  // first line in **bold** (or h1) becomes the title; the rest is the body
  let title: string | undefined
  let text: string
  const titleLine = rest[0]?.match(/^\*\*(.+)\*\*\s*$/) ?? rest[0]?.match(/^#\s+(.+)$/)
  if (titleLine) {
    title = titleLine[1].trim() || undefined
    text = rest.slice(1).join('\n').trim()
  } else {
    text = rest.join('\n').trim()
  }
  return { date: block.date, title, text }
}
