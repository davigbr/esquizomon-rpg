/**
 * Scheduled Function Netlify — dispara os lembretes diários (push).
 *
 * Roda a cada minuto (config: `[functions."reminders"] schedule = "* * * * *"`).
 * Para cada assinatura em Blobs, converte o horário UTC do servidor para o
 * horário local do device usando o offset guardado e, se bater com um dos
 * horários escolhidos, envia um push genérico (nunca dados do usuário).
 * Requer VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT nas env vars.
 */
import webpush from 'web-push'
import { getStore } from '@netlify/blobs'

const STORE = 'esquizomon-rpg'
const KEY = 'push:subs'

interface PushSub {
  endpoint: string
  keys: { p256dh: string; auth: string }
  horarios: number[]
  offsetMin: number
  lastSent: { day: string; min: number } | null
}

interface Mensagem {
  title: string
  body: string
}

const MENSAGENS: Mensagem[] = [
  { title: 'Seus monstros estão inquietos…', body: 'Abra o Esquizomon e veja o que espera por você hoje.' },
  { title: 'Uma carta nova chama por você', body: 'Suas tarefas querem virar conquistas. Dá uma olhada?' },
  { title: 'Seu território precisa de você', body: 'Uma olhada rápida no Esquizomon e seus monstros agradecem.' },
  { title: 'O baralho se mexeu', body: 'Chegou a hora de registrar o dia. O Esquizomon aguarda.' },
]

async function readSubs(s: ReturnType<typeof getStore>): Promise<PushSub[]> {
  const bruto = await s.get(KEY, { type: 'text' })
  if (!bruto) return []
  try {
    const arr = JSON.parse(bruto) as unknown
    return Array.isArray(arr) ? (arr as PushSub[]) : []
  } catch {
    return []
  }
}

export default async (): Promise<Response> => {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? ''
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? ''
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:esquizomon@esquizomon.app'
  if (!publicKey || !privateKey) {
    return new Response('VAPID keys não configuradas.', { status: 500 })
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)

  const s = getStore({ name: STORE })
  const subs = await readSubs(s)
  if (subs.length === 0) return new Response('ok (sem assinaturas)', { status: 200 })

  const now = new Date()
  // Minuto do dia em UTC (as Scheduled Functions rodam em UTC).
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes()
  const day = now.toISOString().slice(0, 10)

  let messageIndex = 0
  const removidos: string[] = []

  // Só enviamos aos subs cujo horário local bate AGORA.
  const paraEnviar = subs.filter((sub) => {
    const localMin = ((((utcMin + (sub.offsetMin ?? 0)) % 1440) + 1440) % 1440)
    if (!sub.horarios.includes(localMin)) return false
    // Dedupe: não reenvia no mesmo minuto (cron pode disparar 2x no minuto).
    if (sub.lastSent && sub.lastSent.day === day && sub.lastSent.min === localMin) return false
    return true
  })

  // Envia em paralelo e aguarda de verdade (fire-and-forget aqui perderia o
  // resultado e deixaria o log e a rotação de mensagens errados).
  const resultados = await Promise.all(
    paraEnviar.map(async (sub, i) => {
      const msg = MENSAGENS[(messageIndex++ + i) % MENSAGENS.length]
      const target = { endpoint: sub.endpoint, keys: sub.keys } as unknown as Parameters<typeof webpush.sendNotification>[0]
      try {
        await webpush.sendNotification(target, JSON.stringify({ ...msg, url: '/' }))
        const localMin = ((((utcMin + (sub.offsetMin ?? 0)) % 1440) + 1440) % 1440)
        sub.lastSent = { day, min: localMin }
        return { ok: true }
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode
        // 404/410 = assinatura expirada/revogada pelo navegador → remover.
        if (code === 404 || code === 410) {
          removidos.push(sub.endpoint)
          return { ok: false, removido: true }
        }
        return { ok: false, removido: false }
      }
    }),
  )

  const sent = resultados.filter((r) => r.ok).length
  const removidosSet = new Set(removidos)
  const final = removidosSet.size ? subs.filter((x) => !removidosSet.has(x.endpoint)) : subs
  await s.set(KEY, JSON.stringify(final))

  return new Response(`ok — enviados: ${sent}, removidos: ${removidosSet.size}`, { status: 200 })
}