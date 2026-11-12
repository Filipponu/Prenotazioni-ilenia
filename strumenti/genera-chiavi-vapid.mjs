#!/usr/bin/env node
// Genera le chiavi VAPID per le notifiche push (una volta sola).
// La pubblica va sia nel pannello (NEXT_PUBLIC_VAPID_PUBLIC_KEY) sia nel Worker
// (VAPID_PUBLIC_KEY); la privata SOLO nel Worker (wrangler secret put VAPID_PRIVATE_KEY).
// Se le cambi, Ilenia dovrà riattivare le notifiche sui suoi dispositivi.
const b64 = (b) => Buffer.from(b).toString('base64url')
const coppia = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const pubblica = b64(await crypto.subtle.exportKey('raw', coppia.publicKey))
const { d } = await crypto.subtle.exportKey('jwk', coppia.privateKey)
console.log(`VAPID_PUBLIC_KEY=${pubblica}`)
console.log(`VAPID_PRIVATE_KEY=${d}`)
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${pubblica}`)
