'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@ilenia/shared/tipi-db'

/**
 * Client Supabase del browser. Usa solo la chiave pubblica: cosa si può
 * leggere/scrivere lo decidono le regole RLS nel database.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const chiave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

export const configurazioneMancante = !url || !chiave

let client: SupabaseClient<Database> | null = null

export function supabase(): SupabaseClient<Database> {
  if (configurazioneMancante) {
    throw new Error('Configurazione Supabase mancante (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)')
  }
  client ??= createClient<Database>(url, chiave, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  return client
}
