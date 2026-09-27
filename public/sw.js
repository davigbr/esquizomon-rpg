/* Service worker — cache do app shell (produção).
 * Navegação (HTML): NETWORK-FIRST — o app sempre busca a versão nova na rede
 * (cache-first aqui era o bug do PWA preso na versão velha — 2026-08-16).
 * Demais assets: stale-while-revalidate (rapidez + atualização). */
/* Notificações push: mensagem vinda do servidor (lembrete diário). */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title = data.title || 'Esquizomon RPG'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
    vibrate: [90, 50, 90],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

/* Clique na notificação: traz a janela do app pro foco (ou abre). */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const c of windowClients) {
        if ('focus' in c) {
          c.focus()
          if ('navigate' in c) c.navigate(url)
          return
        }
      }
      return clients.openWindow(url)
    }),
  )
})

const CACHE = 'esquizomon-rpg-v3'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/favicon.png', '/apple-touch-icon.png', '/images/logo-esquizomon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  // Navegação: sempre tenta a rede primeiro (HTML atualizado → bundles novos)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone()
          void caches.open(CACHE).then((cache) => cache.put(req, copia))
          return res
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('/'))),
    )
    return
  }

  // Assets: responde do cache e atualiza em segundo plano
  event.respondWith(
    caches.match(req).then((emCache) => {
      const rede = fetch(req)
        .then((res) => {
          if (res.ok && new URL(req.url).origin === self.location.origin) {
            const copia = res.clone()
            void caches.open(CACHE).then((cache) => cache.put(req, copia))
          }
          return res
        })
        .catch(() => emCache)
      return emCache || rede
    }),
  )
})
