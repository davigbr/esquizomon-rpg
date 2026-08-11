/** Utilitários compartilhados de UI. */

/** Escapa HTML (seguro para qualquer entrada). Fonte única de escape do app. */
export function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
