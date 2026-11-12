import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import { datiDemo, fetchDemo, impostaRitardoDemo, usaDatiDemo } from '../demo/backend'
import type { DbDemo, Riga } from '../demo/dati'
import { daDataOra, versoIso } from '../tempo'
import type { Database } from '../tipi-db'
import type { MessaggioUscita } from '../whatsapp/messaggi'
import { gestisciEvento } from './motore'
import { inviaPromemoria, type ContestoPromemoria } from './promemoria'

const OP = 'op-ilenia'
let ora = daDataOra('2026-11-16', '18:30') // lunedì sera
let inviati: Array<{ a: string; m: MessaggioUscita }> = []
let email: Array<{ a: string; oggetto: string; testo: string }> = []
let emailRotta = false

const ctx: ContestoPromemoria = {
  db: createClient<Database>('https://demo.invalid', 'k', { global: { fetch: fetchDemo }, auth: { persistSession: false, autoRefreshToken: false } }),
  canale: {
    async invia(a, m) {
      inviati.push({ a, m })
      return { id: `wamid.${inviati.length}` }
    },
  },
  adesso: () => ora,
  email: async (a, oggetto, testo) => {
    if (emailRotta) throw new Error('Resend non risponde')
    email.push({ a, oggetto, testo })
  },
}

function app(id: string, cliente: string, quando: string, stato = 'confermato', creato = '2026-11-01T10:00:00+01:00'): Riga {
  const i = daDataOra(quando.slice(0, 10), quando.slice(11))
  return {
    id,
    operatrice_id: OP,
    cliente_id: cliente,
    servizio_id: 'piega',
    inizio: versoIso(i),
    fine: versoIso(i.plus({ minutes: 45 })),
    stato,
    creato_il: creato,
    promemoria_inviato_il: null,
    promemoria_esito: null,
  }
}

function dati(promemoria: 'disattivato' | 'email' | 'template'): DbDemo {
  return {
    operatrici: [{ id: OP, nome: 'Ilenia', attiva: true, creato_il: '2026-01-01T00:00:00Z' }],
    impostazioni: [
      {
        operatrice_id: OP,
        promemoria,
        ora_promemoria: '18:00:00',
        telefono_salone: '0123 456789',
        approvazione: 'manuale',
        ore_limite_modifica: 24,
        lista_attesa_modalita: 'manuale',
        lista_attesa_minuti_risposta: 15,
        lista_attesa_preavviso_minimo_min: 120,
        preavviso_minimo_prenotazione_min: 120,
        giorni_prenotabili: 30,
        passo_slot_min: 30,
        parola_operatore: 'operatore',
        ore_pausa_operatore: 12,
      },
    ],
    servizi: [{ id: 'piega', operatrice_id: OP, nome: 'Piega', durata_minuti: 45, attivo: true, ordine: 1 }],
    orari_settimanali: [{ id: 'o1', operatrice_id: OP, giorno: 2, ora_inizio: '09:00:00', ora_fine: '19:00:00' }],
    chiusure: [],
    clienti: [
      { id: 'c-maria', nome: 'Maria Rossi', telefono: '393330000001', email: 'maria@example.com' },
      { id: 'c-sara', nome: 'Sara Neri', telefono: '393330000002', email: null },
      { id: 'c-anna', nome: 'Anna Bianchi', telefono: null, email: 'anna@example.com' },
      { id: 'c-zoe', nome: 'Zoe Gialli', telefono: '393330000009', email: null },
    ],
    appuntamenti: [
      app('a1', 'c-maria', '2026-11-17 10:00'),
      app('a2', 'c-sara', '2026-11-17 11:00'),
      app('a3', 'c-anna', '2026-11-17 12:00'),
      app('a4', 'c-zoe', '2026-11-17 15:00', 'in_attesa'),
      app('a5', 'c-maria', '2026-11-18 10:00'),
      app('a6', 'c-sara', '2026-11-17 16:00', 'confermato', '2026-11-16T18:00:00+01:00'), // prenotato mezz'ora fa
    ],
    conversazioni: [
      { id: 'v1', cliente_id: 'c-maria', stato: 'menu', contesto: {}, ultimo_messaggio_cliente_il: '2026-11-16T15:30:00+01:00', bot_in_pausa_fino_al: null },
    ],
    lista_attesa: [],
    slot_liberati: [],
    proposte_anticipo: [],
    log_messaggi: [],
  }
}

