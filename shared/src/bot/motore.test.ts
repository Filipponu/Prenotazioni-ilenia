import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import { datiDemo, fetchDemo, impostaRitardoDemo, usaDatiDemo } from '../demo/backend'
import type { DbDemo } from '../demo/dati'
import { daDataOra } from '../tempo'
import type { Database } from '../tipi-db'
import type { MessaggioUscita } from '../whatsapp/messaggi'
import type { ContenutoIngresso } from '../whatsapp/webhook'
import { gestisciEvento, pulisciNome, type ContestoBot, type Notifica } from './motore'

const OP = 'op-ilenia'
const MARIA = '393331234567'
const GIULIA = '393479876543'

function datiDiProva(approvazione: 'manuale' | 'automatica' = 'manuale'): DbDemo {
  const t = '2026-11-01T10:00:00+01:00'
  return {
    operatrici: [{ id: OP, user_id: 'u1', nome: 'Ilenia', email: null, attiva: true, creato_il: t, aggiornato_il: t }],
    impostazioni: [
      {
        operatrice_id: OP,
        approvazione,
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
        creato_il: t,
        aggiornato_il: t,
      },
    ],
    servizi: [
      { id: 'piega', operatrice_id: OP, nome: 'Piega', durata_minuti: 45, prezzo: 25, attivo: true, ordine: 1 },
      { id: 'colore', operatrice_id: OP, nome: 'Colore', durata_minuti: 90, prezzo: null, attivo: true, ordine: 2 },
      { id: 'vecchio', operatrice_id: OP, nome: 'Permanente', durata_minuti: 60, prezzo: null, attivo: false, ordine: 3 },
    ],
    orari_settimanali: [
      { id: 'o1', operatrice_id: OP, giorno: 2, ora_inizio: '09:00:00', ora_fine: '13:00:00' },
      { id: 'o2', operatrice_id: OP, giorno: 2, ora_inizio: '14:30:00', ora_fine: '19:00:00' },
      { id: 'o3', operatrice_id: OP, giorno: 4, ora_inizio: '09:00:00', ora_fine: '12:00:00' },
    ],
    chiusure: [],
    clienti: [{ id: 'c-giulia', nome: 'Giulia Verdi', telefono: GIULIA, email: null, note: null }],
    appuntamenti: [],
    conversazioni: [],
    lista_attesa: [],
    proposte_anticipo: [],
    slot_liberati: [],
    log_messaggi: [],
    contatore_base: [],
  }
}

// lunedì 16 novembre 2026, 8:00 (martedì è il primo giorno aperto)
let ora = daDataOra('2026-11-16', '08:00')
let inviati: Array<{ a: string; m: MessaggioUscita }> = []
let notifiche: Notifica[] = []
let progressivo = 0

const db = createClient<Database>('https://demo.invalid', 'chiave', {
  global: { fetch: fetchDemo },
  auth: { persistSession: false, autoRefreshToken: false },
})

const ctx: ContestoBot = {
  db,
  adesso: () => ora,
  canale: {
    async invia(a, m) {
      inviati.push({ a, m })
      return { id: `wamid.out.${inviati.length}` }
    },
  },
  notifica: (n) => {
    notifiche.push(n)
  },
}

async function ricevi(da: string, contenuto: ContenutoIngresso, id = `wamid.in.${++progressivo}`) {
  const prima = inviati.length
  await gestisciEvento(ctx, {
    tipo: 'messaggio',
    id,
    da,
    nomeProfilo: null,
    timestamp: Math.floor(ora.toSeconds()),
    contenuto,
  })
  return inviati.slice(prima).map((x) => x.m)
}
const scrivi = (da: string, testo: string) => ricevi(da, { tipo: 'testo', testo })
const tocca = (da: string, id: string) => ricevi(da, { tipo: 'scelta', id, titolo: id })

function ultimo<T extends MessaggioUscita['tipo']>(ms: MessaggioUscita[], tipo: T): Extract<MessaggioUscita, { tipo: T }> {
  const m = ms.at(-1)
  expect(m?.tipo).toBe(tipo)
  return m as Extract<MessaggioUscita, { tipo: T }>
}

beforeEach(() => {
  impostaRitardoDemo(0)
  usaDatiDemo(datiDiProva())
  ora = daDataOra('2026-11-16', '08:00')
  inviati = []
  notifiche = []
})

