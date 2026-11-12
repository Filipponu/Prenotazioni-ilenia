/**
 * Notifiche push standard (Web Push), senza librerie esterne: solo Web
 * Crypto, quindi funziona nel Worker Cloudflare.
 *
 * - RFC 8291: cifratura del contenuto (aes128gcm) per l'abbonamento del
 *   browser (chiavi p256dh e auth che il telefono di Ilenia ci ha dato);
 * - RFC 8292: firma VAPID (ES256) che identifica il salone presso il
 *   servizio push (Google, Apple, Mozilla…).
 */

export interface SottoscrizionePush {
  endpoint: string
  /** chiave pubblica del browser, base64url (65 byte, punto non compresso) */
  p256dh: string
  /** segreto di autenticazione del browser, base64url (16 byte) */
  auth: string
}

export interface ChiaviVapid {
  /** base64url, 65 byte (punto P-256 non compresso) */
  pubblica: string
  /** base64url, 32 byte (scalare d) */
  privata: string
  /** "mailto:…" o "https://…": chi contattare in caso di problemi */
  soggetto: string
}

const testo = new TextEncoder()

export function inB64url(byte: Uint8Array): string {
  let s = ''
  for (const b of byte) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function daB64url(s: string): Uint8Array<ArrayBuffer> {
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(base64)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function unisci(...parti: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(parti.reduce((n, p) => n + p.length, 0)))
  let i = 0
  for (const p of parti) {
    out.set(p, i)
    i += p.length
  }
  return out
}

async function hmac(chiave: Uint8Array<ArrayBuffer>, dati: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey('raw', chiave, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, dati))
}

/** JWK di una chiave privata P-256 a partire da d e dal punto pubblico. */
function jwkPrivata(d: string, pubblica: string): JsonWebKey {
  const p = daB64url(pubblica)
  return { kty: 'EC', crv: 'P-256', d, x: inB64url(p.slice(1, 33)), y: inB64url(p.slice(33, 65)), ext: true }
}

/**
 * Cifra il contenuto per un abbonamento (RFC 8291 + RFC 8188, un solo record).
 * `fisso` serve solo ai test (sale e chiave del server dell'esempio dell'RFC).
 */
export async function cifra(
  contenuto: Uint8Array,
  sott: Pick<SottoscrizionePush, 'p256dh' | 'auth'>,
  fisso?: { sale: string; privataServer: string; pubblicaServer: string },
): Promise<Uint8Array<ArrayBuffer>> {
  const pubblicaBrowser = daB64url(sott.p256dh)
  const segreto = daB64url(sott.auth)
  const sale = fisso ? daB64url(fisso.sale) : crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)))

  // chiave effimera del server (ECDH)
  let privataServer: CryptoKey
  let pubblicaServer: Uint8Array<ArrayBuffer>
  if (fisso) {
    privataServer = await crypto.subtle.importKey(
      'jwk',
      jwkPrivata(fisso.privataServer, fisso.pubblicaServer),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    )
    pubblicaServer = daB64url(fisso.pubblicaServer)
  } else {
    const coppia = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
    privataServer = coppia.privateKey
    pubblicaServer = new Uint8Array((await crypto.subtle.exportKey('raw', coppia.publicKey)) as ArrayBuffer)
  }
  const chiaveBrowser = await crypto.subtle.importKey('raw', pubblicaBrowser, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  // (cast: i tipi di Cloudflare chiamano «$public» il campo standard «public»)
  const algoritmo = { name: 'ECDH', public: chiaveBrowser } as unknown as Parameters<typeof crypto.subtle.deriveBits>[0]
  const condiviso = new Uint8Array(await crypto.subtle.deriveBits(algoritmo, privataServer, 256))

  // IKM = HKDF(auth, ecdh, "WebPush: info" || 0 || ua_public || as_public)
  const prkChiave = await hmac(segreto, condiviso)
  const infoChiave = unisci(testo.encode('WebPush: info\0'), pubblicaBrowser, pubblicaServer, new Uint8Array([1]))
  const ikm = await hmac(prkChiave, infoChiave)
  const prk = await hmac(sale, ikm)
  const cek = (await hmac(prk, unisci(testo.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16)
  const nonce = (await hmac(prk, unisci(testo.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12)

  const chiaveAes = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  // ultimo (e unico) record: delimitatore 0x02, nessun riempimento
  const cifrato = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, chiaveAes, unisci(contenuto, new Uint8Array([2]))),
  )
  const intestazione = unisci(sale, new Uint8Array([0, 0, 0x10, 0]), new Uint8Array([pubblicaServer.length]), pubblicaServer)
  return unisci(intestazione, cifrato)
}

/** Intestazione Authorization VAPID per l'indirizzo del servizio push. */
export async function intestazioneVapid(endpoint: string, chiavi: ChiaviVapid, oraSecondi = Math.floor(Date.now() / 1000)) {
  const aud = new URL(endpoint).origin
  const json = (o: unknown) => inB64url(testo.encode(JSON.stringify(o)))
  const daFirmare = `${json({ typ: 'JWT', alg: 'ES256' })}.${json({ aud, exp: oraSecondi + 12 * 3600, sub: chiavi.soggetto })}`
  const chiave = await crypto.subtle.importKey(
    'jwk',
    jwkPrivata(chiavi.privata, chiavi.pubblica),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  // Web Crypto restituisce già r||s (64 byte), il formato richiesto da JWS
  const firma = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, chiave, testo.encode(daFirmare)))
  return `vapid t=${daFirmare}.${inB64url(firma)}, k=${chiavi.pubblica}`
}

export interface EsitoPush {
  ok: boolean
  /** l'abbonamento non esiste più (app disinstallata, permesso tolto): va cancellato */
  scaduta: boolean
  stato: number
}

/** Invia una notifica (oggetto JSON) a un abbonamento. */
export async function inviaPush(
  sott: SottoscrizionePush,
  contenuto: unknown,
  chiavi: ChiaviVapid,
  opz: { ttlSecondi?: number; urgenza?: 'normal' | 'high'; fetch?: typeof fetch } = {},
): Promise<EsitoPush> {
  const corpo = await cifra(testo.encode(JSON.stringify(contenuto)), sott)
  const r = await (opz.fetch ?? fetch)(sott.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await intestazioneVapid(sott.endpoint, chiavi),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opz.ttlSecondi ?? 24 * 3600),
      Urgency: opz.urgenza ?? 'high',
    },
    body: corpo,
  })
  return { ok: r.ok, scaduta: r.status === 404 || r.status === 410, stato: r.status }
}

/** Nuove chiavi VAPID (da generare una volta sola, vedi strumenti/genera-chiavi-vapid.mjs). */
export async function generaChiaviVapid(): Promise<{ pubblica: string; privata: string }> {
  const coppia = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const jwk = (await crypto.subtle.exportKey('jwk', coppia.privateKey)) as JsonWebKey
  const pubblica = new Uint8Array((await crypto.subtle.exportKey('raw', coppia.publicKey)) as ArrayBuffer)
  return { pubblica: inB64url(pubblica), privata: jwk.d ?? '' }
}
