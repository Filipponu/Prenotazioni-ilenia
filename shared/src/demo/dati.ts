/**
 * Dati di esempio della versione dimostrativa: servizi, orari, clienti e
 * appuntamenti calcolati rispetto alla settimana in corso, così la demo
 * sembra sempre "viva". Nomi e numeri sono inventati.
 */
import { adesso, daDataOra, versoIso } from '../tempo'

export const ID_UTENTE = '11111111-1111-4111-8111-111111111111'
export const ID_OPERATRICE = 'a0000000-0000-4000-8000-000000000001'
export const EMAIL_DEMO = 'ilenia@demo.it'
export const PASSWORD_DEMO = 'demo'

export type Riga = Record<string, unknown> & { id?: string | number }
export type DbDemo = Record<string, Riga[]>

const SERVIZI = [
  ['s-piega', 'Piega', 45, 25],
  ['s-taglio', 'Taglio e piega', 60, 40],
  ['s-colore', 'Colore', 90, 45],
  ['s-colore-piega', 'Colore + piega', 120, 65],
  ['s-meches', 'Meches', 150, 80],
  ['s-trattamento', 'Trattamento ristrutturante', 30, 20],
] as const

const CLIENTI = [
  ['c-maria', 'Maria Rossi', '393000000101', null, 'Preferisce il sabato mattina.'],
  ['c-giulia', 'Giulia Bianchi', '393000000102', 'giulia.bianchi@example.com', 'Capelli lunghi: proporre il trattamento.'],
  ['c-francesca', 'Francesca Romano', '393000000103', null, null],
  ['c-chiara', 'Chiara Colombo', '393000000104', null, 'Cute sensibile: colore senza ammoniaca.'],
  ['c-sara', 'Sara Ricci', '393000000105', 'sara.ricci@example.com', null],
  ['c-elena', 'Elena Marino', '393000000106', null, null],
  ['c-laura', 'Laura Greco', '393000000107', null, 'Viene sempre con la figlia.'],
  ['c-valentina', 'Valentina Bruno', '393000000108', null, null],
  ['c-alessia', 'Alessia Gallo', '393000000109', null, null],
  ['c-martina', 'Martina Conti', '393000000110', null, 'Nuova cliente, arrivata da Instagram.'],
  ['c-giorgia', 'Giorgia Esposito', '393000000111', null, null],
  ['c-federica', 'Federica Ferrari', '393000000112', null, null],
  ['c-silvia', 'Silvia Fontana', '393000000113', null, null],
  ['c-paola', 'Paola Moretti', '393000000114', null, null],
  ['c-roberta', 'Roberta Barbieri', '393000000115', null, null],
  ['c-anna', 'Anna Lombardi', '393000000116', 'anna.lombardi@example.com', null],
] as const

// [settimana (0 = corrente), giorno (1 = lun … 6 = sab), ora, cliente, servizio, stato, origine]
type Riga_ = [number, number, string, string, string, 'confermato' | 'in_attesa' | 'disdetto', 'whatsapp' | 'pannello']
const APPUNTAMENTI: Riga_[] = [
  [-1, 2, '10:00', 'c-maria', 's-piega', 'confermato', 'whatsapp'],
  [-1, 3, '09:00', 'c-chiara', 's-colore', 'confermato', 'pannello'],
  [-1, 5, '15:00', 'c-sara', 's-taglio', 'confermato', 'whatsapp'],
  [-1, 6, '09:30', 'c-anna', 's-colore-piega', 'confermato', 'whatsapp'],
  [0, 2, '09:00', 'c-maria', 's-piega', 'confermato', 'whatsapp'],
  [0, 2, '10:00', 'c-giulia', 's-colore-piega', 'confermato', 'pannello'],
  [0, 2, '15:00', 'c-francesca', 's-taglio', 'confermato', 'whatsapp'],
  [0, 3, '09:30', 'c-chiara', 's-meches', 'confermato', 'pannello'],
  [0, 3, '14:30', 'c-sara', 's-piega', 'confermato', 'whatsapp'],
  [0, 3, '16:00', 'c-elena', 's-taglio', 'in_attesa', 'whatsapp'],
  [0, 4, '09:00', 'c-laura', 's-colore', 'confermato', 'whatsapp'],
  [0, 4, '11:00', 'c-valentina', 's-piega', 'confermato', 'pannello'],
  [0, 4, '15:00', 'c-alessia', 's-trattamento', 'confermato', 'whatsapp'],
  [0, 4, '17:00', 'c-martina', 's-taglio', 'in_attesa', 'whatsapp'],
  [0, 5, '10:00', 'c-giorgia', 's-colore-piega', 'confermato', 'whatsapp'],
  [0, 5, '14:30', 'c-federica', 's-piega', 'confermato', 'pannello'],
  [0, 5, '16:00', 'c-silvia', 's-taglio', 'disdetto', 'whatsapp'],
  [0, 6, '09:00', 'c-paola', 's-piega', 'confermato', 'whatsapp'],
  [0, 6, '10:00', 'c-roberta', 's-colore', 'confermato', 'pannello'],
  [0, 6, '13:00', 'c-anna', 's-taglio', 'confermato', 'whatsapp'],
  [1, 2, '10:00', 'c-sara', 's-colore', 'confermato', 'whatsapp'],
  [1, 2, '15:00', 'c-martina', 's-trattamento', 'in_attesa', 'whatsapp'],
  [1, 3, '09:00', 'c-giulia', 's-piega', 'confermato', 'pannello'],
  [1, 4, '10:30', 'c-maria', 's-taglio', 'confermato', 'whatsapp'],
  [1, 5, '09:30', 'c-chiara', 's-colore-piega', 'confermato', 'whatsapp'],
  [1, 6, '11:00', 'c-francesca', 's-piega', 'confermato', 'pannello'],
]

