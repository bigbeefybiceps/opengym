import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vapidJwt, sendPush, isPushEndpoint, b64url } from '../src/vapid.js'
import { handle, RestTimer } from '../src/index.js'

const ORIGIN = 'https://bigbeefybiceps.github.io'
const APPLE = 'https://web.push.apple.com/QGuAbc123'
const keys = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  return { pair, publicKey: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)), privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey) }
}
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0))

test('the VAPID token verifies against the public key and names the push service', async () => {
  const k = await keys()
  const jwt = await vapidJwt(APPLE, { privateJwk: k.privateJwk, subject: ORIGIN + '/opengym/', now: 1_000_000_000_000 })
  const [h, c, s] = jwt.split('.')
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k.pair.publicKey, unb64(s), new TextEncoder().encode(h + '.' + c))
  assert.equal(ok, true)
  const claims = JSON.parse(new TextDecoder().decode(unb64(c)))
  assert.deepEqual(claims, { aud: 'https://web.push.apple.com', exp: 1_000_000_000 + 12 * 3600, sub: ORIGIN + '/opengym/' })
  assert.equal(unb64(k.publicKey).length, 65)
})

test('a push is an empty, urgent, short-lived POST with the vapid header', async () => {
  const k = await keys()
  let seen
  const status = await sendPush(APPLE, { ...k, subject: 'x', fetchImpl: async (url, init) => { seen = { url, init }; return { status: 201 } } })
  assert.equal(status, 201)
  assert.equal(seen.url, APPLE)
  assert.match(seen.init.headers.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/)
  assert.equal(seen.init.headers.TTL, '120')
  assert.equal(seen.init.body, undefined)
})

test('only real push services are accepted as addresses', () => {
  assert.equal(isPushEndpoint(APPLE), true)
  assert.equal(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'), true)
  assert.equal(isPushEndpoint('https://evil.example/web.push.apple.com'), false)
  assert.equal(isPushEndpoint('http://web.push.apple.com/x'), false)
  assert.equal(isPushEndpoint('not a url'), false)
})

// A fake Durable Object namespace around the real RestTimer class.
function env() {
  const objects = new Map()
  const storage = () => { const m = new Map(); let alarm = null; return { m, get alarm() { return alarm }, async put(k, v) { m.set(k, v) }, async get(k) { return m.get(k) }, async delete(k) { m.delete(k) }, async setAlarm(t) { alarm = t }, async deleteAlarm() { alarm = null } } }
  return {
    ALLOWED_ORIGIN: ORIGIN, objects,
    TIMERS: {
      idFromName: n => n,
      get: id => { if (!objects.has(id)) { const st = storage(); objects.set(id, { st, obj: new RestTimer({ storage: st }, {}) }) } const o = objects.get(id); return { fetch: (u, init) => o.obj.fetch(new Request(u, init)) } },
    },
  }
}
const post = (path, body, origin = ORIGIN) => new Request('https://relay.example' + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

test('schedule sets one alarm per device; a new one replaces it; cancel clears it', async () => {
  const e = env(); const now = 1_700_000_000_000
  assert.equal((await handle(post('/rest/schedule', { endpoint: APPLE, at: now + 90_000 }), e, now)).status, 204)
  const st = e.objects.get(APPLE).st
  assert.equal(st.alarm, now + 90_000)
  await handle(post('/rest/schedule', { endpoint: APPLE, at: now + 105_000 }), e, now)
  assert.equal(st.alarm, now + 105_000)
  await handle(post('/rest/cancel', { endpoint: APPLE }), e, now)
  assert.equal(st.alarm, null)
  assert.equal(await st.get('endpoint'), undefined)
})

test('refuses other sites, other addresses and silly times', async () => {
  const e = env(); const now = 1_700_000_000_000
  assert.equal((await handle(post('/rest/schedule', { endpoint: APPLE, at: now + 1000 }, 'https://other.example'), e, now)).status, 403)
  assert.equal((await handle(post('/rest/schedule', { endpoint: 'https://example.com/x', at: now + 1000 }), e, now)).status, 400)
  assert.equal((await handle(post('/rest/schedule', { endpoint: APPLE, at: now + 2 * 3600_000 }), e, now)).status, 400)
  assert.equal((await handle(post('/rest/schedule', { endpoint: APPLE, at: now - 60_000 }), e, now)).status, 400)
  assert.equal((await handle(post('/nope', { endpoint: APPLE }), e, now)).status, 404)
  const pre = await handle(new Request('https://relay.example/rest/schedule', { method: 'OPTIONS' }), e, now)
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), ORIGIN)
  assert.equal(e.objects.size, 0)
})
