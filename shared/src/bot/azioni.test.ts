import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import { datiDemo, fetchDemo, impostaRitardoDemo, usaDatiDemo } from '../demo/backend'
import type { DbDemo } from '../demo/dati'
import { daDataOra, versoIso } from '../tempo'
import type { Database } from '../tipi-db'
import { statoFinestra, tempoRestante } from '../whatsapp/finestra'
import type { MessaggioUscita } from '../whatsapp/messaggi'
import { approvaRichiesta, ErroreAzione, riattivaBot, rifiutaRichiesta, rispondiCliente, type ContestoAzioni } from './azioni'

const OP = 'op-ilenia'
const ora = daDataOra('2026-11-16', '12:00')
let inviati: Array<{ a: string; m: MessaggioUscita }> = []

const ctx: ContestoAzioni = {
  db: createClient<Database>('https://demo.invalid', 'k', {
    global: { fetch: fetchDemo },
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  canale: {
    async invia(a, m) {
      inviati.push({ a, m })
      return { id: `wamid.${inviati.length}` }
    },
  },
  adesso: () => ora,
}

function dati(): DbDemo {
  const app = (id: string, cliente: string, ora: string, stato = 'in_attesa') => ({
    id,
    operatrice_id: OP,
    cliente_id: cliente,
    servizio_id: 'piega',
    inizio: `2026-11-17T${ora}:00+01:00`,
    fine: versoIso(daDataOra('2026-11-17', ora).plus({ minutes: 45 })),
    stato,
    origine: 'whatsapp',
    conferma_via_template: false,
  })
  return {
    operatrici: [{ id: OP, nome: 'Ilenia', attiva: true }, { id: 'op-altra', nome: 'Giulia', attiva: true }],
    servizi: [{ id: 'piega', operatrice_id: OP, nome: 'Piega', durata_minuti: 45, attivo: true }],
    clienti: [
      { id: 'c-aperta', nome: 'Maria Rossi', telefono: '393331111111' },
      { id: 'c-chiusa', nome: 'Sara Neri', telefono: '393332222222' },
      { id: 'c-senza', nome: 'Anna Senza', telefono: null },
    ],
    conversazioni: [
      // ha scritto 3 ore fa: finestra aperta
      { id: 'v1', cliente_id: 'c-aperta', stato: 'operatore', contesto: {}, ultimo_messaggio_cliente_il: versoIso(ora.minus({ hours: 3 })), bot_in_pausa_fino_al: versoIso(ora.plus({ hours: 5 })) },
      // ha scritto 30 ore fa: finestra chiusa
      { id: 'v2', cliente_id: 'c-chiusa', stato: 'menu', contesto: {}, ultimo_messaggio_cliente_il: versoIso(ora.minus({ hours: 30 })), bot_in_pausa_fino_al: null },
    ],
    appuntamenti: [
      app('a1', 'c-aperta', '10:30'),
      app('a2', 'c-chiusa', '15:00'),
      app('a3', 'c-senza', '16:00'),
      app('a4', 'c-aperta', '17:00', 'confermato'),
    ],
    lista_attesa: [{ id: 'l1', appuntamento_id: 'a2', cliente_id: 'c-chiusa', operatrice_id: OP, attiva: true }],
    log_messaggi: [],
    impostazioni: [
      { operatrice_id: OP, lista_attesa_modalita: 'manuale', lista_attesa_minuti_risposta: 15, lista_attesa_preavviso_minimo_min: 120 },
    ],
    orari_settimanali: [],
    chiusure: [],
    slot_liberati: [],
    proposte_anticipo: [],
  }
}

beforeEach(() => {
  impostaRitardoDemo(0)
  usaDatiDemo(dati())
  inviati = []
})

const app = (id: string) => datiDemo().appuntamenti!.find((a) => a.id === id)!

describe('finestra di 24 ore', () => {
  it('aperta, chiusa, mai aperta', () => {
    expect(statoFinestra(versoIso(ora.minus({ hours: 3 })), ora)).toMatchObject({ aperta: true, minutiRestanti: 21 * 60 })
    expect(statoFinestra(versoIso(ora.minus({ hours: 30 })), ora).aperta).toBe(false)
    expect(statoFinestra(null, ora)).toEqual({ aperta: false, chiude: null, minutiRestanti: 0 })
    expect(tempoRestante(320)).toBe('ancora 5 h 20 min')
    expect(tempoRestante(40)).toBe('ancora 40 min')
  })
})

describe('approvaRichiesta', () => {
  it('finestra aperta: conferma con messaggio libero', async () => {
    expect(await approvaRichiesta(ctx, OP, 'a1')).toEqual({ inviato: 'libero' })
    expect(app('a1')).toMatchObject({ stato: 'confermato', conferma_via_template: false })
    expect(inviati[0]).toEqual({
      a: '393331111111',
      m: {
        tipo: 'testo',
        testo: 'Buone notizie! Ilenia ha confermato il tuo appuntamento: Piega, martedì 17 novembre alle 10:30. Ti aspettiamo!',
      },
    })
    expect(datiDemo().log_messaggi![0]).toMatchObject({ direzione: 'out', costo: 'libero' })
  })

  it('finestra chiusa: template a pagamento, segnalato sull\'appuntamento', async () => {
    expect(await approvaRichiesta(ctx, OP, 'a2')).toEqual({ inviato: 'template' })
    expect(app('a2')).toMatchObject({ stato: 'confermato', conferma_via_template: true })
    expect(inviati[0]!.m).toMatchObject({
      tipo: 'template',
      nome: 'conferma_appuntamento',
      lingua: 'it',
      parametri: ['Sara', 'Piega', 'martedì 17 novembre alle 15:00'],
    })
    expect(datiDemo().log_messaggi![0]).toMatchObject({ costo: 'template', template_nome: 'conferma_appuntamento' })
  })

  it('template rifiutato da Meta (es. pagamento non attivo): confermata comunque, link per avvisarla a mano', async () => {
    const canale = ctx.canale
    ctx.canale = { invia: async () => Promise.reject(new Error('(#131042) Business eligibility payment issue')) }
    try {
      const esito = await approvaRichiesta(ctx, OP, 'a2')
      expect(esito).toMatchObject({ inviato: 'no', motivo: 'template_non_riuscito' })
      expect((esito as { link: string }).link).toMatch(/^https:\/\/wa\.me\/\d+\?text=/)
      expect(app('a2')).toMatchObject({ stato: 'confermato', conferma_via_template: false })
    } finally {
      ctx.canale = canale
    }
  })

  it('cliente senza numero: confermata, nessun messaggio', async () => {
    expect(await approvaRichiesta(ctx, OP, 'a3')).toEqual({ inviato: 'no', motivo: 'senza_telefono' })
    expect(app('a3').stato).toBe('confermato')
    expect(inviati).toEqual([])
  })

  it('già gestita o di un\'altra operatrice: errore', async () => {
    await expect(approvaRichiesta(ctx, OP, 'a4')).rejects.toMatchObject({ codice: 'gia_gestita' })
    await expect(approvaRichiesta(ctx, 'op-altra', 'a1')).rejects.toMatchObject({ codice: 'non_trovato' })
    expect(app('a1').stato).toBe('in_attesa')
  })
})

describe('rifiutaRichiesta', () => {
  it('finestra aperta: avviso gratuito con pulsante per un altro orario', async () => {
    expect(await rifiutaRichiesta(ctx, OP, 'a1', 'Quel giorno sono a un corso.')).toEqual({ inviato: 'libero' })
    expect(app('a1')).toMatchObject({ stato: 'rifiutato', motivo_rifiuto: 'Quel giorno sono a un corso.' })
    const m = inviati[0]!.m as Extract<MessaggioUscita, { tipo: 'pulsanti' }>
    expect(m.testo).toBe(
      "Mi dispiace, Ilenia non può confermare l'appuntamento per Piega di martedì 17 novembre alle 10:30.\nQuel giorno sono a un corso.\n\nVuoi scegliere un altro orario?",
    )
    expect(m.pulsanti).toEqual([{ id: 'menu:prenota', titolo: 'Scegli altro orario' }])
  })

  it('finestra chiusa: niente template, link wa.me per scriverle a mano', async () => {
    const esito = await rifiutaRichiesta(ctx, OP, 'a2')
    expect(esito).toMatchObject({ inviato: 'no', motivo: 'finestra_chiusa' })
    expect(esito.inviato === 'no' && esito.link).toMatch(/^https:\/\/wa\.me\/393332222222\?text=Mi%20dispiace/)
    expect(inviati).toEqual([])
    // non resta in lista d'attesa
    expect(datiDemo().lista_attesa![0]!.attiva).toBe(false)
  })
})

describe('rispondiCliente', () => {
  it('dentro la finestra: messaggio libero', async () => {
    expect(await rispondiCliente(ctx, 'c-aperta', 'Certo, porta pure tua figlia!')).toEqual({ inviato: 'libero' })
    expect(inviati[0]!.m).toEqual({ tipo: 'testo', testo: 'Certo, porta pure tua figlia!' })
  })

  it('fuori finestra: errore con link wa.me', async () => {
    const errore = await rispondiCliente(ctx, 'c-chiusa', 'Ciao').catch((e: unknown) => e)
    expect(errore).toBeInstanceOf(ErroreAzione)
    expect((errore as ErroreAzione).link).toBe('https://wa.me/393332222222?text=Ciao')
    expect(inviati).toEqual([])
  })

  it('testo vuoto: errore', async () => {
    await expect(rispondiCliente(ctx, 'c-aperta', '   ')).rejects.toMatchObject({ codice: 'testo_non_valido' })
  })
})

describe('riattivaBot', () => {
  it('toglie la pausa', async () => {
    await riattivaBot(ctx.db, 'c-aperta')
    expect(datiDemo().conversazioni![0]).toMatchObject({ bot_in_pausa_fino_al: null, stato: 'menu' })
  })
})
