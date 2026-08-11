/** Renderização de notas com markdown simples — reusa o formatador inline
 *  unificado do preview (escapar + links/strong/em) e adiciona quebras de linha. */

import { escapar } from './util'
import { formatarInline } from './editorMd'

export function renderizarNotas(texto: string): string {
  return formatarInline(escapar(texto)).replace(/\n/g, '<br>')
}
