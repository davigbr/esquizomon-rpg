/* Service worker — cache do app shell (produção). */
const CACHE = 'esquizomon-rpg-v1'
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
