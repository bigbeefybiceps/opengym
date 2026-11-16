/* openGym service worker — runtime caching (works with Vite's hashed asset names).
   Exercise media cache-first, in a cache of its own; everything else network-first with offline
   fallback. */
const CACHE = 'opengym-rt-v1'
// The stills and clips never change under a given URL, so what the phone has shown once it can
// show again without a network — in a gym basement, say. Kept apart from CACHE so it can be
// told from the app's own files.
const MEDIA = 'opengym-media-v1'
const isMediaPath = p => p.includes('/exercise-media/') || p.includes('/img/') || p.includes('/gif/')
// Only a real answer is kept: a 404 page stored under a clip's URL would stand in for it for good.
const realMedia = res => res.ok && !res.redirected && !/text\/html/i.test(res.headers.get('content-type') || '')

// A <video> asks for its clip in byte ranges. The network's 206 cannot be cached (cache.put
// refuses a partial answer), and a whole 200 handed to a range request is a clip iOS Safari will
// not play. So the cache holds the whole file, fetched without a Range, and a range request is
// answered with a 206 cut from it. One range is the only kind a player asks for; anything else
// gets the whole file. (Same approach as upstream openGym's worker.)
async function slice(res, range) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
  const type = res.headers.get('content-type') || 'application/octet-stream'
  const body = await res.arrayBuffer()
  const size = body.byteLength
  let start = m && m[1] !== '' ? Number(m[1]) : NaN
  let end = m && m[2] !== '' ? Number(m[2]) : size - 1
  if (m && m[1] === '' && m[2] !== '') { start = Math.max(0, size - Number(m[2])); end = size - 1 }
  if (!m || !Number.isFinite(start)) return new Response(body, { status: 200, headers: { 'content-type': type, 'content-length': String(size), 'accept-ranges': 'bytes' } })
  if (start >= size || end < start) return new Response(null, { status: 416, headers: { 'content-range': 'bytes */' + size } })
  end = Math.min(end, size - 1)
  return new Response(body.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: { 'content-type': type, 'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes' }
  })
}
function media(e) {
  const range = e.request.headers.get('range') || ''
  return caches.open(MEDIA).then(c => c.match(e.request.url).then(hit => {
    if (hit) return range ? slice(hit, range) : hit
    // The whole file even for a range request: the one answer that can be kept.
    return fetch(range ? e.request.url : e.request).then(res => {
      if (res.status !== 200 || !realMedia(res)) return res
      e.waitUntil(c.put(e.request.url, res.clone()).catch(() => {}))
      return range ? slice(res, range) : res
    })
  }))
}

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE && k !== MEDIA).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()))
})
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {}
  e.waitUntil(self.registration.showNotification(data.title || 'openGym', {
    body: data.body || '',
    icon: 'icon-512.png',
    badge: 'icon-180.png',
    tag: data.tag || 'opengym',
    renotify: true
  }))
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(clients => {
    const c = clients.find(c => 'focus' in c)
    return c ? c.focus() : self.clients.openWindow('./')
  }))
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/')) return    // never cache auth/data

  if (isMediaPath(url.pathname)) {
    e.respondWith(media(e))
  } else {
    e.respondWith(fetch(e.request).then(res => {
      if (res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}) }
      return res
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('index.html'))))
  }
})
