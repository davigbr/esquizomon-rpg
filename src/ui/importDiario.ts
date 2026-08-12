/** Parser de markdown para importação em massa do diário.
 *
 *  Formato aceito: blocos iniciados por heading com data no formato
 *  `## AAAA-MM-DD` (qualquer nível `#` funciona). Título opcional na PRIMEIRA
 *  linha do bloco em **negrito** (`**Título**`); o resto do bloco é o corpo
 *  (markdown preservado como está). Texto fora de blocos com data é ignorado.
 */

export interface EntradaImportavel {
  data: string
  titulo?: string
  texto: string
}

const RE_HEADING_DATA = /^#{1,6}\s+(\d{4}-\d{2}-\d{2})\s*$/

export function parsearMarkdownDiario(texto: string): EntradaImportavel[] {
  const linhas = texto.replace(/\r\n/g, '\n').split('\n')
  const entradas: EntradaImportavel[] = []
  let bloco: { data: string; linhas: string[] } | null = null

  for (const linha of linhas) {
    const m = linha.match(RE_HEADING_DATA)
    if (m) {
      if (bloco) entradas.push(finalizarBloco(bloco))
      bloco = { data: m[1], linhas: [] }
      continue
    }
    if (bloco) bloco.linhas.push(linha)
  }
  if (bloco) entradas.push(finalizarBloco(bloco))

  return entradas
}

function finalizarBloco(bloco: { data: string; linhas: string[] }): EntradaImportavel {
  const corpo = bloco.linhas.map((l) => l.trimEnd())
  // remove linhas vazias do topo
  let i = 0
  while (i < corpo.length && corpo[i].trim() === '') i++
  const restante = corpo.slice(i)

  // primeira linha em **negrito** (ou h1) vira título; o resto é o corpo
  let titulo: string | undefined
  let texto: string
  const linhaTitulo = restante[0]?.match(/^\*\*(.+)\*\*\s*$/) ?? restante[0]?.match(/^#\s+(.+)$/)
  if (linhaTitulo) {
    titulo = linhaTitulo[1].trim() || undefined
    texto = restante.slice(1).join('\n').trim()
  } else {
    texto = restante.join('\n').trim()
  }
  return { data: bloco.data, titulo, texto }
}
