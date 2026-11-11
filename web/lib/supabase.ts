'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@ilenia/shared/tipi-db'
import { fetchDemo } from './demo/backend'

/**
 * Client Supabase del browser. Usa solo la chiave pubblica: cosa si può
 * leggere/scrivere lo decidono le regole RLS nel database.
 *
 * Con NEXT_PUBLIC_DEMO=1 il pannello diventa una versione dimostrativa:
 * nessun Supabase vero, i dati di esempio vivono nel browser.
 */
export const modalitaDemo = process.env.NEXT_PUBLIC_DEMO === '1'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const chiave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

export const configurazioneMancante = !modalitaDemo && (!url || !chiave)

let client: SupabaseClient<Database> | null = null

export function supabase(): SupabaseClient<Database> {
  if (configurazioneMancante) {
    throw new Error('Configurazione Supabase mancante (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)')
  }
  client ??= modalitaDemo
    ? createClient<Database>('https://demo.prenotazioni.invalid', 'chiave-demo', {
        global: { fetch: fetchDemo },
        auth: {
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: 'ilenia-demo-accesso',
        },
      })
    : createClient<Database>(url, chiave, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
  return client
}
