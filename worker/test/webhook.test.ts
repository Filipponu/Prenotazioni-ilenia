import { createHmac } from 'node:crypto'
import { creaDatiDemo } from '@ilenia/shared/demo/dati'
import { datiDemo, fetchDemo, impostaRitardoDemo, usaDatiDemo } from '@ilenia/shared/demo/backend'
import type { MessaggioUscita } from '@ilenia/shared/whatsapp/messaggi'
import type { Database } from '@ilenia/shared/tipi-db'
import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Ambiente } from '../src/ambiente'
import { creaApp } from '../src/index'

const SEGRETO = 'app-secret-di-prova'
const env = {
  WHATSAPP_APP_SECRET: SEGRETO,
  WHATSAPP_VERIFY_TOKEN: 'parola-di-verifica',
  SUPABASE_URL: 'https://demo.invalid',
  SUPABASE_SECRET_KEY: 'x',
} as Ambiente

let inviati: Array<{ a: string; m: MessaggioUscita }> = []
let letti: string[] = []
let lavori: Promise<unknown>[] = []

const app = creaApp({
  creaDb: () =>
    createClient<Database>('https://demo.invalid', 'chiave', {
      global: { fetch: fetchDemo },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  creaCanale: () => ({
    async invia(a, m) {
      inviati.push({ a, m })
      return { id: `wamid.out.${inviati.length}` }
    },
    async segnaLetto(id) {
      letti.push(id)
    },
  }),
})

const contesto = {
  waitUntil: (p: Promise<unknown>) => void lavori.push(p),
  passThroughOnException: () => undefined,
  props: {},
} as unknown as ExecutionContext

function webhook(messaggi: unknown[], statuses: unknown[] = []) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              contacts: [{ wa_id: '393331234567', profile: { name: 'Maria' } }],
              messages: messaggi,
              statuses,
            },
          },
        ],
      },
    ],
  })
}

const firma = (corpo: string, segreto = SEGRETO) => `sha256=${createHmac('sha256', segreto).update(corpo).digest('hex')}`

async function invia(corpo: string, intestazioneFirma: string | null) {
  const r = await app.request(
    '/api/whatsapp/webhook',
    {
      method: 'POST',
      body: corpo,
      headers: { 'content-type': 'application/json', ...(intestazioneFirma ? { 'x-hub-signature-256': intestazioneFirma } : {}) },
    },
    env,
    contesto,
  )
  await Promise.all(lavori)
  return r
}

beforeEach(() => {
  impostaRitardoDemo(0)
  usaDatiDemo(creaDatiDemo())
  inviati = []
  letti = []
  lavori = []
})

describe('verifica del webhook (GET)', () => {
  it('risponde con la sfida se il token è giusto', async () => {
    const r = await app.request(
      '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=parola-di-verifica&hub.challenge=12345',
      {},
      env,
      contesto,
    )
    expect(r.status).toBe(200)
    expect(await r.text()).toBe('12345')
  })

  it('rifiuta un token sbagliato', async () => {
    const r = await app.request('/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=no&hub.challenge=1', {}, env, contesto)
    expect(r.status).toBe(403)
  })
})

describe('messaggi in arrivo (POST)', () => {
  const ciao = webhook([{ from: '393331234567', id: 'wamid.A', timestamp: '1763200000', type: 'text', text: { body: 'ciao Ilenia' } }])

  it('firma mancante o sbagliata: 401 e nessuna risposta', async () => {
    expect((await invia(ciao, null)).status).toBe(401)
    expect((await invia(ciao, firma(ciao, 'altro-segreto'))).status).toBe(401)
    expect(inviati).toEqual([])
  })

  it('firma giusta: 200, messaggio letto e menu inviato', async () => {
    const r = await invia(ciao, firma(ciao))
    expect(r.status).toBe(200)
    expect(letti).toEqual(['wamid.A'])
    expect(inviati).toHaveLength(1)
    expect(inviati[0]!.a).toBe('393331234567')
    expect(inviati[0]!.m).toMatchObject({ tipo: 'pulsanti', testo: "Ciao! Sono l'assistente di Ilenia, cosa vuoi fare?" })
    // cliente nuova registrata col suo numero, messaggio nel registro
    expect(datiDemo().clienti!.some((c) => c.telefono === '393331234567')).toBe(true)
    expect(datiDemo().log_messaggi!.map((l) => l.direzione)).toEqual(['in', 'out'])
  })

  it('lo stesso messaggio rimandato da Meta non riceve una seconda risposta', async () => {
    await invia(ciao, firma(ciao))
    await invia(ciao, firma(ciao))
    expect(inviati).toHaveLength(1)
  })

  it('tocco su «Prenota»: lista dei servizi', async () => {
    const corpo = webhook([
      {
        from: '393331234567',
        id: 'wamid.B',
        timestamp: '1763200000',
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: 'menu:prenota', title: 'Prenota' } },
      },
    ])
    await invia(corpo, firma(corpo))
    expect(inviati[0]!.m).toMatchObject({ tipo: 'lista', testo: 'Quale servizio vuoi prenotare?' })
  })

  it('solo stati di consegna: 200 e nessun messaggio', async () => {
    const corpo = webhook([], [{ id: 'wamid.X', status: 'delivered', timestamp: '1', recipient_id: '39' }])
    expect((await invia(corpo, firma(corpo))).status).toBe(200)
    expect(inviati).toEqual([])
  })

  it('JSON non valido ma firmato: 400', async () => {
    expect((await invia('{non json', firma('{non json'))).status).toBe(400)
  })
})

describe('altri indirizzi', () => {
  it('salute', async () => {
    const r = await app.request('/api/salute', {}, env, contesto)
    expect(await r.json()).toEqual({ ok: true })
  })
  it('api sconosciuta: 404', async () => {
    expect((await app.request('/api/boh', {}, env, contesto)).status).toBe(404)
  })
})
