/** Renders notes with simple markdown — reuses the unified inline formatter
 *  from the preview (escape + links/strong/em) and adds line breaks. */

import { escapeHtml } from './util'
import { formatInline } from './editorMd'

export function renderNotes(text: string): string {
  return formatInline(escapeHtml(text)).replace(/\n/g, '<br>')
}
