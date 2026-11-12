import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import { datiDemo, fetchDemo, impostaRitardoDemo, usaDatiDemo } from '../demo/backend'
import type { DbDemo, Riga } from '../demo/dati'
import { daDataOra, versoIso } from '../tempo'
import type { Database } from '../tipi-db'
import type { MessaggioUscita } from '../whatsapp/messaggi'
import { chiudiSlot, codiceAccettazione, elaboraScadenze, inviaPropostaManuale } from './anticipo'
import { disdiciDalPannello, rifiutaRichiesta, segnaRispostaProposta } from './azioni'
import type { Notifica } from './comune'
import { gestisciEvento, type ContestoBot } from './motore'

const OP = 'op-ilenia'
let ora = daDataOra('2026-11-16', '08:00') // lunedì
let inviati: Array<{ a: string; m: MessaggioUscita }> = []
let notifiche: Notifica[] = []

const ctx: ContestoBot = {
  db: createClient<Database>('https://demo.invalid', 'k', {
    global: { fetch: fetchDemo },
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  canale: {
    async invia(a, m) {
      inviati.push({ a, m })
      return { id: `wamid.out.${inviati.length}` }
    },
  },
  adesso: () => ora,
  notifica: (n) => void notifiche.push(n),
}

const TEL = { anna: '393330000001', bea: '393330000002', carla: '393330000003', dora: '393330000004', zoe: '393330000009' }

function app(id: string, cliente: string, giorno: string, inizio: string, minuti: number, stato = 'confermato', servizio = 'piega'): Riga {
  const i = daDataOra(giorno, inizio)
  return {
    id,
    operatrice_id: OP,
    cliente_id: cliente,
    servizio_id: servizio,
    inizio: versoIso(i),
    fine: versoIso(i.plus({ minutes: minuti })),
    stato,
    origine: 'whatsapp',
  }
}

function dati(opz: { modalita?: 'manuale' | 'automatica'; iscritte?: string[] } = {}): DbDemo {
  const iscritte = opz.iscritte ?? ['a-bea', 'a-carla', 'a-dora']
  const appuntamenti = [
    app('a-x', 'c-zoe', '2026-11-17', '09:00', 30),
    app('a-anna', 'c-anna', '2026-11-17', '10:00', 45),
    app('a-y', 'c-zoe', '2026-11-17', '11:30', 30),
    app('a-bea', 'c-bea', '2026-11-19', '09:00', 45),
    app('a-carla', 'c-carla', '2026-11-20', '09:00', 90, 'confermato', 'colore'),
    app('a-dora', 'c-dora', '2026-11-24', '10:00', 45),
  ]
  return {
    operatrici: [{ id: OP, nome: 'Ilenia', attiva: true, creato_il: '2026-01-01T00:00:00Z' }],
    impostazioni: [
      {
        operatrice_id: OP,
        approvazione: 'manuale',
        ore_limite_modifica: 24,
        lista_attesa_modalita: opz.modalita ?? 'manuale',
        lista_attesa_minuti_risposta: 15,
        lista_attesa_preavviso_minimo_min: 120,
        preavviso_minimo_prenotazione_min: 120,
        giorni_prenotabili: 30,
        passo_slot_min: 30,
        parola_operatore: 'operatore',
        ore_pausa_operatore: 12,
        telefono_salone: null,
        numero_whatsapp: '393000000999',
      },
    ],
    servizi: [
      { id: 'piega', operatrice_id: OP, nome: 'Piega', durata_minuti: 45, attivo: true },
      { id: 'colore', operatrice_id: OP, nome: 'Colore', durata_minuti: 90, attivo: true },
    ],
    orari_settimanali: [
      { id: 'o1', operatrice_id: OP, giorno: 2, ora_inizio: '09:00:00', ora_fine: '13:00:00' },
      { id: 'o2', operatrice_id: OP, giorno: 4, ora_inizio: '09:00:00', ora_fine: '13:00:00' },
      { id: 'o3', operatrice_id: OP, giorno: 5, ora_inizio: '09:00:00', ora_fine: '13:00:00' },
    ],
    chiusure: [],
    clienti: [
      { id: 'c-anna', nome: 'Anna Rossi', telefono: TEL.anna },
      { id: 'c-bea', nome: 'Bea Verdi', telefono: TEL.bea },
      { id: 'c-carla', nome: 'Carla Neri', telefono: TEL.carla },
      { id: 'c-dora', nome: 'Dora Esposito', telefono: TEL.dora },
      { id: 'c-zoe', nome: 'Zoe Gialli', telefono: TEL.zoe },
    ],
    appuntamenti,
    lista_attesa: iscritte.map((a, i) => ({
      id: `l${i}`,
      appuntamento_id: a,
      cliente_id: appuntamenti.find((x) => x.id === a)!.cliente_id,
      operatrice_id: OP,
      attiva: true,
    })),
    conversazioni: [],
    slot_liberati: [],
    proposte_anticipo: [],
    log_messaggi: [],
  }
}

const proposte = () => datiDemo().proposte_anticipo!
const slot = () => datiDemo().slot_liberati!
const appuntamento = (id: string) => datiDemo().appuntamenti!.find((a) => a.id === id)!
const ultimaProposta = () => proposte().at(-1)!

/** La cliente risponde dal telefono (al bot). */
async function risponde(telefono: string, contenuto: { tipo: 'testo'; testo: string } | { tipo: 'scelta'; id: string; titolo: string }) {
  const prima = inviati.length
  await gestisciEvento(ctx, { tipo: 'messaggio', id: `wamid.in.${Math.random()}`, da: telefono, nomeProfilo: null, timestamp: 0, contenuto })
  return inviati.slice(prima).map((x) => x.m)
}

/** Finestra di 24 ore aperta per una cliente (ha scritto un'ora fa). */
function finestraAperta(clienteId: string) {
  datiDemo().conversazioni!.push({
    id: `conv-${clienteId}`,
    cliente_id: clienteId,
    stato: 'menu',
    contesto: {},
    ultimo_messaggio_cliente_il: versoIso(ora.minus({ hours: 1 })),
    bot_in_pausa_fino_al: null,
  })
}

beforeEach(() => {
  impostaRitardoDemo(0)
  ora = daDataOra('2026-11-16', '08:00')
  inviati = []
  notifiche = []
})

describe('modalità manuale', () => {
  beforeEach(() => usaDatiDemo(dati()))

  it('disdetta → proposta alla cliente con l\'appuntamento più lontano, da inviare da Ilenia', async () => {
    expect(await disdiciDalPannello(ctx, OP, 'a-anna', true)).toEqual({ proposto: true })
    expect(slot()).toHaveLength(1)
    expect(ultimaProposta()).toMatchObject({
      appuntamento_id: 'a-dora',
      canale: 'manuale',
      stato: 'da_inviare',
      nuovo_inizio: '2026-11-17T10:00:00+01:00',
      nuova_fine: '2026-11-17T10:45:00+01:00',
      scade_il: null,
    })
    expect(notifiche.at(-1)).toMatchObject({
      tipo: 'anticipo_da_inviare',
      cliente: 'Dora Esposito',
      quando: 'martedì 17 novembre alle 10:00',
      attuale: 'martedì 24 novembre alle 10:00',
    })
    expect(inviati).toEqual([]) // nessun messaggio automatico
  })

  it('Ilenia apre WhatsApp: messaggio pronto con il link di ritorno al bot, parte il tempo', async () => {
    await disdiciDalPannello(ctx, OP, 'a-anna', true)
    const p = ultimaProposta()
    const m = await inviaPropostaManuale(ctx, OP, String(p.id))
    expect(m?.link.startsWith(`https://wa.me/${TEL.dora}?text=`)).toBe(true)
    expect(m?.testo).toBe(
      `Ciao Dora! Si è liberato un posto prima per Piega: martedì 17 novembre alle 10:00 (ora hai martedì 24 novembre alle 10:00).\n\nSe ti interessa, entro 15 minuti tocca qui e invia il messaggio: https://wa.me/393000000999?text=ACCETTO%20${p.codice}`,
    )
    expect(p).toMatchObject({ stato: 'inviata', scade_il: '2026-11-16T08:15:00+01:00' })
  })

  it('la cliente scrive «ACCETTO codice» al bot: appuntamento anticipato, poi catena', async () => {
    await disdiciDalPannello(ctx, OP, 'a-anna', true)
    const p = ultimaProposta()
    await inviaPropostaManuale(ctx, OP, String(p.id))

    const r = await risponde(TEL.dora, { tipo: 'testo', testo: `ACCETTO ${p.codice}` })
    expect(r.at(-1)).toEqual({ tipo: 'testo', testo: 'Fatto! Il tuo appuntamento per Piega è anticipato a martedì 17 novembre alle 10:00. A presto!' })
    expect(appuntamento('a-dora')).toMatchObject({ inizio: '2026-11-17T10:00:00+01:00', fine: '2026-11-17T10:45:00+01:00' })
    expect(p.stato).toBe('accettata')
    expect(slot()[0]!.stato).toBe('assegnato')
    expect(notifiche).toContainEqual(expect.objectContaining({ tipo: 'anticipo_accettato', cliente: 'Dora Esposito' }))
    // il vecchio posto di Dora (24/11) si libera: nessuna iscritta con un appuntamento più avanti
    expect(slot()).toHaveLength(2)
    expect(slot()[1]).toMatchObject({ inizio: '2026-11-24T10:00:00+01:00', stato: 'esaurito' })
  })

  it('il codice usato da un\'altra cliente non vale', async () => {
    await disdiciDalPannello(ctx, OP, 'a-anna', true)
    const r = await risponde(TEL.bea, { tipo: 'testo', testo: `accetto ${ultimaProposta().codice}` })
    expect(r.at(-1)).toEqual({ tipo: 'testo', testo: 'Non trovo questa proposta: forse è già stata gestita.' })
    expect(appuntamento('a-dora').inizio).toBe('2026-11-24T10:00:00+01:00')
  })

  it('Ilenia segna «non le interessa»: si passa alla successiva', async () => {
    await disdiciDalPannello(ctx, OP, 'a-anna', true)
    await segnaRispostaProposta(ctx, OP, String(ultimaProposta().id), false)
    expect(proposte().map((p) => [p.appuntamento_id, p.stato])).toEqual([
      ['a-dora', 'rifiutata'],
      ['a-carla', 'da_inviare'],
    ])
  })

  it('Ilenia segna «ha accettato»', async () => {
    await disdiciDalPannello(ctx, OP, 'a-anna', true)
    const esito = await segnaRispostaProposta(ctx, OP, String(ultimaProposta().id), true)
    expect(esito.esito).toBe('accettata')
    expect(appuntamento('a-dora').inizio).toBe('2026-11-17T10:00:00+01:00')
  })

  it('disdetta senza proporre il posto', async () => {
    expect(await disdiciDalPannello(ctx, OP, 'a-anna', false)).toEqual({ proposto: false })
    expect(slot()).toEqual([])
  })

  it('posto preso nel frattempo: la cliente resta dov\'era', async () => {
    await disdiciDalPannello(ctx, OP, 'a-anna', true)
    const p = ultimaProposta()
    datiDemo().appuntamenti!.push(app('a-intrusa', 'c-zoe', '2026-11-17', '10:00', 45))
    const r = await risponde(TEL.dora, { tipo: 'testo', testo: `ACCETTO ${p.codice}` })
    expect(r.at(-1)).toEqual({
      tipo: 'testo',
      testo: 'Mi dispiace, quel posto è appena stato preso. Il tuo appuntamento resta martedì 24 novembre alle 10:00.',
    })
    expect(appuntamento('a-dora').inizio).toBe('2026-11-24T10:00:00+01:00')
  })

  it('Ilenia chiude il posto: nessun\'altra proposta', async () => {
    await disdiciDalPannello(ctx, OP, 'a-anna', true)
    await chiudiSlot(ctx, OP, String(slot()[0]!.id))
    expect(slot()[0]!.stato).toBe('annullato')
    expect(ultimaProposta().stato).toBe('annullata')
  })
})

describe('modalità automatica', () => {
  beforeEach(() => usaDatiDemo(dati({ modalita: 'automatica' })))

  it('finestra aperta: pulsanti gratuiti; «No grazie» → la successiva riceve il template', async () => {
    finestraAperta('c-dora')
    await disdiciDalPannello(ctx, OP, 'a-anna', true)
    const p = ultimaProposta()
    expect(p).toMatchObject({ appuntamento_id: 'a-dora', canale: 'interattivo', stato: 'inviata', scade_il: '2026-11-16T08:15:00+01:00' })
    expect(inviati[0]).toEqual({
      a: TEL.dora,
      m: {
        tipo: 'pulsanti',
        testo:
          'Si è liberato un posto prima per Piega: martedì 17 novembre alle 10:00 (ora hai martedì 24 novembre alle 10:00).\n\nTi interessa? Hai 15 minuti per rispondere.',
        pulsanti: [
          { id: `anticipo-ok:${p.codice}`, titolo: 'Accetto' },
          { id: `anticipo-no:${p.codice}`, titolo: 'No grazie' },
        ],
      },
    })
    expect(datiDemo().log_messaggi!.at(-1)).toMatchObject({ costo: 'libero' })

    const r = await risponde(TEL.dora, { tipo: 'scelta', id: `anticipo-no:${p.codice}`, titolo: 'No grazie' })
    expect(r[0]).toEqual({ tipo: 'testo', testo: "Va bene, resta tutto com'era: ti aspettiamo martedì 24 novembre alle 10:00." })
    // Carla (colore, 90 minuti) ci sta grazie al tempo libero vicino: 9:30–11:30
    expect(ultimaProposta()).toMatchObject({ appuntamento_id: 'a-carla', canale: 'template', nuova_fine: '2026-11-17T11:30:00+01:00' })
    expect(inviati.at(-1)!.m).toMatchObject({
      tipo: 'template',
      nome: 'proposta_anticipo',
      parametri: ['Carla', 'Colore', 'martedì 17 novembre alle 10:00', 'venerdì 20 novembre alle 09:00', '15'],
      risposte: [`anticipo-ok:${ultimaProposta().codice}`, `anticipo-no:${ultimaProposta().codice}`],
    })
    expect(datiDemo().log_messaggi!.at(-1)).toMatchObject({ costo: 'template', template_nome: 'proposta_anticipo' })
  })

  it('nessuna risposta in 15 minuti → la successiva; poi la prima prova ad accettare tardi', async () => {
    await disdiciDalPannello(ctx, OP, 'a-anna', true)
    const prima = ultimaProposta()
    ora = ora.plus({ minutes: 16 })
    expect(await elaboraScadenze(ctx)).toBe(1)
    expect(prima.stato).toBe('scaduta')
    expect(ultimaProposta().appuntamento_id).toBe('a-carla')

    const r = await risponde(TEL.dora, { tipo: 'scelta', id: `anticipo-ok:${prima.codice}`, titolo: 'Accetto' })
    expect(r.at(-1)).toEqual({
      tipo: 'testo',
      testo: "Mi dispiace, il tempo per accettare è scaduto e il posto è stato proposto a un'altra cliente.",
    })
    expect(appuntamento('a-dora').inizio).toBe('2026-11-24T10:00:00+01:00')
  })

  it('tutte dicono no → posto esaurito', async () => {
    await disdiciDalPannello(ctx, OP, 'a-anna', true)
    for (let i = 0; i < 3; i++) {
      const p = ultimaProposta()
      const tel = datiDemo().clienti!.find((c) => c.id === p.cliente_id)!.telefono as string
      await risponde(tel, { tipo: 'scelta', id: `anticipo-no:${p.codice}`, titolo: 'No grazie' })
    }
    expect(proposte().map((p) => p.appuntamento_id)).toEqual(['a-dora', 'a-carla', 'a-bea'])
    expect(slot()[0]!.stato).toBe('esaurito')
  })
})

describe('regole', () => {
  it('nessuna proposta se il posto inizia tra meno del preavviso minimo (2 ore)', async () => {
    usaDatiDemo(dati())
    ora = daDataOra('2026-11-17', '08:30')
    await disdiciDalPannello(ctx, OP, 'a-anna', true)
    expect(proposte()).toEqual([])
    expect(slot()[0]!.stato).toBe('esaurito')
  })

  it('un servizio troppo lungo per lo spazio libero non viene proposto', async () => {
    const d = dati({ iscritte: ['a-carla'] })
    d.appuntamenti!.find((a) => a.id === 'a-y')!.inizio = '2026-11-17T10:45:00+01:00' // niente tempo libero dopo
    d.appuntamenti!.find((a) => a.id === 'a-y')!.fine = '2026-11-17T11:15:00+01:00'
    d.appuntamenti!.find((a) => a.id === 'a-x')!.fine = '2026-11-17T10:00:00+01:00' // né prima
    usaDatiDemo(d)
    await disdiciDalPannello(ctx, OP, 'a-anna', true)
    expect(proposte()).toEqual([])
    expect(slot()[0]!.stato).toBe('esaurito')
  })

  it('chi ha un appuntamento prima del posto liberato non è candidata', async () => {
    usaDatiDemo(dati({ iscritte: ['a-bea'] }))
    ora = daDataOra('2026-11-16', '08:00')
    // si libera venerdì 20: Bea (giovedì 19) è prima, non le conviene
    await disdiciDalPannello(ctx, OP, 'a-carla', true)
    expect(proposte()).toEqual([])
  })

  it('una richiesta rifiutata libera il posto per la lista d\'attesa', async () => {
    const d = dati()
    d.appuntamenti!.find((a) => a.id === 'a-anna')!.stato = 'in_attesa'
    usaDatiDemo(d)
    await rifiutaRichiesta(ctx, OP, 'a-anna')
    expect(ultimaProposta()).toMatchObject({ appuntamento_id: 'a-dora', stato: 'da_inviare' })
  })

  it('il posto in proposta non viene offerto dal bot ad altre clienti', async () => {
    usaDatiDemo(dati())
    await disdiciDalPannello(ctx, OP, 'a-anna', true)
    await risponde(TEL.zoe, { tipo: 'scelta', id: 'srv:piega', titolo: 'Piega' })
    const r = await risponde(TEL.zoe, { tipo: 'scelta', id: 'giorno:2026-11-17', titolo: 'Mar 17' })
    const ore = (r.at(-1) as Extract<MessaggioUscita, { tipo: 'lista' }>).righe.map((x) => x.titolo)
    expect(ore).not.toContain('10:00')
  })

  it('codice scritto in un messaggio', () => {
    expect(codiceAccettazione('ACCETTO K7P2Q')).toBe('K7P2Q')
    expect(codiceAccettazione('  accetto k7p2q grazie!')).toBe('K7P2Q')
    expect(codiceAccettazione('accetto')).toBeNull()
    expect(codiceAccettazione('ciao')).toBeNull()
  })
})
