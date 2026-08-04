/** Cliente de IA do chat da Fábula — BYOK com streaming.
 *  - Gemini: chamada direta (CORS liberado).
 *  - opencode/OpenAI/DeepSeek: via mini-proxy local (server-ia.js) por causa do CORS. */

import type { ConfigIa, ProviderIA } from '../core/tipos'

export interface MsgChat {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Base URL OpenAI-compatível de cada provider. */
export const BASE_PROVIDER: Record<ProviderIA, string> = {
  nenhum: '',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  opencode: 'https://opencode.ai/zen/go/v1',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
}

/** Modelo padrão por provider (usado quando o campo modelo está vazio). */
export function modeloPadrao(p: ProviderIA): string {
  switch (p) {
    case 'gemini':
      return 'gemini-2.0-flash'
    case 'opencode':
      return 'deepseek-v4-flash'
    case 'openai':
      return 'gpt-4o-mini'
    case 'deepseek':
      return 'deepseek-chat'
    default:
      return ''
  }
}

export class ErroIA extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErroIA'
  }
}

/** URL do proxy local (configurável via env em build). */
function proxyUrl(): string {
  return (import.meta.env.VITE_IA_PROXY as string | undefined) ?? 'http://localhost:5177'
}

/** Lê um stream SSE e acumula o conteúdo, chamando onDelta a cada pedaço. */
async function lerSSE(res: Response, onDelta: (t: string) => void): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buffer = ''
  let total = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += dec.decode(value, { stream: true })
    const linhas = buffer.split('\n')
    buffer = linhas.pop() ?? ''
    for (const linha of linhas) {
      const l = linha.trim()
      if (!l.startsWith('data:')) continue
      const dados = l.slice(5).trim()
      if (dados === '[DONE]') continue
      try {
        const obj = JSON.parse(dados)
        const delta = obj.choices?.[0]?.delta?.content ?? ''
        if (delta) {
          total += delta
          onDelta(delta)
        }
      } catch {
        /* chunk não-JSON (ex.: keep-alive) — ignora */
      }
    }
  }
  return total
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

/** Envia a conversa para o provider configurado com streaming. */
export async function conversarComFabula(
  ia: ConfigIa,
  mensagens: MsgChat[],
  onDelta: (t: string) => void,
): Promise<string> {
  if (ia.provider === 'nenhum' || !ia.apiKey.trim()) {
    throw new ErroIA('Configure a IA em Config → Fábula (provider e chave).')
  }
  const modelo = ia.modelo.trim() || modeloPadrao(ia.provider)
  const body = JSON.stringify({ model: modelo, messages: mensagens, stream: true })
  const base = BASE_PROVIDER[ia.provider]

  let res: Response
  if (ia.provider === 'gemini') {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ia.apiKey.trim()}` },
      body,
    })
  } else {
    // providers sem CORS → mini-proxy local
    res = await fetch(`${proxyUrl()}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ia.apiKey.trim()}`,
        'X-Target-Host': base,
      },
      body,
    })
  }

  if (!res.ok) throw await erroDa(res)
  return lerSSE(res, onDelta)
}

/** Testa a configuração com uma mensagem mínima (sem streaming). */
export async function testarConexao(ia: ConfigIa): Promise<string> {
  if (ia.provider === 'nenhum' || !ia.apiKey.trim()) {
    throw new ErroIA('Escolha um provider e informe a chave.')
  }
  const modelo = ia.modelo.trim() || modeloPadrao(ia.provider)
  const base = BASE_PROVIDER[ia.provider]
  const body = JSON.stringify({
    model: modelo,
    messages: [{ role: 'user', content: 'Responda apenas: ok' }],
    stream: false,
  })

  let res: Response
  if (ia.provider === 'gemini') {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ia.apiKey.trim()}` },
      body,
    })
  } else {
    res = await fetch(`${proxyUrl()}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ia.apiKey.trim()}`,
        'X-Target-Host': base,
      },
      body,
    })
  }

  if (!res.ok) throw await erroDa(res)
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return j.choices?.[0]?.message?.content ?? ''
}