describe('prenotazione completa (approvazione manuale)', () => {
  it('dal saluto alla lista d\'attesa', async () => {
    // 1. saluto → menu
    let r = await scrivi(MARIA, 'ciao Ilenia')
    const menu = ultimo(r, 'pulsanti')
    expect(menu.testo).toBe("Ciao! Sono l'assistente di Ilenia, cosa vuoi fare?")
    expect(menu.pulsanti.map((p) => p.titolo)).toEqual(['Prenota', 'Sposta', 'Disdici'])
    expect(menu.piede).toBe('Scrivi «operatore» per parlare con Ilenia')

    // 2. Prenota → servizi attivi
    r = await tocca(MARIA, 'menu:prenota')
    const servizi = ultimo(r, 'lista')
    expect(servizi.righe.map((x) => [x.titolo, x.descrizione])).toEqual([
      ['Piega', '45 min · 25 €'],
      ['Colore', '1 h 30 min'],
    ])

    // 3. Piega → giorni liberi
    r = await tocca(MARIA, 'srv:piega')
    const giorni = ultimo(r, 'lista')
    expect(giorni.testo).toBe('Piega (45 min). Scegli il giorno:')
    expect(giorni.righe[0]).toEqual({ id: 'giorno:2026-11-17', titolo: 'Mar 17 novembre', descrizione: '15 orari liberi' })
    // 30 giorni prenotabili = esattamente 9 martedì/giovedì: nessun «Altri giorni»
    expect(giorni.righe).toHaveLength(9)
    expect(giorni.righe.at(-1)?.id).toBe('giorno:2026-12-15')

    // 4. martedì → orari (8 + «Altri orari» + «Cambia giorno»)
    r = await tocca(MARIA, 'giorno:2026-11-17')
    const ore = ultimo(r, 'lista')
    expect(ore.testo).toBe('Orari liberi martedì 17 novembre:')
    expect(ore.righe).toHaveLength(10)
    expect(ore.righe[0]).toMatchObject({ titolo: '09:00', descrizione: 'fino alle 09:45' })
    expect(ore.righe.slice(-2).map((x) => x.titolo)).toEqual(['Altri orari ›', '‹ Cambia giorno'])

    r = await tocca(MARIA, 'ore-pag:1')
    expect(ultimo(r, 'lista').righe.map((x) => x.titolo)).toEqual([
      '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '‹ Cambia giorno',
    ])

    // 5. orario → cliente nuova: chiede il nome
    r = await tocca(MARIA, 'ora:2026-11-17T10:30:00+01:00')
    expect(ultimo(r, 'testo').testo).toBe('Come ti chiami? Scrivi nome e cognome.')

    // 6. nome → riepilogo
    r = await scrivi(MARIA, 'maria rossi')
    const riepilogo = ultimo(r, 'pulsanti')
    expect(riepilogo.testo).toContain('Servizio: Piega (45 min)')
    expect(riepilogo.testo).toContain('Quando: martedì 17 novembre alle 10:30')
    expect(riepilogo.testo).toContain('Nome: Maria Rossi')
    expect(riepilogo.pulsanti.map((p) => p.titolo)).toEqual(['Conferma', 'Cambia orario', 'Annulla'])

    // 7. conferma → richiesta in attesa + domanda lista d'attesa
    r = await tocca(MARIA, 'conferma:si')
    expect(r).toHaveLength(2)
    expect((r[0] as { testo: string }).testo).toBe(
      'Richiesta ricevuta, Ilenia ti confermerà a breve.\n\nPiega, martedì 17 novembre alle 10:30.',
    )
    expect(ultimo(r, 'pulsanti').testo).toBe('Se si libera un posto prima, vuoi essere avvisata?')
    const [app] = datiDemo().appuntamenti!
    expect(app).toMatchObject({
      stato: 'in_attesa',
      origine: 'whatsapp',
      servizio_id: 'piega',
      inizio: '2026-11-17T10:30:00+01:00',
      fine: '2026-11-17T11:15:00+01:00',
    })
    expect(notifiche).toEqual([
      expect.objectContaining({ tipo: 'richiesta', confermata: false, cliente: 'Maria Rossi', servizio: 'Piega' }),
    ])

    // 8. sì → lista d'attesa
    r = await tocca(MARIA, 'anticipo:si')
    expect(ultimo(r, 'testo').testo).toBe('Perfetto! Se si libera un posto prima ti scrivo io.')
    expect(datiDemo().lista_attesa).toEqual([expect.objectContaining({ appuntamento_id: app!.id, attiva: true })])

    // registro: tutte risposte libere (nessun template), messaggi ricevuti tracciati
    const log = datiDemo().log_messaggi!
    expect(log.filter((l) => l.direzione === 'in')).toHaveLength(9)
    expect(log.filter((l) => l.direzione === 'out').every((l) => l.costo === 'libero')).toBe(true)
    // la finestra di 24 ore è aperta
    expect(datiDemo().conversazioni![0]!.ultimo_messaggio_cliente_il).toBe('2026-11-16T08:00:00+01:00')
  })

  it('il nuovo appuntamento non è più proposto ad altre clienti', async () => {
    await scrivi(MARIA, 'ciao')
    await tocca(MARIA, 'srv:piega')
    await tocca(MARIA, 'ora:2026-11-17T10:30:00+01:00')
    await scrivi(MARIA, 'Maria Rossi')
    await tocca(MARIA, 'conferma:si')

    await scrivi(GIULIA, 'buongiorno')
    await tocca(GIULIA, 'srv:piega')
    const r = await tocca(GIULIA, 'giorno:2026-11-17')
    const titoli = ultimo(r, 'lista').righe.map((x) => x.titolo)
    expect(titoli).not.toContain('10:00') // 10:00–10:45 si sovrappone a 10:30
    expect(titoli).not.toContain('10:30')
    expect(titoli).toContain('11:30')
  })
})

