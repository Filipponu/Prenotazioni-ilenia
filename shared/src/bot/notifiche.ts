/**
 * Testo degli avvisi per Ilenia (avvisi a comparsa nella demo, log del
 * Worker e, dalla Fase 5, notifiche push).
 */
import type { Notifica } from './comune'

export interface TestoNotifica {
  titolo: string
  testo: string
  /** pagina del pannello da aprire */
  pagina: '/richieste/' | '/messaggi/' | '/agenda/' | '/lista-attesa/'
}

export function descriviNotifica(n: Notifica): TestoNotifica {
  switch (n.tipo) {
    case 'richiesta':
      return n.confermata
        ? { titolo: 'Nuova prenotazione', testo: `${n.cliente}: ${n.servizio}, ${n.quando}`, pagina: '/agenda/' }
        : { titolo: 'Nuova richiesta da approvare', testo: `${n.cliente}: ${n.servizio}, ${n.quando}`, pagina: '/richieste/' }
    case 'operatore':
      return { titolo: `${n.cliente} vuole parlare con te`, testo: 'Rispondi dalla pagina Messaggi.', pagina: '/messaggi/' }
    case 'messaggio':
      return { titolo: `Messaggio da ${n.cliente}`, testo: n.testo, pagina: '/messaggi/' }
    case 'disdetta':
      return { titolo: 'Appuntamento disdetto', testo: `${n.cliente}: ${n.servizio}, ${n.quando}`, pagina: '/agenda/' }
    case 'spostamento':
      return { titolo: 'Appuntamento spostato', testo: `${n.cliente}, ${n.servizio}: da ${n.da} a ${n.a}`, pagina: '/agenda/' }
    case 'anticipo_da_inviare':
      return {
        titolo: 'Si è liberato un posto',
        testo: `Proponilo a ${n.cliente} (${n.servizio}, ora ${n.attuale}): ${n.quando}`,
        pagina: '/lista-attesa/',
      }
    case 'anticipo_proposto':
      return { titolo: 'Posto proposto dal bot', testo: `${n.cliente}, ${n.servizio}: ${n.quando}`, pagina: '/lista-attesa/' }
    case 'anticipo_accettato':
      return { titolo: 'Appuntamento anticipato', testo: `${n.cliente}, ${n.servizio}: da ${n.da} a ${n.a}`, pagina: '/agenda/' }
  }
}
