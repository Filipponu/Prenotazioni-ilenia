import { datiDemo, fetchDemo, impostaRitardoDemo, usaDatiDemo } from '@ilenia/shared/demo/backend'
import { creaDatiDemo } from '@ilenia/shared/demo/dati'
import type { Database } from '@ilenia/shared/tipi-db'
import type { MessaggioUscita } from '@ilenia/shared/whatsapp/messaggi'
import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Ambiente } from '../src/ambiente'
import { creaApp, lavoroProgrammato, type Dipendenze } from '../src/index'

const env = { WHATSAPP_APP_SECRET: 'x', WHATSAPP_VERIFY_TOKEN: 'y', SUPABASE_URL: 'https://demo.invalid', SUPABASE_SECRET_KEY: 'k' } as Ambiente
const contesto = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as unknown as ExecutionContext
let inviati: MessaggioUscita[] = []

const dipendenze: Dipendenze = {
  creaDb: () =>
    createClient<Database>('https://demo.invalid', 'k', { global: { fetch: fetchDemo }, auth: { persistSession: false, autoRefreshToken: false } }),
  creaCanale: () => ({
    async invia(_a, m) {
      inviati.push(m)
      return { id: `wamid.${inviati.length}` }
    },
    async segnaLetto() {},
  }),
}
const app = creaApp(dipendenze)
const post = (percorso: string, corpo: unknown = {}) =>
  app.request(
    `/api/pannello${percorso}`,
    { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: JSON.stringify(corpo) },
    env,
    contesto,
  )

/** Un appuntamento confermato di una cliente iscritta alla lista d'attesa, dai dati di esempio della demo. */
function appuntamentoDaDisdire() {
  const d = datiDemo()
  // Chiara (iscritta) ha un appuntamento la settimana prossima; si disdice quello di Sara, che viene prima
  return d.appuntamenti!.find((a) => a.cliente_id === 'c-sara' && a.stato === 'confermato' && Date.parse(String(a.inizio)) > Date.now() + 3 * 3600_000)!
}

beforeEach(() => {
  impostaRitardoDemo(0)
  usaDatiDemo(creaDatiDemo())
  inviati = []
})

describe('lista d\'attesa dal pannello', () => {
  it('disdetta con proposta → link tracciato → WhatsApp con il messaggio pronto', async () => {
    const a = appuntamentoDaDisdire()
    const r = await post(`/appuntamenti/${a.id}/disdici`, { proponi: true })
    expect(await r.json()).toEqual({ proposto: true })
    const proposta = datiDemo().proposte_anticipo!.at(-1)!
    expect(proposta.stato).toBe('da_inviare')

    const link = await app.request(`/r/${proposta.id}`, {}, env, contesto)
    expect(link.status).toBe(302)
    expect(link.headers.get('location')).toMatch(/^https:\/\/wa\.me\/39300000\d{4}\?text=Ciao/)
    expect(proposta.stato).toBe('inviata')

    // Ilenia segna che la cliente ha accettato
    const risposta = await post(`/proposte/${proposta.id}/risposta`, { accettata: true })
    expect(await risposta.json()).toMatchObject({ esito: 'accettata' })
  })

  it('link di una proposta inesistente: 410', async () => {
    const r = await app.request('/r/00000000-0000-0000-0000-000000000000', {}, env, contesto)
    expect(r.status).toBe(410)
  })

  it('chiudi il posto', async () => {
    const a = appuntamentoDaDisdire()
    await post(`/appuntamenti/${a.id}/disdici`, { proponi: true })
    const slot = datiDemo().slot_liberati!.at(-1)!
    expect((await post(`/slot/${slot.id}/chiudi`)).status).toBe(200)
    expect(slot.stato).toBe('annullato')
  })
})

describe('lavoro programmato ogni minuto', () => {
  it('proposta inviata e scaduta → passa alla successiva', async () => {
    const a = appuntamentoDaDisdire()
    await post(`/appuntamenti/${a.id}/disdici`, { proponi: true })
    const prima = datiDemo().proposte_anticipo!.at(-1)!
    await app.request(`/r/${prima.id}`, {}, env, contesto)
    prima.scade_il = new Date(Date.now() - 60_000).toISOString()
    expect(await lavoroProgrammato(env, dipendenze)).toBe(1)
    expect(prima.stato).toBe('scaduta')
  })
})
