#!/usr/bin/env node
/**
 * serve-ia — mini-proxy local para o chat da Fábula (BYOK).
 *
 * O browser não pode chamar APIs como opencode.ai/zen/go (sem headers CORS).
 * Este servidor roda em localhost:5177, adiciona CORS e repassa chamadas
 * OpenAI-compatíveis para o upstream escolhido.
 *
 *   npm run serve-ia            # sobe na porta 5177
 *   IA_UPSTREAM=... npm run serve-ia   # upstream padrão (default: opencode Zen Go)
 *
 * O app envia `Authorization: Bearer <chave>` e opcionalmente `X-Target-Host`
 * para escolher o upstream por chamada. Suporta streaming (SSE).
 */
import http from 'node:http'

const PORT = Number(process.env.IA_PROXY_PORT ?? 5177)
const DEFAULT_UPSTREAM = process.env.IA_UPSTREAM ?? 'https://opencode.ai/zen/go/v1'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Target-Host',
  'Access-Control-Max-Age': '3600',
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, upstream: DEFAULT_UPSTREAM }))
    return
  }

  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    const base = String(req.headers['x-target-host'] || DEFAULT_UPSTREAM).replace(/\/+$/, '')
    const auth = String(req.headers['authorization'] || '')
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = Buffer.concat(chunks).toString('utf8')

    if (!auth) {
      res.writeHead(401, { ...CORS, 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'Sem chave. Configure a IA em Config → Fábula.' } }))
      return
    }

    try {
      const up = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body,
      })
      const ct = up.headers.get('content-type') ?? ''

      if (ct.includes('text/event-stream')) {
        res.writeHead(up.status, { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
        const reader = up.body.getReader()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(Buffer.from(value))
        }
        res.end()
      } else {
        const texto = await up.text()
        res.writeHead(up.status, { ...CORS, 'Content-Type': ct || 'application/json' })
        res.end(texto)
      }
    } catch (err) {
      res.writeHead(502, { ...CORS, 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'Falha ao falar com o upstream: ' + String(err) } }))
    }
    return
  }

  res.writeHead(404, { ...CORS, 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: { message: 'Rota desconhecida.' } }))
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[serve-ia] proxy OpenAI-compatível em http://localhost:${PORT}`)
  console.log(`[serve-ia] upstream padrão: ${DEFAULT_UPSTREAM}`)
})