/** Identifica la settimana dei dati (per rigenerarli quando cambia). */
export function chiaveSettimana(): string {
  return adesso().startOf('week').toISODate() ?? ''
}

export function creaDatiDemo(): DbDemo {
  const ora = adesso()
  const creato = versoIso(ora.minus({ days: 40 }))
  const lunedi = ora.startOf('week')
  const durate = new Map<string, number>(SERVIZI.map(([id, , durata]) => [id, durata]))

  const servizi = SERVIZI.map(([id, nome, durata_minuti, prezzo], i) => ({
    id,
    operatrice_id: ID_OPERATRICE,
    nome,
    durata_minuti,
    prezzo,
    attivo: true,
    ordine: i + 1,
    creato_il: creato,
    aggiornato_il: creato,
  }))

  const fasce: Array<[number, string, string]> = [
    [2, '09:00:00', '13:00:00'],
    [2, '14:30:00', '19:00:00'],
    [3, '09:00:00', '13:00:00'],
    [3, '14:30:00', '19:00:00'],
    [4, '09:00:00', '13:00:00'],
    [4, '14:30:00', '19:00:00'],
    [5, '09:00:00', '13:00:00'],
    [5, '14:30:00', '19:00:00'],
    [6, '09:00:00', '17:00:00'],
  ]
  const orari_settimanali = fasce.map(([giorno, ora_inizio, ora_fine], i) => ({
    id: `o-${i}`,
    operatrice_id: ID_OPERATRICE,
    giorno,
    ora_inizio,
    ora_fine,
    creato_il: creato,
    aggiornato_il: creato,
  }))

  const anno = ora.month === 12 && ora.day > 26 ? ora.year + 1 : ora.year
  const mercolediProssimo = lunedi.plus({ weeks: 1, days: 2 })
  const chiusure = [
    {
      id: 'ch-natale',
      operatrice_id: ID_OPERATRICE,
      inizio: versoIso(daDataOra(`${anno}-12-24`, '00:00')),
      fine: versoIso(daDataOra(`${anno}-12-27`, '00:00')),
      motivo: 'Ferie di Natale',
      creato_il: creato,
      aggiornato_il: creato,
    },
    {
      id: 'ch-corso',
      operatrice_id: ID_OPERATRICE,
      inizio: versoIso(mercolediProssimo.set({ hour: 14, minute: 30 })),
      fine: versoIso(mercolediProssimo.set({ hour: 19, minute: 0 })),
      motivo: 'Corso di aggiornamento colore',
      creato_il: creato,
      aggiornato_il: creato,
    },
  ]

  const clienti = CLIENTI.map(([id, nome, telefono, email, note]) => ({
    id,
    nome,
    telefono,
    email,
    note,
    creato_il: creato,
    aggiornato_il: creato,
  }))

  const appuntamenti = APPUNTAMENTI.map(([sett, giorno, oraTesto, cliente_id, servizio_id, stato, origine], i) => {
    const [h, m] = oraTesto.split(':').map(Number)
    const inizio = lunedi.plus({ weeks: sett, days: giorno - 1 }).set({ hour: h, minute: m })
    const fine = inizio.plus({ minutes: durate.get(servizio_id) ?? 30 })
    const passato = fine < ora
    return {
      id: `app-${i}`,
      operatrice_id: ID_OPERATRICE,
      cliente_id,
      servizio_id,
      inizio: versoIso(inizio),
      fine: versoIso(fine),
      // nel passato le richieste in attesa non hanno senso: risultano completate
      stato: passato && stato !== 'disdetto' ? 'completato' : stato,
      origine,
      note: null,
      motivo_rifiuto: null,
      conferma_via_template: false,
      promemoria_inviato_il: null,
      creato_il: versoIso(inizio.minus({ days: 6 })),
      aggiornato_il: versoIso(inizio.minus({ days: 6 })),
    }
  })

  return {
    operatrici: [
      {
        id: ID_OPERATRICE,
        user_id: ID_UTENTE,
        nome: 'Ilenia',
        email: EMAIL_DEMO,
        attiva: true,
        creato_il: creato,
        aggiornato_il: creato,
      },
    ],
    impostazioni: [
      {
        operatrice_id: ID_OPERATRICE,
        approvazione: 'manuale',
        ore_limite_modifica: 24,
        promemoria: 'disattivato',
        ora_promemoria: '18:00:00',
        lista_attesa_modalita: 'manuale',
        lista_attesa_minuti_risposta: 15,
        lista_attesa_preavviso_minimo_min: 120,
        preavviso_minimo_prenotazione_min: 120,
        giorni_prenotabili: 30,
        passo_slot_min: 30,
        parola_operatore: 'operatore',
        ore_pausa_operatore: 12,
        telefono_salone: '0123 456789',
        email_notifiche: null,
        creato_il: creato,
        aggiornato_il: creato,
      },
    ],
    servizi,
    orari_settimanali,
    chiusure,
    clienti,
    appuntamenti,
    // messaggi "già scambiati" nel mese, per dare senso al contatore
    contatore_base: [{ mese: ora.toUTC().toFormat('yyyy-LL'), liberi: 186, template: 2, ricevuti: 141 }],
    log_messaggi: [],
    conversazioni: [],
    lista_attesa: [],
    slot_liberati: [],
    proposte_anticipo: [],
    push_iscrizioni: [],
  }
}
