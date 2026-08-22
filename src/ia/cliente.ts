/** AI client — BYOK with streaming, always talks to /api/ia (Netlify Function
 *  in prod, Vite middleware in dev). Supports the collapsible model reasoning
 *  (DeepSeek R1, OpenAI o-series, Gemini thinking) via the onReasoning callback. */

import type { AiConfig, AiProvider } from '../core/tipos'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamOptions {
  onContent: (delta: string) => void
  onReasoning?: (delta: string) => void
}

/** Default model per provider (when the user leaves the field empty). */
export function defaultModel(p: AiProvider): string {
  switch (p) {
    case 'deepseek':
      // Distilled R1: real reasoning, cheap, works well as the default.
      return 'deepseek-reasoner'
    case 'opencode':
      return 'deepseek-v4-flash'
    default:
      return ''
  }
}

/** Models suggested in the UI (ordered — the first is the recommended one). */
export const MODELS_BY_PROVIDER: Record<AiProvider, string[]> = {
  nenhum: [],
  deepseek: ['deepseek-reasoner', 'deepseek-chat'],
  opencode: ['deepseek-v4-flash'],
}

/** Streaming call timeout — without it, a stuck connection leaves the chat
 *  stuck in "busy" (input disabled forever) — real bug 2026-08-12. */
const AI_TIMEOUT_MS = 90_000
const TEST_TIMEOUT_MS = 30_000

export class AiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiError'
  }
}

interface SseEvent {
  /** Text accumulators. */
  content: string
  reasoning: string
  done: boolean
  /** Error returned by the upstream (4xx/5xx status arrived in the stream). */
  error?: string
}

/** Reads an SSE stream in the OpenAI-compatible format (data: {...}).
 *  Accumulates `delta.content` and `delta.reasoning_content` separately. */
async function readSSE(res: Response, opts: StreamOptions): Promise<SseEvent> {
  if (!res.body) return { content: '', reasoning: '', done: true }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buffer = ''
  let content = ''
  let reasoning = ''
  let done = false
  let error: string | undefined
  for (;;) {
    const { done: d, value } = await reader.read()
    if (d) break
    buffer += dec.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const l = line.trim()
      if (!l.startsWith('data:')) continue
      const data = l.slice(5).trim()
      if (data === '[DONE]') {
        done = true
        continue
      }
      try {
        const obj = JSON.parse(data)
        const delta = obj.choices?.[0]?.delta ?? {}
        // Reasoning: DeepSeek R1 sends `reasoning_content`; OpenAI o-series
        // sends `reasoning` (varies by provider). Covers both.
        const reasoningDelta =
          typeof delta.reasoning_content === 'string'
            ? delta.reasoning_content
            : typeof delta.reasoning === 'string'
              ? delta.reasoning
              : ''
        if (reasoningDelta) {
          reasoning += reasoningDelta
          opts.onReasoning?.(reasoningDelta)
        }
        const contentDelta = delta.content
        if (typeof contentDelta === 'string' && contentDelta) {
          content += contentDelta
          opts.onContent(contentDelta)
        }
        if (obj.error?.message) error = obj.error.message
      } catch {
        /* non-JSON chunk (keep-alive, etc.) — ignore */
      }
    }
  }
  return { content, reasoning, done, error }
}

async function errorFrom(res: Response): Promise<AiError> {
  let detail = ''
  try {
    const j = (await res.json()) as { error?: { message?: string } }
    detail = j.error?.message ?? ''
  } catch {
    /* non-JSON body */
  }
  return new AiError(detail || `Falha na chamada (HTTP ${res.status}).`)
}

/** Sends the conversation and returns the accumulated content + reasoning. */
export async function sendToAI(
  ia: AiConfig,
  messages: ChatMessage[],
  opts: StreamOptions,
): Promise<{ content: string; reasoning: string }> {
  if (ia.provider === 'nenhum') {
    throw new AiError('Escolha um provider em Config → Fábula.')
  }
  const model = ia.model.trim() || defaultModel(ia.provider)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
  try {
    const res = await fetch('/api/ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        provider: ia.provider,
        model: model,
        messages: messages,
        apiKey: ia.apiKey,
        stream: true,
      }),
    })
    if (!res.ok) throw await errorFrom(res)
    const result = await readSSE(res, opts)
    if (result.error) throw new AiError(result.error)
    return { content: result.content, reasoning: result.reasoning }
  } catch (err) {
    if (err instanceof AiError) throw err
    throw new AiError(fetchMessage(err))
  } finally {
    clearTimeout(timer)
  }
}

/** Friendly fetch/abort error message (streaming timeout). */
function fetchMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return 'A resposta demorou demais e foi interrompida. Tente de novo.'
  }
  return `Não consegui contactar a IA (/api/ia). ${err instanceof Error ? err.message : String(err)}`
}

/** Connection test (blocking call, no streaming). */
export async function testConnection(ia: AiConfig): Promise<string> {
  if (ia.provider === 'nenhum') throw new AiError('Escolha um provider.')
  const model = ia.model.trim() || defaultModel(ia.provider)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS)
  try {
    const res = await fetch('/api/ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        provider: ia.provider,
        model: model,
        messages: [{ role: 'user', content: 'Responda apenas: ok' }],
        apiKey: ia.apiKey,
        stream: false,
      }),
    })
    if (!res.ok) throw await errorFrom(res)
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return j.choices?.[0]?.message?.content ?? ''
  } catch (err) {
    if (err instanceof AiError) throw err
    throw new AiError(fetchMessage(err))
  } finally {
    clearTimeout(timer)
  }
}
