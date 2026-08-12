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

/** Detecta um pedido EXPLÍCITO de invocação na mensagem do usuário
 *  ("invoca a carta X", "pode invocar X?", "me invoca a carta ninho...") e
 *  devolve o termo da carta (nome ou id). Null se não for pedido de invocação.
 *  Usado pelo chat pra executar a invocação NO APP (determinístico), sem
 *  depender do modelo emitir o marcador. */
export function detectarPedidoInvocacao(texto: string): string | null {
  const t = texto.trim()
  const m =
    t.match(/^(?:me\s+|por\s+favor\s*,\s*)?(?:pode\s+|poderia\s+)?invoc\w*\s+(?:a\s+carta\s+)?(.+)$/i) ??
    t.match(/invoc\w*\s+(?:a\s+carta\s+)?([^\n.!?]+)/i)
  if (!m) return null
  const termo = m[1].trim()
  return termo || null
}
