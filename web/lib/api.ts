'use client'

/**
 * Azioni del pannello che scrivono alle clienti su WhatsApp.
 * - pannello vero: passano dal Worker (/api/pannello/…), che ha la chiave
 *   segreta e il token di WhatsApp; si autentica col token della sessione;
 * - demo: girano nel browser sui dati finti (i messaggi finiscono nella chat
 *   del simulatore).
 */
import { chiudiSlot, elaboraScadenze, inviaPropostaManuale, type EsitoRisposta, type MessaggioManuale } from '@ilenia/shared/bot/anticipo'
import {
  approvaRichiesta,
  disdiciDalPannello,
  ErroreAzione,
  riattivaBot,
  rifiutaRichiesta,
  rispondiCliente,
  segnaRispostaProposta,
  type ContestoAzioni,
  type EsitoInvio,
} from '@ilenia/shared/bot/azioni'
import { inviaPromemoria } from '@ilenia/shared/bot/promemoria'
import { adesso, daIso } from '@ilenia/shared/tempo'
import { BASE_API } from './configurazione'
import { modalitaDemo, supabase } from './supabase'

export type { EsitoInvio, EsitoRisposta, MessaggioManuale }

/** Errore comprensibile, con l'eventuale link wa.me per scrivere a mano. */
export class ErroreInvio extends Error {
  constructor(
    messaggio: string,
    readonly link: string | null = null,
  ) {
    super(messaggio)
  }
}


/** Evento per aggiornare i contatori del menu dopo un'azione. */
export const EVENTO_AGGIORNA_CONTATORI = 'ilenia-contatori'

function aggiornaContatori() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_AGGIORNA_CONTATORI))
}

function contestoDemo(): ContestoAzioni {
  return { db: supabase(), canale: { invia: async () => ({ id: `wamid.demo.${crypto.randomUUID()}` }) } }
}