const esito = (id: string) => datiDemo().appuntamenti!.find((a) => a.id === id)!.promemoria_esito

beforeEach(() => {
  impostaRitardoDemo(0)
  ora = daDataOra('2026-11-16', '18:30')
  inviati = []
  email = []
  emailRotta = false
})

describe('promemoria via WhatsApp', () => {
  beforeEach(() => usaDatiDemo(dati('template')))

  it('prima dell\'ora impostata non parte nulla', async () => {
    ora = daDataOra('2026-11-16', '17:59')
    expect(await inviaPromemoria(ctx)).toEqual({ inviati: 0, saltati: 0 })
    expect(inviati).toEqual([])
  })

  it('gratis a chi ha scritto nelle ultime 24 ore, template agli altri, una volta sola', async () => {
    expect(await inviaPromemoria(ctx)).toEqual({ inviati: 2, saltati: 2 })
    expect(inviati[0]).toEqual({
      a: '393330000001',
      m: {
        tipo: 'testo',
        testo:
          'Ciao! Ti ricordo il tuo appuntamento: Piega, martedì 17 novembre alle 10:00. Ti aspettiamo!\nPer un imprevisto chiama il salone al 0123 456789.',
      },
    })
    expect(inviati[1]!.m).toMatchObject({
      tipo: 'template',
      nome: 'promemoria_appuntamento',
      parametri: ['Sara', 'Piega', 'martedì 17 novembre alle 11:00'],
    })
    expect([esito('a1'), esito('a2'), esito('a3'), esito('a4'), esito('a5'), esito('a6')]).toEqual([
      'whatsapp',
      'template',
      'senza_contatto', // Anna non ha il numero
      null, // in attesa: niente promemoria
      null, // dopodomani
      'non_necessario', // prenotato mezz'ora fa
    ])
    // il minuto dopo: nessun doppione
    ora = ora.plus({ minutes: 1 })
    expect(await inviaPromemoria(ctx)).toEqual({ inviati: 0, saltati: 0 })
    expect(inviati).toHaveLength(2)
  })

  it('invio fallito: segnato come errore, senza riprovare all\'infinito', async () => {
    ctx.canale = { invia: async () => Promise.reject(new Error('template non approvato')) }
    await inviaPromemoria(ctx)
    expect(esito('a2')).toBe('errore')
    ctx.canale = {
      async invia(a, m) {
        inviati.push({ a, m })
        return { id: `wamid.${inviati.length}` }
      },
    }
  })
})

describe('promemoria via email', () => {
  beforeEach(() => usaDatiDemo(dati('email')))

  it('email a chi ha l\'indirizzo, gli altri restano senza', async () => {
    expect(await inviaPromemoria(ctx)).toEqual({ inviati: 2, saltati: 2 })
    expect(email.map((e) => e.a)).toEqual(['maria@example.com', 'anna@example.com'])
    expect(email[0]).toEqual({
      a: 'maria@example.com',
      oggetto: 'Promemoria appuntamento: martedì 17 novembre alle 10:00',
      testo:
        'Ciao Maria,\n\nti ricordo il tuo appuntamento da Ilenia: Piega, martedì 17 novembre alle 10:00.\nPer un imprevisto chiama il salone al 0123 456789.\n\nA presto!\nIlenia',
    })
    expect(esito('a2')).toBe('senza_contatto')
    expect(inviati).toEqual([]) // nessun WhatsApp
  })

  it('email non partita: errore', async () => {
    emailRotta = true
    await inviaPromemoria(ctx)
    expect(esito('a1')).toBe('errore')
  })
})

