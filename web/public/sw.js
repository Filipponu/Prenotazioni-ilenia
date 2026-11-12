/*
 * Service worker del pannello.
 * - Notifiche push: le mostra e, al tocco, apre la pagina giusta.
 * - Cache leggera: i file con l'impronta (/_next/static) restano in cache; le
 *   pagine si scaricano sempre fresche e, senza rete, si usa l'ultima copia.
 *   I dati (Supabase, /api) non passano mai dalla cache.
 */
const CACHE = 'ilenia-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomi) => Promise.all(nomi.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (evento) => {
  const richiesta = evento.request
  const url = new URL(richiesta.url)
  if (richiesta.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/r/')) return

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icone/')) {
    evento.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const inCache = await cache.match(richiesta)
        if (inCache) return inCache
        const risposta = await fetch(richiesta)
        if (risposta.ok) await cache.put(richiesta, risposta.clone())
        return risposta
      }),
    )
    return
  }

  if (richiesta.mode === 'navigate') {
    evento.respondWith(
      fetch(richiesta)
        .then((risposta) => {
          if (risposta.ok) {
            const copia = risposta.clone()
            evento.waitUntil(caches.open(CACHE).then((cache) => cache.put(richiesta, copia)))
          }
          return risposta
        })
        .catch(async () => (await caches.match(richiesta)) || (await caches.match('/agenda/')) || Response.error()),
    )
  }
})

self.addEventListener('push', (evento) => {
  let dati = {}
  try {
    dati = evento.data ? evento.data.json() : {}
  } catch {
    dati = { testo: evento.data ? evento.data.text() : '' }
  }
  evento.waitUntil(
    self.registration.showNotification(dati.titolo || 'Prenotazioni', {
      body: dati.testo || '',
      tag: dati.tag,
      renotify: Boolean(dati.tag),
      icon: '/icone/icona-192.png',
      badge: '/icone/badge-96.png',
      lang: 'it',
      data: { url: dati.url || '/agenda/' },
    }),
  )
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const url = new URL((evento.notification.data && evento.notification.data.url) || '/agenda/', self.location.origin).href
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (finestre) => {
      const aperta = finestre.find((f) => new URL(f.url).origin === self.location.origin)
      if (aperta) {
        const f = await aperta.focus()
        return f.navigate(url).catch(() => f)
      }
      return self.clients.openWindow(url)
    }),
  )
})
