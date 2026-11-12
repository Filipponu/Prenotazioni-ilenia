import { createPublicKey, verify, createDecipheriv, createECDH, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { cifra, daB64url, generaChiaviVapid, inB64url, intestazioneVapid, inviaPush } from './webpush'

// RFC 8291, sezione 5 / appendice A: esempio ufficiale
const RFC = {
  testo: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  privataServer: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  pubblicaServer: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  privataBrowser: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  pubblicaBrowser: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  sale: 'DGv6ra1nlYgDCS1FRnbzlw',
  corpo:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

/** Decifra come farebbe il browser (implementazione indipendente con node:crypto). */
function decifraComeBrowser(corpo: Uint8Array, privataBrowser: string, pubblicaBrowser: string, auth: string): string {
  const b = Buffer.from(corpo)
  const sale = b.subarray(0, 16)
  const lunghezzaId = b[20]!
  const pubblicaServer = b.subarray(21, 21 + lunghezzaId)
  const cifrato = b.subarray(21 + lunghezzaId)
  const ecdh = createECDH('prime256v1')
  ecdh.setPrivateKey(Buffer.from(daB64url(privataBrowser)))
  const condiviso = ecdh.computeSecret(pubblicaServer)
  const h = (k: Buffer, d: Buffer) => createHmac('sha256', k).update(d).digest()
  const prkChiave = h(Buffer.from(daB64url(auth)), condiviso)
  const ikm = h(prkChiave, Buffer.concat([Buffer.from('WebPush: info\0'), Buffer.from(daB64url(pubblicaBrowser)), pubblicaServer, Buffer.from([1])]))
  const prk = h(sale, ikm)
  const cek = h(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16)
  const nonce = h(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12)
  const d = createDecipheriv('aes-128-gcm', cek, nonce)
  d.setAuthTag(cifrato.subarray(cifrato.length - 16))
  const chiaro = Buffer.concat([d.update(cifrato.subarray(0, cifrato.length - 16)), d.final()])
  return chiaro.subarray(0, chiaro.lastIndexOf(2)).toString('utf8')
}

describe('cifratura (RFC 8291)', () => {
  it('riproduce esattamente l\'esempio ufficiale dell\'RFC', async () => {
    const corpo = await cifra(daB64url(RFC.testo), { p256dh: RFC.pubblicaBrowser, auth: RFC.auth }, {
      sale: RFC.sale,
      privataServer: RFC.privataServer,
      pubblicaServer: RFC.pubblicaServer,
    })
    expect(inB64url(corpo)).toBe(RFC.corpo)
  })

  it('con chiavi casuali, il browser riesce a decifrare', async () => {
    const corpo = await cifra(new TextEncoder().encode('{"titolo":"Nuova richiesta"}'), { p256dh: RFC.pubblicaBrowser, auth: RFC.auth })
    expect(decifraComeBrowser(corpo, RFC.privataBrowser, RFC.pubblicaBrowser, RFC.auth)).toBe('{"titolo":"Nuova richiesta"}')
  })
})

describe('VAPID (RFC 8292)', () => {
  it('firma verificabile con la chiave pubblica, destinatario e scadenza corretti', async () => {
    const chiavi = { ...(await generaChiaviVapid()), soggetto: 'mailto:salone@example.com' }
    const intestazione = await intestazioneVapid('https://fcm.googleapis.com/fcm/send/abc', chiavi, 1_800_000_000)
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(intestazione)!
    expect(k).toBe(chiavi.pubblica)
    const [h, p, s] = jwt!.split('.')
    expect(JSON.parse(Buffer.from(p!, 'base64url').toString())).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: 1_800_000_000 + 12 * 3600,
      sub: 'mailto:salone@example.com',
    })
    const pub = daB64url(chiavi.pubblica)
    const chiavePubblica = createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: inB64url(pub.slice(1, 33)), y: inB64url(pub.slice(33)) },
      format: 'jwk',
    })
    expect(verify('sha256', Buffer.from(`${h}.${p}`), { key: chiavePubblica, dsaEncoding: 'ieee-p1363' }, Buffer.from(s!, 'base64url'))).toBe(true)
  })
})

describe('inviaPush', () => {
  it('intestazioni corrette; 410 = abbonamento da cancellare', async () => {
    const chiavi = { ...(await generaChiaviVapid()), soggetto: 'mailto:salone@example.com' }
    const richieste: Array<{ url: string; init: RequestInit }> = []
    const finto = (async (url: string, init: RequestInit) => {
      richieste.push({ url, init })
      return new Response(null, { status: richieste.length === 1 ? 201 : 410 })
    }) as unknown as typeof fetch
    const sott = { endpoint: 'https://push.example.com/abc', p256dh: RFC.pubblicaBrowser, auth: RFC.auth }

    expect(await inviaPush(sott, { titolo: 'Prova' }, chiavi, { fetch: finto })).toEqual({ ok: true, scaduta: false, stato: 201 })
    const intestazioni = richieste[0]!.init.headers as Record<string, string>
    expect(intestazioni['Content-Encoding']).toBe('aes128gcm')
    expect(intestazioni.TTL).toBe('86400')
    expect(intestazioni.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/)
    expect(decifraComeBrowser(richieste[0]!.init.body as Uint8Array, RFC.privataBrowser, RFC.pubblicaBrowser, RFC.auth)).toBe('{"titolo":"Prova"}')

    expect(await inviaPush(sott, { titolo: 'Prova' }, chiavi, { fetch: finto })).toEqual({ ok: false, scaduta: true, stato: 410 })
  })
})
