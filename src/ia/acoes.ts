/** Fable → app action channel: structured markers at the end of the answer.
 *  The Fable appends `[[acao:{"type":"...","card":"<id>"}]]` and the app executes
 *  (deducts mana, validates, records). The marker is removed from the shown text. */

export interface InvokeAction {
  type: 'invocar'
  card: string
}

export type AiAction = InvokeAction

/** Comandos do chat (digitados com /). O app converte o comando numa frase
 *  natural before sending to the Fable — the history reads as a conversation. */
export interface AiCommand {
  type: 'invocar' | 'analisar' | 'capturas'
  /** invocar com nome: termo digitado (nome ou slug da carta). */
  card?: string
  /** invoke WITHOUT a name: the Fable picks the card (premium cost ×1.5). */
  fableChoice: boolean
}

const ACTION_RE = /\[\[acao:\s*(\{[\s\S]*?\})\s*\]\]/g

/** Extracts the markers from the text and returns the clean text + the actions. */
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
  return { text: clean.replace(/\[\[acao:[\s\S]*?\]\]/g, '').trim(), actions }
}

/** Detects an EXPLICIT invocation request in the user's message
 *  ("invoca a carta X", "pode invocar X?", "me invoca a carta ninho...") and
 *  returns the card term (name or id). Null if it's not an invocation request.
 *  Used by the chat to run the invocation IN THE APP (deterministic), without
 *  relying on the model emitting the marker. */
export function detectInvocationRequest(text: string): string | null {
  const t = text.trim()
  const m =
    t.match(/^(?:me\s+|por\s+favor\s*,\s*)?(?:pode\s+|poderia\s+)?invoc\w*\s+(?:a\s+carta\s+)?(.+)$/i) ??
    t.match(/invoc\w*\s+(?:a\s+carta\s+)?([^\n.!?]+)/i)
  if (!m) return null
  const term = m[1].trim()
  return term || null
}

/** Detects chat commands (typed with /): `/invocar <carta>` (normal
 *  invocation), `/invocar` without a name or `/fabula-invoca` (the FABLE picks the
 *  card — premium cost) and `/analisar` (schizoanalytic analysis, 10 mana). Returns
 *  the command for the app to convert into natural speech and orchestrate the action. */
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
