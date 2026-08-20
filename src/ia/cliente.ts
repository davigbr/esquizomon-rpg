/** Cliente de IA — BYOK com streaming, fala sempre com /api/ia (Netlify Function
 *  em prod, Vite middleware em dev). Suporta raciocínio do modelo colapsável
 *  (DeepSeek R1, OpenAI o-series, Gemini thinking) via callback onReasoning. */

import type { AiConfig, AiProvider } from '../core/tipos'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamOptions {
  onContent: (delta: string) => void
  onReasoning?: (delta: string) => void
}

/** Modelo padrão por provider (quando o usuário deixa o campo vazio). */
export function defaultModel(p: AiProvider): string {
  switch (p) {
    case 'deepseek':
      // R1 distilado: raciocínio real, barata, serve bem como default.
      return 'deepseek-reasoner'
    case 'opencode':
      return 'deepseek-v4-flash'
    default:
      return ''
  }
}

/** Modelos sugeridos na UI (ordenados — o primeiro é o recomendado). */
export const MODELS_BY_PROVIDER: Record<AiProvider, string[]> = {
  nenhum: [],
  deepseek: ['deepseek-reasoner', 'deepseek-chat'],
  opencode: ['deepseek-v4-flash'],
}

/** Timeout da chamada de streaming — sem ele, uma conexão travada deixa o
 *  chat preso em "ocupado" (input desabilitado pra sempre) — bug real 2026-08-12. */
const AI_TIMEOUT_MS = 90_000
const TEST_TIMEOUT_MS = 30_000

export class AiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiError'
  }
}

interface SseEvent {
  /** Acumuladores de texto. */
  content: string
  reasoning: string
  done: boolean
  /** Erro retornado pelo upstream (status 4xx/5xx chegou no stream). */
  error?: string
}

/** Lê um stream SSE no formato OpenAI-compat (data: {...}).
 *  Acumula `delta.content` e `delta.reasoning_content` separadamente. */
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
        // Raciocínio: DeepSeek R1 envia `reasoning_content`; OpenAI o-series
        // envia em `reasoning` (varia por provider). Cobre os dois.
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
        /* chunk não-JSON (keep-alive, etc.) — ignora */
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
    /* corpo não-JSON */
  }
  return new AiError(detail || `Falha na chamada (HTTP ${res.status}).`)
}

/** Envia a conversa e retorna o conteúdo + raciocínio acumulados. */
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

/** Mensagem amigável de erro de fetch/abort (timeout do streaming). */
function fetchMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return 'A resposta demorou demais e foi interrompida. Tente de novo.'
  }
  return `Não consegui contactar a IA (/api/ia). ${err instanceof Error ? err.message : String(err)}`
}

/** Teste de conexão (chamada bloqueante, sem streaming). */
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
