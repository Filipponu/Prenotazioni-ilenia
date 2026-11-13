#!/usr/bin/env node
/**
 * Prepara il database Supabase del salone: applica le migrazioni (solo quelle
 * nuove), chiude le iscrizioni libere e collega l'indirizzo del pannello.
 * Si può rilanciare quante volte si vuole.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_… node strumenti/messa-online/database.mjs \
 *     --progetto <riferimento o https://xxxx.supabase.co> [--app-url https://…]
 *
 * Il token si crea su supabase.com → Account → Access Tokens (si può
 * cancellare subito dopo). Usa la Management API ufficiale di Supabase.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { argomenti, chiama, Errore, info, ok, principale, RADICE, richiesto, titolo } from './comune.mjs'

const API = process.env.SUPABASE_API_URL ?? 'https://api.supabase.com'

/** "abcd…" oppure "https://abcd….supabase.co" → "abcd…" */
export function riferimento(progetto) {
  const m = /^https?:\/\/([a-z0-9]+)\.supabase\.co/i.exec(progetto)
  const ref = m ? m[1] : progetto
  if (!/^[a-z0-9]{10,40}$/i.test(ref)) throw new Errore(`Riferimento del progetto non valido: ${progetto}`)
  return ref
}

export function clienteSupabase(ref, token = process.env.SUPABASE_ACCESS_TOKEN) {
  richiesto(token, 'Manca SUPABASE_ACCESS_TOKEN (supabase.com → Account → Access Tokens)')
  const base = `${API}/v1/projects/${ref}`
  return {
    progetto: () => chiama(base, { token }),
    sql: (query) => chiama(`${base}/database/query`, { metodo: 'POST', token, corpo: { query } }),
    configuraAuth: (corpo) => chiama(`${base}/config/auth`, { metodo: 'PATCH', token, corpo }),
    chiavi: (rivela = false) => chiama(`${base}/api-keys${rivela ? '?reveal=true' : ''}`, { token }),
  }
}

/** Chiave pubblicabile e segreta (nuove sb_publishable/sb_secret, o le vecchie anon/service_role). */
export function scegliChiavi(elenco) {
  // senza «reveal» le chiavi segrete arrivano mascherate (••••): non valgono
  const intera = (k) => typeof k.api_key === 'string' && /^[A-Za-z0-9._-]+$/.test(k.api_key)
  const per = (tipo, vecchia) =>
    elenco.find((k) => k.type === tipo && intera(k)) ?? elenco.find((k) => k.type === 'legacy' && k.name === vecchia && intera(k))
  return { pubblicabile: per('publishable', 'anon')?.api_key ?? null, segreta: per('secret', 'service_role')?.api_key ?? null }
}

const MIGRAZIONI = join(RADICE, 'supabase', 'migrations')

export async function applicaMigrazioni(db) {
  // stessa tabella della CLI di Supabase: così le due strade restano compatibili
  await db.sql(`create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);`)
  const fatte = new Set((await db.sql('select version from supabase_migrations.schema_migrations')).map((r) => r.version))
  const file = readdirSync(MIGRAZIONI).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()
  let nuove = 0
  for (const f of file) {
    const [versione, ...resto] = f.replace(/\.sql$/, '').split('_')
    if (fatte.has(versione)) continue
    const sql = readFileSync(join(MIGRAZIONI, f), 'utf8')
    const nome = resto.join('_').replace(/'/g, "''")
    // più comandi in una sola richiesta = una sola transazione: o tutto o niente
    await db.sql(`${sql}\n;\ninsert into supabase_migrations.schema_migrations (version, name) values ('${versione}', '${nome}');`)
    ok(`migrazione ${f}`)
    nuove++
  }
  if (!nuove) ok('database già aggiornato')
  return nuove
}

/** Se l'utente di Ilenia è stato creato prima delle tabelle, lo collega ora come operatrice. */
export async function collegaUtenti(db) {
  const conta = async () =>
    (
      await db.sql(`select (select count(*) from auth.users)::int as utenti,
       (select count(*) from public.operatrici)::int as operatrici,
       (select count(*) from public.operatrici where attiva)::int as attive`)
    )[0]
  const prima = await conta()
  let collegata = null
  if (prima.utenti > 0 && prima.operatrici === 0) {
    await db.sql(`insert into public.operatrici (user_id, nome, email, attiva)
select id,
       coalesce(nullif(trim(raw_user_meta_data ->> 'nome'), ''), initcap(replace(split_part(coalesce(email, 'operatrice'), '@', 1), '.', ' '))),
       email, true
from auth.users
order by created_at
limit 1
on conflict (user_id) do nothing`)
    collegata = (await db.sql('select email from public.operatrici order by creato_il limit 1'))[0]?.email ?? null
  }
  return { ...(await conta()), collegata }
}

async function main() {
  const a = argomenti()
  const ref = riferimento(richiesto(a.progetto, 'Indica il progetto: --progetto <riferimento o indirizzo https://xxxx.supabase.co>'))
  const db = clienteSupabase(ref)

  titolo('Progetto')
  const p = await db.progetto()
  ok(`${p.name} (${p.region}), stato: ${p.status}`)
  if (!String(p.region).startsWith('eu-')) info('Attenzione: il server non è in Europa. Per i dati delle clienti è meglio un progetto in UE (es. Frankfurt).')
  if (p.status !== 'ACTIVE_HEALTHY') throw new Errore('Il progetto non è ancora pronto: riprova tra qualche minuto.')

  titolo('Tabelle e regole di accesso')
  await applicaMigrazioni(db)
  const u = await collegaUtenti(db)
  if (u.collegata) ok(`utente ${u.collegata} collegata come operatrice`)
  info(
    u.utenti === 0
      ? 'Nessun utente ancora: crea quello di Ilenia (Authentication → Users → Add user → Create new user, «Auto Confirm User»).'
      : `${u.utenti} utenti, ${u.attive} operatrici attive`,
  )

  titolo('Accesso al pannello')
  const appUrl = typeof a['app-url'] === 'string' ? a['app-url'].replace(/\/+$/, '') : null
  await db.configuraAuth({
    disable_signup: true,
    ...(appUrl ? { site_url: appUrl, uri_allow_list: `${appUrl}/**` } : {}),
  })
  ok('iscrizioni libere disattivate (gli utenti li crei tu dal pannello di Supabase)')
  if (appUrl) ok(`indirizzo del pannello: ${appUrl}`)

  const { pubblicabile } = scegliChiavi(await db.chiavi())
  titolo('Valori pubblici')
  info(`SUPABASE_URL=https://${ref}.supabase.co`)
  info(`SUPABASE_PUBLISHABLE_KEY=${pubblicabile ?? '(non trovata: Project Settings → API Keys)'}`)
}

if (import.meta.url === `file://${process.argv[1]}`) principale(main)
