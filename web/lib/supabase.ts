'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@ilenia/shared/tipi-db'
import { fetchDemo } from '@ilenia/shared/demo/backend'
import { configurazione, modalitaDemo } from './configurazione'

/**
 * Client Supabase del browser. Usa solo la chiave pubblica: cosa si può
 * leggere/scrivere lo decidono le regole RLS nel database.
 *
 * Con NEXT_PUBLIC_DEMO=1 il pannello diventa una versione dimostrativa:
 * nessun Supabase vero, i dati di esempio vivono nel browser.
 * Indirizzo e chiave arrivano da lib/configurazione.ts.
 */
export { modalitaDemo }

let client: SupabaseClient<Database> | null = null

export function supabase(): SupabaseClient<Database> {
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
    : createClient<Database>(configurazione().supabaseUrl, configurazione().supabaseChiave, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
  return client
}