async function chiamaApi<T = EsitoInvio>(percorso: string, corpo: unknown = {}): Promise<T> {
  const { data } = await supabase().auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new ErroreInvio('Sessione scaduta: esci e rientra.')
  let r: Response
  try {
    r = await fetch(`${BASE_API}/api/pannello${percorso}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    })
  } catch {
    throw new ErroreInvio('Connessione assente: controlla internet e riprova.')
  }
  const json = (await r.json().catch(() => ({}))) as { errore?: string; link?: string | null } & Partial<EsitoInvio>
  if (!r.ok) throw new ErroreInvio(json.errore ?? 'Operazione non riuscita.', json.link ?? null)
  return json as T
}

async function esegui<T>(demo: () => Promise<T>, reale: () => Promise<T>): Promise<T> {
  try {
    return await (modalitaDemo ? demo() : reale())
  } catch (e) {
    if (e instanceof ErroreAzione) throw new ErroreInvio(e.message, e.link ?? null)
    throw e
  } finally {
    aggiornaContatori()
  }
}

export function approva(operatriceId: string, appuntamentoId: string) {
  return esegui(
    () => approvaRichiesta(contestoDemo(), operatriceId, appuntamentoId),
    () => chiamaApi(`/richieste/${appuntamentoId}/approva`),
  )
}

export function rifiuta(operatriceId: string, appuntamentoId: string, motivo: string) {
  return esegui(
    () => rifiutaRichiesta(contestoDemo(), operatriceId, appuntamentoId, motivo),
    () => chiamaApi(`/richieste/${appuntamentoId}/rifiuta`, { motivo }),
  )
}

export function rispondi(clienteId: string, testo: string) {
  return esegui(
    () => rispondiCliente(contestoDemo(), clienteId, testo),
    () => chiamaApi(`/clienti/${clienteId}/messaggio`, { testo }),
  )
}

// --- lista d'attesa
/** Proposta manuale: Ilenia la sta inviando dal suo telefono (parte il tempo per rispondere). */
export function segnaPropostaInviata(operatriceId: string, propostaId: string) {
  return esegui<MessaggioManuale | null>(
    () => inviaPropostaManuale(contestoDemo(), operatriceId, propostaId),
    () => chiamaApi<MessaggioManuale>(`/proposte/${propostaId}/inviata`),
  )
}

/** Ilenia segna la risposta della cliente a una proposta manuale. */
export function rispostaProposta(operatriceId: string, propostaId: string, accettata: boolean) {
  return esegui<EsitoRisposta>(
    () => segnaRispostaProposta(contestoDemo(), operatriceId, propostaId, accettata),
    () => chiamaApi<EsitoRisposta>(`/proposte/${propostaId}/risposta`, { accettata }),
  )
}

/** Stop alle proposte per un posto (es. Ilenia l'ha riempito lei). */
export function chiudiPosto(operatriceId: string, slotId: string) {
  return esegui<unknown>(
    () => chiudiSlot(contestoDemo(), operatriceId, slotId),
    () => chiamaApi(`/slot/${slotId}/chiudi`),
  )
}

/** Disdetta dall'agenda; se proponi, il posto va alla lista d'attesa. */
export function disdici(operatriceId: string, appuntamentoId: string, proponi: boolean) {
  return esegui<{ proposto: boolean }>(
    () => disdiciDalPannello(contestoDemo(), operatriceId, appuntamentoId, proponi),
    () => chiamaApi<{ proposto: boolean }>(`/appuntamenti/${appuntamentoId}/disdici`, { proponi }),
  )
}

/** Notifica di prova su tutti i dispositivi dell'operatrice; restituisce quanti l'hanno ricevuta. */
export async function provaNotifica(): Promise<number> {
  const { arrivate } = await chiamaApi<{ arrivate: number }>('/push/prova')
  return arrivate
}

/**
 * Solo demo: manda subito i promemoria del primo giorno (da domani) che ha
 * appuntamenti confermati ancora senza promemoria. Nel sito vero li manda il
 * Worker ogni sera all'orario impostato.
 */
export async function promemoriaDemo(): Promise<{ inviati: number; saltati: number; giorno: string | null }> {
  const sb = supabase()
  const { data } = await sb
    .from('appuntamenti')
    .select('inizio')
    .eq('stato', 'confermato')
    .is('promemoria_inviato_il', null)
    .gte('inizio', adesso().plus({ days: 1 }).startOf('day').toISO()!)
    .order('inizio')
    .limit(1)
  const primo = data?.[0]
  if (!primo) return { inviati: 0, saltati: 0, giorno: null }
  const giorno = daIso(primo.inizio).startOf('day')
  const esito = await inviaPromemoria({ ...contestoDemo(), email: async () => undefined }, { forza: true, giorno })
  aggiornaContatori()
  return { ...esito, giorno: giorno.toISO() }
}

/** Solo demo: le scadenze che nel sito vero gestisce il Worker ogni minuto. */
export async function scadenzeDemo() {
  if (!modalitaDemo) return
  const n = await elaboraScadenze(contestoDemo())
  if (n > 0) aggiornaContatori()
}

/** Il bot torna a rispondere a questa cliente (basta il database, nessun messaggio). */
export async function riattiva(clienteId: string) {
  await riattivaBot(supabase(), clienteId)
  aggiornaContatori()
}

/** Frase per l'avviso dopo un'azione. */
export function descriviEsito(azione: 'approvata' | 'rifiutata', esito: EsitoInvio): string {
  const titolo = azione === 'approvata' ? 'Richiesta approvata' : 'Richiesta rifiutata'
  if (esito.inviato === 'libero') return `${titolo}: la cliente è stata avvisata su WhatsApp.`
  if (esito.inviato === 'template') return `${titolo}: avviso inviato con template WhatsApp (a pagamento).`
  if (esito.motivo === 'senza_telefono') return `${titolo}. La cliente non ha un numero WhatsApp: avvisala tu.`
  return `${titolo}.`
}
