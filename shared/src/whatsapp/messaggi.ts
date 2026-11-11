/**
 * Messaggi in uscita, in forma neutra, e loro conversione nel formato
 * dell'API Cloud di WhatsApp (Meta), rispettando i limiti di lunghezza.
 */

export interface Pulsante {
  id: string
  titolo: string
}

export interface RigaLista {
  id: string
  titolo: string
  descrizione?: string
}

export type MessaggioUscita =
  | { tipo: 'testo'; testo: string }
  | { tipo: 'pulsanti'; testo: string; pulsanti: Pulsante[]; piede?: string }
  | { tipo: 'lista'; testo: string; pulsante: string; righe: RigaLista[]; titoloSezione?: string; piede?: string }
  | {
      tipo: 'template'
      nome: string
      lingua: string
      parametri: string[]
      /** payload dei pulsanti di risposta rapida del template, nell'ordine */
      risposte?: string[]
      /** testo equivalente, per il registro e il pannello */
      anteprima: string
    }

/** Limiti dell'API Cloud per i messaggi interattivi. */
export const LIMITI = {
  testo: 4096,
  corpoInterattivo: 1024,
  pulsanti: 3,
  titoloPulsante: 20,
  righe: 10,
  titoloRiga: 24,
  descrizioneRiga: 72,
  etichettaLista: 20,
  titoloSezione: 24,
  piede: 60,
  id: 200,
} as const

/** Accorcia a n caratteri (contando le emoji come un carattere) aggiungendo "…". */
export function tronca(testo: string, n: number): string {
  const caratteri = Array.from(testo)
  return caratteri.length <= n ? testo : `${caratteri.slice(0, n - 1).join('').trimEnd()}…`
}

/** Testo leggibile di un messaggio (per registro, simulatore e pannello). */
export function testoDi(m: MessaggioUscita): string {
  switch (m.tipo) {
    case 'testo':
      return m.testo
    case 'pulsanti':
      return `${m.testo}\n[${m.pulsanti.map((p) => p.titolo).join('] [')}]`
    case 'lista':
      return `${m.testo}\n(${m.pulsante}: ${m.righe.map((r) => r.titolo).join(', ')})`
    case 'template':
      return m.anteprima
  }
}

type CorpoMeta = Record<string, unknown>

/** Corpo della richiesta POST /{phone-number-id}/messages. */
export function versoMeta(destinatario: string, m: MessaggioUscita): CorpoMeta {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: destinatario }
  switch (m.tipo) {
    case 'testo':
      return { ...base, type: 'text', text: { body: tronca(m.testo, LIMITI.testo), preview_url: false } }
    case 'pulsanti':
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: tronca(m.testo, LIMITI.corpoInterattivo) },
          ...(m.piede ? { footer: { text: tronca(m.piede, LIMITI.piede) } } : {}),
          action: {
            buttons: m.pulsanti.slice(0, LIMITI.pulsanti).map((p) => ({
              type: 'reply',
              reply: { id: p.id.slice(0, LIMITI.id), title: tronca(p.titolo, LIMITI.titoloPulsante) },
            })),
          },
        },
      }
    case 'lista':
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: tronca(m.testo, LIMITI.corpoInterattivo) },
          ...(m.piede ? { footer: { text: tronca(m.piede, LIMITI.piede) } } : {}),
          action: {
            button: tronca(m.pulsante, LIMITI.etichettaLista),
            sections: [
              {
                ...(m.titoloSezione ? { title: tronca(m.titoloSezione, LIMITI.titoloSezione) } : {}),
                rows: m.righe.slice(0, LIMITI.righe).map((r) => ({
                  id: r.id.slice(0, LIMITI.id),
                  title: tronca(r.titolo, LIMITI.titoloRiga),
                  ...(r.descrizione ? { description: tronca(r.descrizione, LIMITI.descrizioneRiga) } : {}),
                })),
              },
            ],
          },
        },
      }
    case 'template':
      return {
        ...base,
        type: 'template',
        template: {
          name: m.nome,
          language: { code: m.lingua },
          components: [
            ...(m.parametri.length
              ? [{ type: 'body', parameters: m.parametri.map((t) => ({ type: 'text', text: t })) }]
              : []),
            ...(m.risposte ?? []).map((payload, i) => ({
              type: 'button',
              sub_type: 'quick_reply',
              index: String(i),
              parameters: [{ type: 'payload', payload }],
            })),
          ],
        },
      }
  }
}

/** Corpo per segnare un messaggio ricevuto come letto (spunte blu). */
export function lettoVersoMeta(idMessaggio: string): CorpoMeta {
  return { messaging_product: 'whatsapp', status: 'read', message_id: idMessaggio }
}
