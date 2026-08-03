/** Renderização de notas com markdown simples: **negrito**, *itálico* e links (https://…).
 *  Seguro: escapa HTML antes de aplicar os marcadores. */

export function renderizarNotas(texto: string): string {
  const esc = texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  // links primeiro (https://...), clicáveis em nova aba
  const comLinks = esc.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')

  // negrito **texto**
  const comNegrito = comLinks.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

  // itálico *texto* (após o negrito, para não pegar os **)
  const comItalico = comNegrito.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')

  // quebras de linha → <br>
  return comItalico.replace(/\n/g, '<br>')
}
