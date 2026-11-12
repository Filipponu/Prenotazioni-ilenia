'use client'

/**
 * Azioni del pannello che scrivono alle clienti su WhatsApp.
 * - pannello vero: passano dal Worker (/api/pannello/…), che ha la chiave
 *   segreta e il token di WhatsApp; si autentica col token della sessione;
 * - demo: girano nel browser sui dati finti (i messaggi finiscono nella chat
 *   del simulatore).
 */
import {
  approvaRichiesta,
  ErroreAzione,
  riattivaBot,
  rifiutaRichiesta,
  rispondiCliente,
  type ContestoAzioni,
  type EsitoInvio,
} from '@ilenia/shared/bot/azioni'
import { modalitaDemo, supabase } from './supabase'

export type { EsitoInvio }

/** Errore comprensibile, con l'eventuale link wa.me per scrivere a mano. */
export class ErroreInvio extends Error {
  constructor(
    messaggio: string,
    readonly link: string | null = null,
  ) {
    super(messaggio)
  }
}

/** Indirizzo del Worker: vuoto = stesso sito (il Worker serve anche il pannello). */
const BASE_API = process.env.NEXT_PUBLIC_API_URL ?? ''

/** Evento per aggiornare i contatori del menu dopo un'azione. */
export const EVENTO_AGGIORNA_CONTATORI = 'ilenia-contatori'

function aggiornaContatori() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_AGGIORNA_CONTATORI))
}

function contestoDemo(): ContestoAzioni {
  return { db: supabase(), canale: { invia: async () => ({ id: `wamid.demo.${crypto.randomUUID()}` }) } }
}

async function chiamaApi(percorso: string, corpo: unknown = {}): Promise<EsitoInvio> {
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
  return json as EsitoInvio
}

async function esegui(demo: () => Promise<EsitoInvio>, reale: () => Promise<EsitoInvio>): Promise<EsitoInvio> {
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
