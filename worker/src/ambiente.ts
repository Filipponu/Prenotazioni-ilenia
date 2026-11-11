/** Variabili e segreti del Worker (wrangler.jsonc + wrangler secret). */
export interface Ambiente {
  ASSETS: Fetcher
  SUPABASE_URL: string
  /** chiave segreta di Supabase (sb_secret_… o service_role): solo qui, mai nel browser */
  SUPABASE_SECRET_KEY: string
  WHATSAPP_APP_SECRET: string
  WHATSAPP_VERIFY_TOKEN: string
  WHATSAPP_TOKEN?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_GRAPH_VERSION?: string
  WHATSAPP_MODALITA?: string
  /** operatrice servita dal numero (facoltativo: altrimenti la prima attiva) */
  BOT_OPERATRICE_ID?: string
}