describe('altri casi', () => {
  it('disattivato: nulla', async () => {
    usaDatiDemo(dati('disattivato'))
    expect(await inviaPromemoria(ctx)).toEqual({ inviati: 0, saltati: 0 })
  })

  it('forzato su un giorno scelto (pulsante della demo)', async () => {
    usaDatiDemo(dati('template'))
    ora = daDataOra('2026-11-16', '09:00')
    const r = await inviaPromemoria(ctx, { forza: true, giorno: daDataOra('2026-11-18', '00:00') })
    expect(r).toEqual({ inviati: 1, saltati: 0 })
    expect(esito('a5')).toBe('whatsapp')
  })
})

describe('il bot chiede l\'email se i promemoria sono via email', () => {
  beforeEach(() => {
    usaDatiDemo(dati('email'))
    ora = daDataOra('2026-11-16', '08:00')
  })
  const scrivi = async (da: string, contenuto: { tipo: 'testo'; testo: string } | { tipo: 'scelta'; id: string; titolo: string }) => {
    const prima = inviati.length
    await gestisciEvento({ ...ctx, notifica: () => undefined }, { tipo: 'messaggio', id: `w${Math.random()}`, da, nomeProfilo: null, timestamp: 0, contenuto })
    return inviati.slice(prima).map((x) => x.m)
  }

  it('cliente nuova: nome, poi email (salvata), poi riepilogo', async () => {
    await scrivi('393339999999', { tipo: 'scelta', id: 'srv:piega', titolo: 'Piega' })
    await scrivi('393339999999', { tipo: 'scelta', id: 'ora:2026-11-17T14:00:00+01:00', titolo: '14:00' })
    let r = await scrivi('393339999999', { tipo: 'testo', testo: 'Lia Verdi' })
    expect(r.at(-1)).toEqual({
      tipo: 'pulsanti',
      testo: 'Vuoi il promemoria via email il giorno prima? Scrivi il tuo indirizzo email, oppure tocca «Salta».',
      pulsanti: [{ id: 'email:salta', titolo: 'Salta' }],
    })
    r = await scrivi('393339999999', { tipo: 'testo', testo: 'non è una email' })
    expect((r.at(-1) as { testo: string }).testo).toMatch(/^Non sembra un indirizzo email valido/)
    r = await scrivi('393339999999', { tipo: 'testo', testo: 'Lia.Verdi@Example.com' })
    expect((r.at(-1) as { testo: string }).testo).toMatch(/^Ecco il riepilogo/)
    expect(datiDemo().clienti!.find((c) => c.telefono === '393339999999')!.email).toBe('lia.verdi@example.com')
  })

  it('«Salta» porta al riepilogo; chi ha già l\'email non viene interrogata', async () => {
    await scrivi('393330000002', { tipo: 'scelta', id: 'srv:piega', titolo: 'Piega' })
    let r = await scrivi('393330000002', { tipo: 'scelta', id: 'ora:2026-11-17T14:00:00+01:00', titolo: '14:00' })
    expect((r.at(-1) as { testo: string }).testo).toMatch(/promemoria via email/)
    r = await scrivi('393330000002', { tipo: 'scelta', id: 'email:salta', titolo: 'Salta' })
    expect((r.at(-1) as { testo: string }).testo).toMatch(/^Ecco il riepilogo/)

    await scrivi('393330000001', { tipo: 'scelta', id: 'srv:piega', titolo: 'Piega' })
    r = await scrivi('393330000001', { tipo: 'scelta', id: 'ora:2026-11-17T13:00:00+01:00', titolo: '13:00' })
    expect((r.at(-1) as { testo: string }).testo).toMatch(/^Ecco il riepilogo/) // Maria ha già l'email
  })
})
