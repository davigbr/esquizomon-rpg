/** Canal de ação Fábula → app: marcadores estruturados no fim da resposta.
 *  A Fábula anexa `[[acao:{"tipo":"...","carta":"<id>"}]]` e o app executa
 *  (desconta mana, valida, registra). O marcador é removido do texto exibido. */

export interface AcaoInvocar {
  tipo: 'invocar'
  carta: string
}

export type AcaoIA = AcaoInvocar

const RE_ACAO = /\[\[acao:(\{[\s\S]*?)\]\]/g

/** Extrai os marcadores do texto e devolve o texto limpo + as ações. */
export function extrairAcoes(texto: string): { texto: string; acoes: AcaoIA[] } {
  const acoes: AcaoIA[] = []
  const limpo = texto.replace(RE_ACAO, (_match, json: string) => {
    try {
      const obj: unknown = JSON.parse(json)
      if (
        typeof obj === 'object' &&
        obj !== null &&
        (obj as Record<string, unknown>).tipo === 'invocar' &&
        typeof (obj as Record<string, unknown>).carta === 'string' &&
        ((obj as Record<string, unknown>).carta as string).trim()
      ) {
        acoes.push({ tipo: 'invocar', carta: ((obj as Record<string, unknown>).carta as string).trim() })
      }
    } catch {
      // marcador malformado — remove mesmo assim, sem executar
    }
    return ''
  })
  return { texto: limpo.trim(), acoes }
}
