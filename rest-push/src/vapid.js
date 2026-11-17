// Web Push without a payload: the request carries only a VAPID signature, so nothing has to be
// encrypted (RFC 8291 applies to message bodies only). The service worker shows a fixed "rest
// over" notification for an empty push. RFC 8292 for the header format.

const enc = new TextEncoder()
export const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** The ES256 JWT a push service wants: aud = the endpoint's origin, at most 24 h of life. */
export async function vapidJwt(endpoint, { privateJwk, subject, now = Date.now() }) {
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })))
  // WebCrypto's ECDSA signature is already the raw r||s pair JWS uses.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(header + '.' + claims))
  return header + '.' + claims + '.' + b64url(sig)
}

// Only real browser push services: the Worker never fetches an address it was merely handed.
const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/]
export function isPushEndpoint(endpoint) {
  try {
    const u = new URL(endpoint)
    return u.protocol === 'https:' && PUSH_HOSTS.some(re => re.test(u.hostname))
  } catch { return false }
}

/** Send one empty push. Resolves to the push service's HTTP status. */
export async function sendPush(endpoint, { publicKey, privateJwk, subject, fetchImpl = fetch }) {
  const jwt = await vapidJwt(endpoint, { privateJwk, subject })
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${publicKey}`,
      TTL: '120',           // a rest alert two minutes late is worthless: drop it instead
      Urgency: 'high',
      Topic: 'rest',        // a newer rest alert replaces one still waiting for delivery
      'Content-Length': '0',
    },
  })
  return res.status
}
