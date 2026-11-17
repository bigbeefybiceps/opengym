// openGym rest-timer push relay.
//
// The app is a static site, and iOS suspends a home-screen web app the moment the phone locks,
// so the app cannot time its own "rest over" alert. It hands the end time to this Worker
// instead; a Durable Object per device sets an alarm for that moment and sends a Web Push, which
// iOS delivers to the locked phone.
//
//   POST /rest/schedule  { endpoint, at }   at = ms since epoch, within the next hour
//   POST /rest/cancel    { endpoint }
//
// Nothing about the workout is sent or kept: only the push address and one timestamp, deleted
// when the alarm fires or is cancelled.
import { isPushEndpoint, sendPush } from './vapid.js'

const MAX_AHEAD_MS = 60 * 60 * 1000

const cors = env => ({
  'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
})
const reply = (env, status, body = null) => new Response(status === 204 ? null : body, { status, headers: cors(env) })

export async function handle(req, env, now = Date.now()) {
  if (req.method === 'OPTIONS') return reply(env, 204)
  const url = new URL(req.url)
  if (req.method === 'GET' && url.pathname === '/') return reply(env, 200, 'openGym rest push')
  if (req.method !== 'POST') return reply(env, 405)
  if (req.headers.get('Origin') !== env.ALLOWED_ORIGIN) return reply(env, 403)
  const op = url.pathname === '/rest/schedule' ? 'schedule' : url.pathname === '/rest/cancel' ? 'cancel' : null
  if (!op) return reply(env, 404)
  let body
  try { body = await req.json() } catch { return reply(env, 400) }
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : ''
  if (!isPushEndpoint(endpoint)) return reply(env, 400)
  const at = Number(body.at)
  if (op === 'schedule' && !(at > now - 5000 && at < now + MAX_AHEAD_MS)) return reply(env, 400)
  const stub = env.TIMERS.get(env.TIMERS.idFromName(endpoint))
  await stub.fetch('https://timer/' + op, { method: 'POST', body: JSON.stringify({ endpoint, at }) })
  return reply(env, 204)
}

export default { fetch: (req, env) => handle(req, env) }

// One per push address: a new schedule replaces the last, so a rest that is skipped, shortened
// or lengthened leaves exactly one alarm behind, at the right time.
export class RestTimer {
  constructor(state, env) { this.state = state; this.env = env }

  async fetch(req) {
    const { endpoint, at } = await req.json()
    if (new URL(req.url).pathname === '/cancel') {
      await this.state.storage.deleteAlarm()
      await this.state.storage.delete('endpoint')
    } else {
      await this.state.storage.put('endpoint', endpoint)
      await this.state.storage.setAlarm(at)
    }
    return new Response(null, { status: 204 })
  }

  async alarm() {
    const endpoint = await this.state.storage.get('endpoint')
    await this.state.storage.delete('endpoint')
    if (!endpoint) return
    await sendPush(endpoint, {
      publicKey: this.env.VAPID_PUBLIC_KEY,
      privateJwk: JSON.parse(this.env.VAPID_PRIVATE_JWK),
      subject: this.env.VAPID_SUBJECT,
    })
  }
}
