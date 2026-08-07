/**
 * Netlify Function: /api/ia
 *
 * Proxy BYOK do chat da Fábula. Recebe {provider, model, messages, systemPrompt, apiKey}
 * e repassa ao upstream (OpenAI-compatível, com Gemini no endpoint OpenAI do Google).
 *
 * Suporta streaming SSE (mode: "stream") e chamada bloqueante (mode: "block").
 * A chave NUNCA é logada — vem no body da request do browser (BYOK) ou em
 * env var (OPENCODE_GO_ESQUIZOMONRPG_TOKEN, etc.) como fallback opcional.
 *
 * Providers suportados no MVP:
 *   - "deepseek"   → https://api.deepseek.com/v1
 *   - "opencode"   → https://opencode.ai/zen/go/v1
 *
 * O frontend decide o provider com base na config; esta function é agnóstica
 * (só precisa do `target` que o body pode trazer OU inferir do `provider`).
 */

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface RequestBody {
  provider: 'deepseek' | 'opencode'
  model: string
  messages: Message[]
  systemPrompt?: string
  apiKey?: string
  stream?: boolean
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '3600',
}

/** Endpoint OpenAI-compatível de cada provider. */
const TARGETS: Record<RequestBody['provider'], string> = {
  deepseek: 'https://api.deepseek.com/v1',
  opencode: 'https://opencode.ai/zen/go/v1',
}

/** Env vars opcionais (server-side) — usadas se o body não trouxer apiKey. */
function envKey(provider: RequestBody['provider']): string | undefined {
  if (provider === 'opencode') {
    return (
      process.env.OPENCODE_GO_ESQUIZOMONRPG_TOKEN ??
      process.env.OPENCODE_GO_API_KEY ??
      undefined
    )
  }
  if (provider === 'deepseek') return process.env.DEEPSEEK_API_KEY ?? undefined
  return undefined
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (req.method !== 'POST') {
    return jsonError(405, 'Método não permitido.')
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return jsonError(400, 'Corpo JSON inválido.')
  }

  const { provider, model, messages, systemPrompt, stream = true } = body
  if (!provider || !(provider in TARGETS)) {
    return jsonError(400, 'Provider inválido ou não suportado.')
  }
  if (!model || typeof model !== 'string') {
    return jsonError(400, 'Modelo ausente.')
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonError(400, 'Mensagens ausentes.')
  }

  const apiKey = (body.apiKey ?? '').trim() || envKey(provider)
  if (!apiKey) {
    return jsonError(401, 'Sem chave. Configure a IA em Config → Fábula.')
  }

  // System prompt do app entra como primeira mensagem system.
  const mensagens: Message[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages

  const payload = JSON.stringify({
    model,
    messages: mensagens,
    stream,
    // Pede raciocínio quando o modelo suporta (OpenAI o-series, DeepSeek R1,
    // Gemini thinking). O cliente decide qual modelo usar; aqui só pedimos.
  })

  const target = `${TARGETS[provider]}/chat/completions`

  let up: Response
  try {
    up = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: payload,
    })
  } catch (err) {
    return jsonError(502, `Falha ao contactar o upstream: ${String(err)}`)
  }

  if (!up.ok) {
    // Repassa o erro do upstream (sem expor a chave) — útil para o usuário ver
    // "model not found", "insufficient balance", etc.
    const texto = await up.text()
    return new Response(texto, {
      status: up.status,
      headers: { ...CORS, 'Content-Type': up.headers.get('content-type') ?? 'application/json' },
    })
  }

  const ct = up.headers.get('content-type') ?? ''

  if (stream && ct.includes('text/event-stream')) {
    // Repassa o stream SSE cru — o cliente faz o parse.
    return new Response(up.body, {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }

  // Resposta bloqueante (modo "teste de conexão" do cliente, p.ex.).
  const texto = await up.text()
  return new Response(texto, {
    status: up.status,
    headers: { ...CORS, 'Content-Type': ct || 'application/json' },
  })
}

// Netlify Functions (formato AWS Lambda-style) e Vite middleware
// (que importam este arquivo) precisam do mesmo handler. Exportamos
// `handler` (Lambda) e `handle` (Request/Response) — o middleware usa
// o segundo, a Netlify adapta o primeiro.
export async function handler(event: { httpMethod: string; body: string | null }): Promise<{
  statusCode: number
  headers: Record<string, string>
  body: string
  isBase64Encoded?: boolean
}> {
  const req = new Request('https://local/api/ia', {
    method: event.httpMethod,
    body: event.body ?? undefined,
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await handle(req)
  const headers: Record<string, string> = {}
  res.headers.forEach((v, k) => (headers[k] = v))
  return {
    statusCode: res.status,
    headers,
    body: await res.text(),
  }
}

export { handle }
