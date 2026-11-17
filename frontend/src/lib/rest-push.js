// Rest-over alerts on a locked phone, for the personal (serverless) build.
//
// iOS suspends a home-screen web app as soon as the phone locks, so the rest countdown in the
// page cannot alert on time. Instead, when a rest starts, the end time goes to a small relay
// (rest-push/ in this repo, a Cloudflare Worker) that sends a Web Push at that moment; iOS shows
// it on the lock screen. Only this phone's push address and the end time leave the device.
//
// Off until switched on in Settings (it needs the notification permission, which iOS only asks
// for from a tap), and absent from builds without VITE_REST_PUSH_URL / VITE_REST_PUSH_KEY.
const URL_ = (import.meta.env.VITE_REST_PUSH_URL || '').replace(/\/+$/, '')
const KEY = import.meta.env.VITE_REST_PUSH_KEY || ''
const FLAG = 'og_rest_push'

export const restPushConfigured = () => !!(URL_ && KEY)
export const restPushSupported = () =>
  restPushConfigured() && typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
  typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window
export const restPushOn = () => { try { return localStorage.getItem(FLAG) === '1' } catch { return false } }

const keyBytes = b64 => {
  const padded = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0))
}
async function subscription(create = false) {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub || !create) return sub
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) })
}

/** Switch the alerts on: permission, then a push subscription tied to the relay's key. */
export async function enableRestPush() {
  if (!restPushSupported()) throw new Error('Not supported here — on iPhone, open openGym from the home screen.')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Notifications are not allowed for openGym.')
  let sub = await subscription(false)
  // A subscription made for another key (an older relay) cannot be reused: replace it.
  const want = keyBytes(KEY)
  const have = sub?.options?.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null
  if (sub && have && (have.length !== want.length || have.some((b, i) => b !== want[i]))) { await sub.unsubscribe(); sub = null }
  if (!sub) await subscription(true)
  localStorage.setItem(FLAG, '1')
}

export async function disableRestPush() {
  localStorage.removeItem(FLAG)
  const sub = restPushSupported() ? await subscription(false).catch(() => null) : null
  if (sub) { await cancelRestPush(); await sub.unsubscribe().catch(() => {}) }
}

// Fire-and-forget: a rest is never held up by the network. `keepalive` lets the request
// finish even when it is sent as the page is being hidden.
async function send(path, body) {
  if (!restPushOn() || !restPushSupported()) return
  try {
    const sub = await subscription(false)
    if (!sub) return
    await fetch(URL_ + path, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint, ...body }) })
  } catch { /* offline: the in-app timer still runs */ }
}
/** Ask for a push at `endsAt` (ms). A later call replaces it. */
export const scheduleRestPush = endsAt => send('/rest/schedule', { at: Math.round(endsAt) })
export const cancelRestPush = () => send('/rest/cancel', {})

/** One push now-ish, to check the whole path works. */
export const testRestPush = () => scheduleRestPush(Date.now() + 5000)
