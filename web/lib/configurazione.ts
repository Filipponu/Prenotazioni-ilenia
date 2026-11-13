'use client'

/**
 * Configurazione pubblica del pannello: indirizzo di Supabase, chiave
 * pubblicabile, chiave pubblica delle notifiche push.
 *
 * - Sito vero: il pannello la chiede al Worker (GET /api/config), che la
 *   legge dalle sue variabili d'ambiente su Cloudflare. Così i file del
 *   pannello non contengono nessuna chiave e si cambia tutto da un posto solo.
 * - Sviluppo: se ci sono le variabili NEXT_PUBLIC_… (web/.env.local), vincono loro.
 * - Senza rete: l'ultima configurazione ricevuta, salvata nel browser.
 */

export const modalitaDemo = process.env.NEXT_PUBLIC_DEMO === '1'

/** Indirizzo del Worker: vuoto = stesso sito (il Worker serve anche il pannello). */
export const BASE_API = process.env.NEXT_PUBLIC_API_URL ?? ''

export interface Configurazione {
  supabaseUrl: string
  supabaseChiave: string
  /** vuota = notifiche push non configurate */
  chiaveVapid: string
}

const DA_COMPILAZIONE: Configurazione = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseChiave: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  chiaveVapid: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
}
const CHIAVE_MEMORIA = 'ilenia-configurazione'

let attuale: Configurazione | null = modalitaDemo
  ? { supabaseUrl: 'https://demo.prenotazioni.invalid', supabaseChiave: 'chiave-demo', chiaveVapid: '' }
  : DA_COMPILAZIONE.supabaseUrl && DA_COMPILAZIONE.supabaseChiave
    ? DA_COMPILAZIONE
    : null
let inCorso: Promise<Configurazione | null> | null = null

const valida = (c: Partial<Configurazione> | null | undefined): c is Configurazione =>
  Boolean(c && typeof c.supabaseUrl === 'string' && c.supabaseUrl && typeof c.supabaseChiave === 'string' && c.supabaseChiave)

async function scarica(): Promise<Configurazione | null> {
  try {
    const r = await fetch(`${BASE_API}/api/config`, { cache: 'no-store' })
    const c = (await r.json()) as Partial<Configurazione>
    if (r.ok && valida(c)) {
      const pulita = { supabaseUrl: c.supabaseUrl, supabaseChiave: c.supabaseChiave, chiaveVapid: c.chiaveVapid ?? '' }
      try {
        localStorage.setItem(CHIAVE_MEMORIA, JSON.stringify(pulita))
      } catch {}
      return pulita
    }
    return null
  } catch {
    // senza rete: l'ultima ricevuta
    try {
      const salvata = JSON.parse(localStorage.getItem(CHIAVE_MEMORIA) ?? 'null') as Partial<Configurazione> | null
      return valida(salvata) ? { ...salvata, chiaveVapid: salvata.chiaveVapid ?? '' } : null
    } catch {
      return null
    }
  }
}

/** Carica la configurazione (una volta sola); null se manca. */
export function caricaConfigurazione(): Promise<Configurazione | null> {
  if (attuale) return Promise.resolve(attuale)
  inCorso ??= scarica().then((c) => {
    attuale = c
    inCorso = null
    return c
  })
  return inCorso
}

/** Configurazione già caricata (da usare dopo caricaConfigurazione). */
export function configurazione(): Configurazione {
  if (!attuale) throw new Error('Configurazione non ancora caricata o mancante (vedi /api/config del Worker)')
  return attuale
}
