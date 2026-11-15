/**
 * Moey service worker.
 *
 * Deliberately small: it exists so the app can be installed and opened from the
 * machine it runs on, and so a dead network shows the shell instead of a browser
 * error page. It never caches API responses — an opportunity record that looks
 * live but is a cached copy would be exactly the dishonesty this product avoids.
 *
 * Development is pass-through: Vite serves modules with HMR, and caching those
 * would hand back stale code after an edit.
 */
const VERSION = 'moey-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png']

const isDev = () => self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1'

self.addEventListener('install', (event) => {
  if (isDev()) return self.skipWaiting()
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Private data is never served from a cache.
  if (url.pathname.startsWith('/api/')) return
  if (isDev()) return

  // Navigations: network first, shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(VERSION).then((cache) => cache.put('/', copy)).catch(() => undefined)
          return response
        })
        .catch(async () => (await caches.match(request)) || (await caches.match('/')) || Response.error()),
    )
    return
  }

  // Built assets are content-hashed, so cache-first is safe for them.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => undefined)
            }
            return response
          }),
      ),
    )
  }
})
