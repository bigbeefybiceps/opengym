// Creates this relay's VAPID key pair and stores both halves as Worker secrets, then prints the
// public key for the app's build (VITE_REST_PUSH_KEY). The private key is never printed or
// written to disk. Run once, after `npx wrangler@4 login`. Running it again makes a new pair,
// which signs out every phone that turned the alerts on (they turn them on again in Settings).
import { spawnSync } from 'node:child_process'
import { b64url } from '../src/vapid.js'

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const publicKey = b64url(await crypto.subtle.exportKey('raw', pair.publicKey))
const privateJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey))

const put = (name, value) => {
  const r = spawnSync('npx', ['wrangler@4', 'secret', 'put', name], { input: value, stdio: ['pipe', 'inherit', 'inherit'] })
  if (r.status !== 0) { console.error(`Storing ${name} failed.`); process.exit(1) }
}
put('VAPID_PRIVATE_JWK', privateJwk)
put('VAPID_PUBLIC_KEY', publicKey)
console.log('\nPublic key (goes into the app build as VITE_REST_PUSH_KEY):\n' + publicKey)
