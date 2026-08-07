/**
 * Vite middleware — serve /api/ia em dev reusando a Netlify Function.
 *
 * O app fala sempre com /api/ia, em dev e prod. Em prod o Netlify redireciona
 * pra /.netlify/functions/ia; em dev este middleware importa a mesma função
 * e responde direto. Zero processo extra.
 */
import type { Plugin } from 'vite'
import { handle } from '../netlify/functions/ia'

export function iaDevProxy(): Plugin {
  return {
    name: 'esquizomon-rpg:ia-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ia', async (req, res) => {
        try {
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers.set(k, v)
            else if (Array.isArray(v)) headers.set(k, v.join(', '))
          }
          const request = new Request(`http://localhost:${server.config.server.port ?? 5176}/api/ia`, {
            method: req.method ?? 'GET',
            body: body ?? undefined,
            headers,
          })
          const response = await handle(request)
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          if (response.body) {
            const reader = response.body.getReader()
            for (;;) {
              const { done, value } = await reader.read()
              if (done) break
              res.write(Buffer.from(value))
            }
          }
          res.end()
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: `Middleware falhou: ${String(err)}` } }))
        }
      })
    },
  }
}
