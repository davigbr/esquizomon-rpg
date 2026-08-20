/** Canal de ação Fábula → app: marcadores estruturados no fim da resposta.
 *  A Fábula anexa `[[acao:{"type":"...","card":"<id>"}]]` e o app executa
 *  (desconta mana, valida, registra). O marcador é removido do texto exibido. */

export interface InvokeAction {
  type: 'invocar'
  card: string
}

export type AiAction = InvokeAction

/** Comandos do chat (digitados com /). O app converte o comando numa frase
 *  natural antes de enviar à Fábula — o histórico lê como conversa. */
export interface AiCommand {
  type: 'invocar' | 'analisar' | 'capturas'
  /** invocar com nome: termo digitado (nome ou slug da carta). */
  card?: string
  /** invocar SEM nome: a Fábula escolhe a carta (custo premium ×1,5). */
  fableChoice: boolean
}

const ACTION_RE = /\[\[acao:\s*(\{[\s\S]*?\})\s*\]\]/g

/** Extrai os marcadores do texto e devolve o texto limpo + as ações. */
export function extractActions(text: string): { text: string; actions: AiAction[] } {
  const actions: AiAction[] = []
  const clean = text.replace(ACTION_RE, (_match, json: string) => {
    try {
      const obj: unknown = JSON.parse(json)
      if (typeof obj !== 'object' || obj === null) return ''
      const o = obj as Record<string, unknown>
      const actionType = o.tipo ?? o.type
      const cardRaw = o.carta ?? o.card
      if (actionType === 'invocar' && typeof cardRaw === 'string' && cardRaw.trim()) {
        actions.push({ type: 'invocar', card: cardRaw.trim() })
      }
    } catch {
      // marcador malformado — remove mesmo assim, sem executar
    }
    return ''
  })
  return { text: clean.trim(), actions }
}

/** Detecta um pedido EXPLÍCITO de invocação na mensagem do usuário
 *  ("invoca a carta X", "pode invocar X?", "me invoca a carta ninho...") e
 *  devolve o termo da carta (nome ou id). Null se não for pedido de invocação.
 *  Usado pelo chat pra executar a invocação NO APP (determinístico), sem
 *  depender do modelo emitir o marcador. */
export function detectInvocationRequest(text: string): string | null {
  const t = text.trim()
  const m =
    t.match(/^(?:me\s+|por\s+favor\s*,\s*)?(?:pode\s+|poderia\s+)?invoc\w*\s+(?:a\s+carta\s+)?(.+)$/i) ??
    t.match(/invoc\w*\s+(?:a\s+carta\s+)?([^\n.!?]+)/i)
  if (!m) return null
  const term = m[1].trim()
  return term || null
}

/** Detecta comandos do chat (digitados com /): `/invocar <carta>` (invocação
 *  normal), `/invocar` sem nome ou `/fabula-invoca` (a FÁBULA escolhe a carta —
 *  custo premium) e `/analisar` (análise esquizoanalítica, 10 mana). Devolve o
 *  comando pra o app converter em frase natural e orquestrar a ação. */
export function detectCommand(text: string): AiCommand | null {
  const m = text.trim().match(/^\/([a-z-]+)(?:\s+(.*))?$/i)
  if (!m) return null
  const name = m[1].toLowerCase()
  const rest = (m[2] ?? '').trim()
  if (name === 'invocar' || name === 'fabula-invoca') {
    return rest ? { type: 'invocar', card: rest, fableChoice: false } : { type: 'invocar', fableChoice: true }
  }
  if (name === 'analisar') return { type: 'analisar', fableChoice: false }
  if (name === 'capturas') return { type: 'capturas', fableChoice: false }
  return null
}
