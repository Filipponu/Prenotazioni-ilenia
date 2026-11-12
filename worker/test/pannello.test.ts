import { datiDemo, fetchDemo, impostaRitardoDemo, usaDatiDemo } from '@ilenia/shared/demo/backend'
import { creaDatiDemo } from '@ilenia/shared/demo/dati'
import type { Database } from '@ilenia/shared/tipi-db'
import type { MessaggioUscita } from '@ilenia/shared/whatsapp/messaggi'
import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Ambiente } from '../src/ambiente'
import { creaApp } from '../src/index'

const env = { WHATSAPP_APP_SECRET: 'x', WHATSAPP_VERIFY_TOKEN: 'y', SUPABASE_URL: 'https://demo.invalid', SUPABASE_SECRET_KEY: 'k' } as Ambiente
const contesto = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as unknown as ExecutionContext

let inviati: MessaggioUscita[] = []

// fetch del finto Supabase, con un token "scaduto" che Auth rifiuta
const fetchConAuth: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const auth = new Headers(init?.headers).get('authorization') ?? ''
  if (url.includes('/auth/v1/user') && auth.endsWith('token-scaduto')) {
    return new Response(JSON.stringify({ code: 401, msg: 'invalid JWT' }), { status: 401 })
  }
  return fetchDemo(input, init)
}

const app = creaApp({
  creaDb: () =>
    createClient<Database>('https://demo.invalid', 'k', {
      global: { fetch: fetchConAuth },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  creaCanale: () => ({
    async invia(_a, m) {
      inviati.push(m)
      return { id: `wamid.${inviati.length}` }
    },
    async segnaLetto() {},
  }),
})

const chiama = (percorso: string, token: string | null, corpo?: unknown) =>
  app.request(
    `/api/pannello${percorso}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    },
    env,
    contesto,
  )

/** Una richiesta in attesa nel futuro di Martina (ha scritto più di 24 ore fa), dai dati di esempio. */
function richiestaInAttesa() {
  const a = datiDemo().appuntamenti!.find(
    (x) => x.cliente_id === 'c-martina' && x.stato === 'in_attesa' && Date.parse(String(x.inizio)) > Date.now(),
  )
  if (!a) throw new Error('nessuna richiesta in attesa nei dati di esempio')
  return a
}

beforeEach(() => {
  impostaRitardoDemo(0)
  usaDatiDemo(creaDatiDemo())
  inviati = []
})

describe('accesso alle API del pannello', () => {
  it('senza token: 401', async () => {
    const r = await chiama(`/richieste/${richiestaInAttesa().id}/approva`, null)
    expect(r.status).toBe(401)
  })

  it('token non valido: 401', async () => {
    const r = await chiama(`/richieste/${richiestaInAttesa().id}/approva`, 'token-scaduto')
    expect(r.status).toBe(401)
  })

  it('operatrice disattivata: 403', async () => {
    datiDemo().operatrici![0]!.attiva = false
    const r = await chiama(`/richieste/${richiestaInAttesa().id}/approva`, 'token-buono')
    expect(r.status).toBe(403)
  })

  it('preflight CORS per il pannello in sviluppo', async () => {
    const r = await app.request(
      '/api/pannello/richieste/x/approva',
      { method: 'OPTIONS', headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'POST' } },
      env,
      contesto,
    )
    expect(r.status).toBe(204)
    expect(r.headers.get('access-control-allow-origin')).toBe('*')
  })
})

describe('azioni', () => {
  it('approva con finestra aperta (Elena ha scritto 2 ore fa): messaggio gratuito', async () => {
    const a = datiDemo().appuntamenti!.find((x) => x.cliente_id === 'c-elena' && x.stato === 'in_attesa')!
    const r = await chiama(`/richieste/${a.id}/approva`, 'token-buono')
    expect(await r.json()).toEqual({ inviato: 'libero' })
    expect(inviati[0]).toMatchObject({ tipo: 'testo' })
  })

  it('approva: conferma e invia (template se la cliente non ha scritto nelle ultime 24 ore)', async () => {
    const a = richiestaInAttesa()
    const r = await chiama(`/richieste/${a.id}/approva`, 'token-buono')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ inviato: 'template' })
    expect(a.stato).toBe('confermato')
    expect(a.conferma_via_template).toBe(true)
    expect(inviati[0]).toMatchObject({ tipo: 'template', nome: 'conferma_appuntamento' })

    // una seconda volta: già gestita
    const di_nuovo = await chiama(`/richieste/${a.id}/approva`, 'token-buono')
    expect(di_nuovo.status).toBe(409)
    expect(await di_nuovo.json()).toMatchObject({ codice: 'gia_gestita' })
  })

  it('rifiuta con motivo: nessun template, link wa.me', async () => {
    const a = richiestaInAttesa()
    const r = await chiama(`/richieste/${a.id}/rifiuta`, 'token-buono', { motivo: 'Quel giorno sono chiusa.' })
    const esito = (await r.json()) as { inviato: string; link?: string }
    expect(esito.inviato).toBe('no')
    expect(esito.link).toMatch(/^https:\/\/wa\.me\//)
    expect(a).toMatchObject({ stato: 'rifiutato', motivo_rifiuto: 'Quel giorno sono chiusa.' })
    expect(inviati).toEqual([])
  })

  it('richiesta inesistente: 404', async () => {
    const r = await chiama('/richieste/non-esiste/approva', 'token-buono')
    expect(r.status).toBe(404)
  })

  it('messaggio a mano fuori finestra: 409 con link wa.me', async () => {
    const r = await chiama('/clienti/c-maria/messaggio', 'token-buono', { testo: 'Ciao Maria!' })
    expect(r.status).toBe(409)
    expect(await r.json()).toMatchObject({ codice: 'finestra_chiusa', link: 'https://wa.me/393000000101?text=Ciao%20Maria!' })
  })
})
