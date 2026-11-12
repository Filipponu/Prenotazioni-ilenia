import { datiDemo, fetchDemo, impostaRitardoDemo, usaDatiDemo } from '@ilenia/shared/demo/backend'
import { creaDatiDemo, ID_OPERATRICE } from '@ilenia/shared/demo/dati'
import { generaChiaviVapid } from '@ilenia/shared/notifiche/webpush'
import { adesso } from '@ilenia/shared/tempo'
import type { Database } from '@ilenia/shared/tipi-db'
import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ambiente } from '../src/ambiente'
import { creaApp, lavoroProgrammato, type Dipendenze } from '../src/index'
import { creaNotificatore } from '../src/notifiche'

// chiavi di un "browser" (esempio dell'RFC 8291)
const BROWSER = {
  p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
}
const contesto = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as unknown as ExecutionContext
const base = { WHATSAPP_APP_SECRET: 'x', WHATSAPP_VERIFY_TOKEN: 'y', SUPABASE_URL: 'https://demo.invalid', SUPABASE_SECRET_KEY: 'k' }
let env: Ambiente

const dipendenze: Dipendenze = {
  creaDb: () =>
    createClient<Database>('https://demo.invalid', 'k', { global: { fetch: fetchDemo }, auth: { persistSession: false, autoRefreshToken: false } }),
  creaCanale: () => ({ invia: async () => ({ id: 'wamid.1' }), segnaLetto: async () => undefined }),
}
const db = dipendenze.creaDb(base as Ambiente)

/** Richieste in uscita (push e Resend), intercettate. */
let uscite: Array<{ url: string; init: RequestInit }> = []
let risposta: (url: string) => number = () => 201

beforeAll(async () => {
  const v = await generaChiaviVapid()
  env = {
    ...base,
    APP_URL: 'https://salone.example',
    VAPID_PUBLIC_KEY: v.pubblica,
    VAPID_PRIVATE_KEY: v.privata,
    VAPID_SUBJECT: 'mailto:salone@example.com',
    RESEND_API_KEY: 're_prova',
  } as Ambiente
})

beforeEach(() => {
  impostaRitardoDemo(0)
  usaDatiDemo(creaDatiDemo())
  uscite = []
  risposta = () => 201
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    uscite.push({ url, init })
    return new Response(url.includes('resend') ? '{"id":"e1"}' : null, { status: url.includes('resend') ? 200 : risposta(url) })
  })
})
afterEach(() => vi.unstubAllGlobals())

function iscrivi(endpoint: string, operatrice_id = ID_OPERATRICE) {
  datiDemo().push_iscrizioni!.push({ id: `p-${endpoint}`, operatrice_id, endpoint, ...BROWSER, user_agent: null, creato_il: new Date().toISOString() })
}
const push = () => uscite.filter((u) => u.url.startsWith('https://push.'))
const email = () => uscite.filter((u) => u.url === 'https://api.resend.com/emails').map((u) => JSON.parse(String(u.init.body)))

describe('avvisi a Ilenia', () => {
  it('push su ogni dispositivo; quelli disinstallati (410) vengono cancellati; nessuna email', async () => {
    iscrivi('https://push.telefono/1')
    iscrivi('https://push.computer/2')
    risposta = (url) => (url.includes('computer') ? 410 : 201)
    await creaNotificatore(env, db)({ tipo: 'richiesta', appuntamentoId: 'x', confermata: false, cliente: 'Maria Rossi', servizio: 'Piega', quando: 'martedì 17 novembre alle 10:00' })
    expect(push().map((u) => u.url)).toEqual(['https://push.telefono/1', 'https://push.computer/2'])
    const h = push()[0]!.init.headers as Record<string, string>
    expect(h['Content-Encoding']).toBe('aes128gcm')
    expect(h.Authorization).toMatch(/^vapid t=/)
    expect(datiDemo().push_iscrizioni!.map((p) => p.endpoint)).toEqual(['https://push.telefono/1'])
    expect(email()).toEqual([])
  })

  it('nessun dispositivo: email di riserva per le richieste', async () => {
    datiDemo().impostazioni![0]!.email_notifiche = 'ilenia@example.com'
    await creaNotificatore(env, db)({ tipo: 'operatore', cliente: 'Giulia', telefono: '393330000000' })
    expect(email()).toHaveLength(1)
    expect(email()[0]).toMatchObject({ to: ['ilenia@example.com'], from: 'Prenotazioni <onboarding@resend.dev>' })
    expect(email()[0].text).toContain('https://salone.example/messaggi/')
  })

  it('disdette e spostamenti: niente email (solo push)', async () => {
    datiDemo().impostazioni![0]!.email_notifiche = 'ilenia@example.com'
    await creaNotificatore(env, db)({ tipo: 'disdetta', appuntamentoId: 'x', cliente: 'Maria', servizio: 'Piega', quando: 'martedì 17 novembre alle 10:00' })
    expect(uscite).toEqual([])
  })

  it('un errore di rete non blocca il bot', async () => {
    iscrivi('https://push.telefono/1')
    vi.stubGlobal('fetch', async () => Promise.reject(new Error('rete giù')))
    await expect(
      creaNotificatore(env, db)({ tipo: 'richiesta', appuntamentoId: 'x', confermata: false, cliente: 'Maria', servizio: 'Piega', quando: 'martedì 17 novembre alle 10:00' }),
    ).resolves.toBeUndefined()
  })
})

describe('POST /api/pannello/push/prova', () => {
  const app = creaApp(dipendenze)
  const prova = (e: Ambiente) =>
    app.request('/api/pannello/push/prova', { method: 'POST', headers: { authorization: 'Bearer token-buono' } }, e, contesto)

  it('senza chiavi VAPID: 503 con spiegazione', async () => {
    const r = await prova(base as Ambiente)
    expect(r.status).toBe(503)
    expect((await r.json()).errore).toMatch(/non configurate/)
  })

  it('invia solo ai dispositivi dell\'operatrice collegata', async () => {
    iscrivi('https://push.telefono/1')
    iscrivi('https://push.collega/9', 'b0000000-0000-4000-8000-000000000002')
    const r = await prova(env)
    expect(await r.json()).toEqual({ arrivate: 1 })
    expect(push().map((u) => u.url)).toEqual(['https://push.telefono/1'])
  })
})

describe('promemoria nel lavoro programmato', () => {
  it('email il giorno prima a chi ha l\'indirizzo', async () => {
    const d = datiDemo()
    Object.assign(d.impostazioni![0]!, { promemoria: 'email', ora_promemoria: '00:00:00' })
    const domani = adesso().plus({ days: 1 }).startOf('day').set({ hour: 10 })
    for (const a of d.appuntamenti!) if (String(a.inizio).slice(0, 10) === domani.toISODate()) a.stato = 'disdetto'
    const cliente = d.clienti!.find((c) => c.email)!
    d.appuntamenti!.push({
      ...d.appuntamenti![0]!,
      id: 'app-domani',
      cliente_id: cliente.id,
      stato: 'confermato',
      inizio: domani.toISO(),
      fine: domani.plus({ minutes: 45 }).toISO(),
      creato_il: domani.minus({ days: 7 }).toISO(),
      promemoria_inviato_il: null,
      promemoria_esito: null,
    })
    const r = await lavoroProgrammato(env, dipendenze)
    expect(r.promemoria).toEqual({ inviati: 1, saltati: 0 })
    expect(email()[0]).toMatchObject({ to: [cliente.email] })
    expect(d.appuntamenti!.find((a) => a.id === 'app-domani')!.promemoria_esito).toBe('email')
  })
})
