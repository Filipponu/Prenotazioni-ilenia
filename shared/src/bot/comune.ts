/**
 * Pezzi comuni al bot e alle azioni del pannello: accesso al database,
 * canale di invio dei messaggi e registro (log_messaggi).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '../tipi-db'
import type { MessaggioUscita } from '../whatsapp/messaggi'

export type Db = SupabaseClient<Database>

/** Dove finiscono i messaggi: API di Meta, simulatore, test. */
export interface Canale {
  invia(telefono: string, messaggio: MessaggioUscita): Promise<{ id: string | null }>
}

type Risultato = { data: unknown; error: { message: string; code?: string } | null }

/** Risultato di una query che deve restituire dati (errore altrimenti). */
export function verifica<R extends Risultato>(r: R): NonNullable<R['data']> {
  if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  if (r.data === null || r.data === undefined) throw new Error('Nessun dato restituito')
  return r.data as NonNullable<R['data']>
}

/** Risultato di .maybeSingle(): può essere null. */
export function verificaForse<R extends Risultato>(r: R): R['data'] {
  if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data
}

/** Risultato di update/insert senza dati richiesti indietro. */
export function senzaErrori(r: { error: { message: string; code?: string } | null }): void {
  if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code })
}

/** Invia un messaggio e lo registra (con il suo costo) in log_messaggi. */
export async function inviaERegistra(
  db: Db,
  canale: Canale,
  destinatario: { clienteId: string; telefono: string },
  m: MessaggioUscita,
): Promise<void> {
  const { id } = await canale.invia(destinatario.telefono, m)
  await db.from('log_messaggi').insert({
    direzione: 'out',
    cliente_id: destinatario.clienteId,
    telefono: destinatario.telefono,
    wa_message_id: id,
    tipo: m.tipo === 'testo' ? 'testo' : m.tipo === 'template' ? 'template' : 'interattivo',
    costo: m.tipo === 'template' ? 'template' : 'libero',
    template_nome: m.tipo === 'template' ? m.nome : null,
    contenuto: m as unknown as Json,
  })
}
