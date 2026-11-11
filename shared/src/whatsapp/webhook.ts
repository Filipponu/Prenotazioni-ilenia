/**
 * Lettura delle notifiche (webhook) dell'API Cloud di WhatsApp:
 * messaggi delle clienti e stati di consegna dei messaggi inviati.
 */

export type ContenutoIngresso =
  | { tipo: 'testo'; testo: string }
  /** tocco su un pulsante o su una riga di una lista (o risposta rapida di un template) */
  | { tipo: 'scelta'; id: string; titolo: string }
  /** foto, audio, posizione, adesivi…: il bot non li legge */
  | { tipo: 'altro'; descrizione: string }

export type EventoWhatsApp =
  | {
      tipo: 'messaggio'
      id: string
      da: string
      nomeProfilo: string | null
      /** secondi Unix */
      timestamp: number
      contenuto: ContenutoIngresso
    }
  | {
      tipo: 'stato'
      id: string
      stato: string
      destinatario: string
      timestamp: number
      /** dati di fatturazione inviati da Meta, se presenti */
      fatturazione: { fatturabile: boolean; categoria: string | null; tipo: string | null } | null
      errore: string | null
    }

type Qualsiasi = Record<string, unknown>
const oggetto = (v: unknown): Qualsiasi => (v && typeof v === 'object' ? (v as Qualsiasi) : {})
const lista = (v: unknown): Qualsiasi[] => (Array.isArray(v) ? v.map(oggetto) : [])
const testo = (v: unknown): string => (typeof v === 'string' ? v : '')

function contenuto(m: Qualsiasi): ContenutoIngresso {
  const tipo = testo(m.type)
  if (tipo === 'text') return { tipo: 'testo', testo: testo(oggetto(m.text).body) }
  if (tipo === 'interactive') {
    const i = oggetto(m.interactive)
    const r = oggetto(i.button_reply ?? i.list_reply)
    if (r.id) return { tipo: 'scelta', id: testo(r.id), titolo: testo(r.title) }
  }
  if (tipo === 'button') {
    // risposta rapida a un template
    const b = oggetto(m.button)
    return { tipo: 'scelta', id: testo(b.payload), titolo: testo(b.text) }
  }
  return { tipo: 'altro', descrizione: tipo || 'sconosciuto' }
}

/** Estrae gli eventi da un corpo di webhook (già controllato con la firma). */
export function leggiWebhook(corpo: unknown): EventoWhatsApp[] {
  const eventi: EventoWhatsApp[] = []
  for (const entry of lista(oggetto(corpo).entry)) {
    for (const change of lista(entry.changes)) {
      if (change.field !== 'messages') continue
      const value = oggetto(change.value)
      const nomi = new Map(lista(value.contacts).map((c) => [testo(c.wa_id), testo(oggetto(c.profile).name) || null]))
      for (const m of lista(value.messages)) {
        const da = testo(m.from)
        eventi.push({
          tipo: 'messaggio',
          id: testo(m.id),
          da,
          nomeProfilo: nomi.get(da) ?? null,
          timestamp: Number(m.timestamp) || 0,
          contenuto: contenuto(m),
        })
      }
      for (const s of lista(value.statuses)) {
        const prezzo = s.pricing ? oggetto(s.pricing) : null
        const errore = lista(s.errors)[0]
        eventi.push({
          tipo: 'stato',
          id: testo(s.id),
          stato: testo(s.status),
          destinatario: testo(s.recipient_id),
          timestamp: Number(s.timestamp) || 0,
          fatturazione: prezzo
            ? {
                fatturabile: prezzo.billable === true,
                categoria: testo(prezzo.category) || null,
                tipo: testo(prezzo.type) || null,
              }
            : null,
          errore: errore ? `${testo(errore.code) || String(errore.code ?? '')} ${testo(errore.title)}`.trim() : null,
        })
      }
    }
  }
  return eventi
}
