/** Variabili e segreti del Worker (wrangler.jsonc + wrangler secret). */
export interface Ambiente {
  ASSETS: Fetcher
  SUPABASE_URL: string
  /** chiave segreta di Supabase (sb_secret_… o service_role): solo qui, mai nel browser */
  SUPABASE_SECRET_KEY: string
  /** chiave pubblicabile (sb_publishable_… o anon): il Worker la passa al pannello con /api/config */
  SUPABASE_PUBLISHABLE_KEY?: string
  WHATSAPP_APP_SECRET: string
  WHATSAPP_VERIFY_TOKEN: string
  WHATSAPP_TOKEN?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_GRAPH_VERSION?: string
  WHATSAPP_MODALITA?: string
  /** operatrice servita dal numero (facoltativo: altrimenti la prima attiva) */
  BOT_OPERATRICE_ID?: string
  /** indirizzo pubblico del pannello (per i link nelle notifiche), es. https://prenotazioni-ilenia.xxx.workers.dev */
  APP_URL?: string
  /** notifiche push (vedi strumenti/genera-chiavi-vapid.mjs) */
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  /** "mailto:…" o "https://…" */
  VAPID_SUBJECT?: string
  /** email (Resend): riserva per Ilenia e promemoria alle clienti */
  RESEND_API_KEY?: string
  /** mittente; senza dominio verificato su Resend si può scrivere solo all'indirizzo del proprio account */
  RESEND_FROM?: string
}