describe('casi particolari', () => {
  it('approvazione automatica: conferma subito', async () => {
    usaDatiDemo(datiDiProva('automatica'))
    await scrivi(GIULIA, 'ciao')
    await tocca(GIULIA, 'srv:colore')
    const r = await tocca(GIULIA, 'ora:2026-11-19T09:30:00+01:00')
    expect(ultimo(r, 'pulsanti').testo).toContain('Nome: Giulia Verdi') // cliente già nota: niente domanda sul nome
    const c = await tocca(GIULIA, 'conferma:si')
    expect((c[0] as { testo: string }).testo).toBe('Prenotazione confermata! Ti aspettiamo giovedì 19 novembre alle 09:30 per Colore.')
    expect(datiDemo().appuntamenti![0]!.stato).toBe('confermato')
  })

  it('paginazione dei giorni con 60 giorni prenotabili', async () => {
    const d = datiDiProva()
    d.impostazioni![0]!.giorni_prenotabili = 60
    usaDatiDemo(d)
    let r = await tocca(MARIA, 'srv:piega')
    const pagina1 = ultimo(r, 'lista')
    expect(pagina1.righe).toHaveLength(10)
    expect(pagina1.righe.at(-1)).toEqual({ id: 'giorni-da:2026-12-16', titolo: 'Altri giorni ›' })
    r = await tocca(MARIA, 'giorni-da:2026-12-16')
    expect(ultimo(r, 'lista').righe[0]?.id).toBe('giorno:2026-12-17')
  })

  it('la cliente già nota viene salutata per nome', async () => {
    const r = await scrivi(GIULIA, 'ciao')
    expect(ultimo(r, 'pulsanti').testo).toBe("Ciao Giulia! Sono l'assistente di Ilenia, cosa vuoi fare?")
  })

  it('orario preso da un\'altra cliente prima della conferma', async () => {
    await tocca(MARIA, 'srv:piega')
    await tocca(MARIA, 'ora:2026-11-17T10:30:00+01:00')
    await scrivi(MARIA, 'Maria Rossi')

    // nel frattempo Giulia prenota lo stesso orario
    await tocca(GIULIA, 'srv:piega')
    await tocca(GIULIA, 'ora:2026-11-17T10:30:00+01:00')
    await tocca(GIULIA, 'conferma:si')

    const r = await tocca(MARIA, 'conferma:si')
    const lista = ultimo(r, 'lista')
    expect(lista.testo).toContain("Mi dispiace, quell'orario è appena stato preso.")
    expect(datiDemo().appuntamenti).toHaveLength(1)
  })

  it('messaggio ripetuto da Meta: elaborato una volta sola', async () => {
    await ricevi(MARIA, { tipo: 'testo', testo: 'ciao' }, 'wamid.doppio')
    const r = await ricevi(MARIA, { tipo: 'testo', testo: 'ciao' }, 'wamid.doppio')
    expect(r).toEqual([])
  })

  it('testo non capito o vocale: torna il menu', async () => {
    let r = await scrivi(MARIA, 'boh?')
    expect(ultimo(r, 'pulsanti').testo).toContain('cosa vuoi fare?')
    r = await ricevi(MARIA, { tipo: 'altro', descrizione: 'audio' })
    expect(ultimo(r, 'pulsanti').testo).toMatch(/^Posso leggere solo i messaggi scritti/)
  })

  it('«prenota» scritto a mano avvia la prenotazione', async () => {
    const r = await scrivi(MARIA, 'Vorrei prenotare una piega')
    expect(ultimo(r, 'lista').testo).toBe('Quale servizio vuoi prenotare?')
  })

  it('operatore: avvisa Ilenia e il bot tace', async () => {
    let r = await scrivi(MARIA, 'Posso parlare con un OPERATORE?')
    expect(ultimo(r, 'testo').testo).toBe('Ok, ho avvisato Ilenia: ti risponderà lei appena possibile.')
    expect(notifiche.at(-1)).toMatchObject({ tipo: 'operatore', telefono: MARIA })

    r = await scrivi(MARIA, 'grazie, aspetto')
    expect(r).toEqual([])
    expect(notifiche.at(-1)).toMatchObject({ tipo: 'messaggio', testo: 'grazie, aspetto' })

    // dopo 12 ore il bot riprende
    ora = ora.plus({ hours: 13 })
    r = await scrivi(MARIA, 'ciao')
    expect(ultimo(r, 'pulsanti').testo).toContain('cosa vuoi fare?')
  })

  it('conversazione lasciata a metà per più di 30 minuti: si riparte dal menu', async () => {
    await tocca(MARIA, 'srv:piega')
    await tocca(MARIA, 'ora:2026-11-17T10:30:00+01:00')
    await scrivi(MARIA, 'Maria Rossi')
    ora = ora.plus({ minutes: 45 })
    const r = await tocca(MARIA, 'conferma:si')
    expect(ultimo(r, 'pulsanti').testo).toContain('cosa vuoi fare?')
    expect(datiDemo().appuntamenti).toHaveLength(0)
  })

  it('nome non valido: lo richiede', async () => {
    await tocca(MARIA, 'srv:piega')
    await tocca(MARIA, 'ora:2026-11-17T10:30:00+01:00')
    const r = await scrivi(MARIA, '12345')
    expect(ultimo(r, 'testo').testo).toContain('Non ho capito il nome')
  })

  it('servizio disattivato nel frattempo', async () => {
    const r = await tocca(MARIA, 'srv:vecchio')
    expect(ultimo(r, 'lista').testo).toBe('Quel servizio non è più prenotabile. Scegline un altro:')
  })

  it('nessun servizio prenotabile', async () => {
    const d = datiDiProva()
    d.servizi = []
    usaDatiDemo(d)
    const r = await tocca(MARIA, 'menu:prenota')
    expect(ultimo(r, 'testo').testo).toBe('Al momento non è possibile prenotare da qui. Puoi chiamare il salone al 0123 456789.')
  })

  it('annulla dal riepilogo: nessun appuntamento', async () => {
    await tocca(GIULIA, 'srv:piega')
    await tocca(GIULIA, 'ora:2026-11-17T10:30:00+01:00')
    const r = await tocca(GIULIA, 'conferma:annulla')
    expect(ultimo(r, 'testo').testo).toContain('non ho prenotato nulla')
    expect(datiDemo().appuntamenti).toHaveLength(0)
  })

  it('sposta e disdici: per ora rimandano a Ilenia (Fase 3)', async () => {
    const r = await tocca(MARIA, 'menu:disdici')
    expect(ultimo(r, 'testo').testo).toBe('Per disdire un appuntamento, per ora scrivi «operatore» e ti risponde Ilenia.')
  })

  it('stato di consegna: aggiornato nel registro', async () => {
    await scrivi(MARIA, 'ciao')
    await gestisciEvento(ctx, { tipo: 'stato', id: 'wamid.out.1', stato: 'read', destinatario: MARIA, timestamp: 0, fatturazione: null, errore: null })
    expect(datiDemo().log_messaggi!.find((l) => l.wa_message_id === 'wamid.out.1')?.stato_consegna).toBe('read')
  })
})

describe('pulisciNome', () => {
  it.each([
    ['maria rossi', 'Maria Rossi'],
    ['  MARIA   ROSSI ', 'Maria Rossi'],
    ["anna d'amico", "Anna D'Amico"],
    ['Maria De Luca', 'Maria De Luca'],
  ])('%j → %j', (dentro, fuori) => {
    expect(pulisciNome(dentro)).toBe(fuori)
  })
  it.each(['', '1', '12345', 'a', 'ciao!!!'])('rifiuta %j', (x) => {
    expect(pulisciNome(x)).toBeNull()
  })
})
