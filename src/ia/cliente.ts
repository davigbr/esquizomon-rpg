/** Cliente de IA — BYOK com streaming, fala sempre com /api/ia (Netlify Function
 *  em prod, Vite middleware em dev). Suporta raciocínio do modelo colapsável
 *  (DeepSeek R1, OpenAI o-series, Gemini thinking) via callback onReasoning. */

import type { ConfigIa, ProviderIA } from '../core/tipos'

export interface MsgChat {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OpcoesStream {
  onContent: (delta: string) => void
  onReasoning?: (delta: string) => void
}

/** Modelo padrão por provider (quando o usuário deixa o campo vazio). */
export function modeloPadrao(p: ProviderIA): string {
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
export const MODELOS_POR_PROVIDER: Record<ProviderIA, string[]> = {
  nenhum: [],
  deepseek: ['deepseek-reasoner', 'deepseek-chat'],
  opencode: ['deepseek-v4-flash'],
}

export class ErroIA extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErroIA'
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
async function lerSSE(res: Response, opts: OpcoesStream): Promise<SseEvent> {
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
    const linhas = buffer.split('\n')
    buffer = linhas.pop() ?? ''
    for (const linha of linhas) {
      const l = linha.trim()
      if (!l.startsWith('data:')) continue
      const dados = l.slice(5).trim()
      if (dados === '[DONE]') {
        done = true
        continue
      }
      try {
        const obj = JSON.parse(dados)
        const delta = obj.choices?.[0]?.delta ?? {}
        // Raciocínio: DeepSeek R1 envia `reasoning_content`; OpenAI o-series
        // envia em `reasoning` (varia por provider). Cobre os dois.
        const raciocinio =
          typeof delta.reasoning_content === 'string'
            ? delta.reasoning_content
            : typeof delta.reasoning === 'string'
              ? delta.reasoning
              : ''
        if (raciocinio) {
          reasoning += raciocinio
          opts.onReasoning?.(raciocinio)
        }
        const conteudo = delta.content
        if (typeof conteudo === 'string' && conteudo) {
          content += conteudo
          opts.onContent(conteudo)
        }
        if (obj.error?.message) error = obj.error.message
      } catch {
        /* chunk não-JSON (keep-alive, etc.) — ignora */
      }
    }
  }
  return { content, reasoning, done, error }
}

async function erroDa(res: Response): Promise<ErroIA> {
  let detalhe = ''
  try {
    const j = (await res.json()) as { error?: { message?: string } }
    detalhe = j.error?.message ?? ''
  } catch {
    /* corpo não-JSON */
  }
  return new ErroIA(detalhe || `Falha na chamada (HTTP ${res.status}).`)
}

/** Envia a conversa e retorna o conteúdo + raciocínio acumulados. */
export async function enviarParaIA(
  ia: ConfigIa,
  mensagens: MsgChat[],
  opts: OpcoesStream,
): Promise<{ content: string; reasoning: string }> {
  if (ia.provider === 'nenhum') {
    throw new ErroIA('Escolha um provider em Config → Fábula.')
  }
  const modelo = ia.modelo.trim() || modeloPadrao(ia.provider)

  let res: Response
  try {
    res = await fetch('/api/ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: ia.provider,
        model: modelo,
        messages: mensagens,
        apiKey: ia.apiKey,
        stream: true,
      }),
    })
  } catch (err) {
    throw new ErroIA(
      `Não consegui contactar a IA (/api/ia). ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) throw await erroDa(res)
  const resultado = await lerSSE(res, opts)
  if (resultado.error) throw new ErroIA(resultado.error)
  return { content: resultado.content, reasoning: resultado.reasoning }
}

/** Teste de conexão (chamada bloqueante, sem streaming). */
export async function testarConexao(ia: ConfigIa): Promise<string> {
  if (ia.provider === 'nenhum') throw new ErroIA('Escolha um provider.')
  const modelo = ia.modelo.trim() || modeloPadrao(ia.provider)
  const res = await fetch('/api/ia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: ia.provider,
      model: modelo,
      messages: [{ role: 'user', content: 'Responda apenas: ok' }],
      apiKey: ia.apiKey,
      stream: false,
    }),
  })
  if (!res.ok) throw await erroDa(res)
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return j.choices?.[0]?.message?.content ?? ''
}
