#!/usr/bin/env node
/**
 * Mette online pannello e Worker su Cloudflare e imposta le variabili del
 * Worker che si possono ricavare da sole. Si può rilanciare a ogni modifica.
 *
 *   CLOUDFLARE_API_TOKEN=… SUPABASE_ACCESS_TOKEN=… \
 *   node strumenti/messa-online/pubblica.mjs --progetto <rif. Supabase> --email <tua email> [--app-url https://…] [--prova]
 *
 * Cosa fa:
 *  1. compila il pannello (senza chiavi dentro: le legge dal Worker);
 *  2. pubblica il Worker (wrangler deploy) con i file del pannello;
 *  3. imposta sul Worker, come segreti:
 *     - SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY (letti da Supabase);
 *     - APP_URL (indirizzo appena pubblicato);
 *     - VAPID_* per le notifiche (generate solo la prima volta: rigenerarle
 *       costringerebbe a riattivare le notifiche su ogni dispositivo);
 *     - WHATSAPP_VERIFY_TOKEN (generato la prima volta: va copiato su Meta);
 *  4. controlla che il sito risponda.
 * I valori segreti non vengono mai stampati, tranne il verify token di Meta.
 *
 * Restano da inserire a mano (Cloudflare → Workers → prenotazioni-ilenia →
 * Settings → Variables and Secrets): WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
 * WHATSAPP_APP_SECRET ed eventualmente RESEND_API_KEY, RESEND_FROM.
 */
import { spawnSync } from 'node:child_process'
import { randomBytes, webcrypto } from 'node:crypto'
import { join } from 'node:path'
import { argomenti, chiama, Errore, info, ok, principale, RADICE, richiesto, titolo } from './comune.mjs'
import { clienteSupabase, riferimento, scegliChiavi } from './database.mjs'

const WORKER = join(RADICE, 'worker')
const ambienteComandi = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' }

/** Esegue un comando; restituisce l'output (standard + errori; solo standard con `soloStdout`). */
function esegui(comando, argomenti, { cartella = RADICE, ingresso, soloStdout = false, env = ambienteComandi } = {}) {
  const r = spawnSync(comando, argomenti, { cwd: cartella, input: ingresso, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const uscita = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (r.status !== 0) {
    process.stdout.write(uscita.slice(-4000))
    throw new Errore(`Comando non riuscito: ${comando} ${argomenti.join(' ')}`)
  }
  return soloStdout ? (r.stdout ?? '') : uscita
}

export async function nuoveChiaviVapid() {
  const b64 = (b) => Buffer.from(b).toString('base64url')
  const coppia = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  return {
    VAPID_PUBLIC_KEY: b64(await webcrypto.subtle.exportKey('raw', coppia.publicKey)),
    VAPID_PRIVATE_KEY: (await webcrypto.subtle.exportKey('jwk', coppia.privateKey)).d,
  }
}

/** Indirizzo workers.dev stampato da wrangler deploy. */
export function indirizzoPubblicato(uscita) {
  return /https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i.exec(uscita)?.[0] ?? null
}

/** Segreti da impostare, dati quelli già presenti sul Worker. */
export async function segretiDaImpostare({ presenti, ref, chiavi, appUrl, email }) {
  const s = { SUPABASE_URL: `https://${ref}.supabase.co` }
  if (chiavi.pubblicabile) s.SUPABASE_PUBLISHABLE_KEY = chiavi.pubblicabile
  if (chiavi.segreta) s.SUPABASE_SECRET_KEY = chiavi.segreta
  if (appUrl) s.APP_URL = appUrl
  if (!presenti.has('VAPID_PRIVATE_KEY') || !presenti.has('VAPID_PUBLIC_KEY')) Object.assign(s, await nuoveChiaviVapid())
  if (email) s.VAPID_SUBJECT = `mailto:${email}`
  else if (!presenti.has('VAPID_SUBJECT')) throw new Errore('La prima volta serve --email (contatto per i servizi delle notifiche push)')
  if (!presenti.has('WHATSAPP_VERIFY_TOKEN')) s.WHATSAPP_VERIFY_TOKEN = randomBytes(18).toString('base64url')
  return s
}

async function main() {
  const a = argomenti()
  const prova = a.prova === true
  const ref = riferimento(richiesto(a.progetto, 'Indica il progetto Supabase: --progetto <riferimento o https://xxxx.supabase.co>'))
  const email = typeof a.email === 'string' ? a.email : null
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Errore(`Email non valida: ${email}`)
  if (!prova) richiesto(process.env.CLOUDFLARE_API_TOKEN, 'Manca CLOUDFLARE_API_TOKEN (Cloudflare → My Profile → API Tokens)')

  titolo('Chiavi di Supabase')
  const db = clienteSupabase(ref)
  const chiavi = scegliChiavi(await db.chiavi(true))
  if (!chiavi.pubblicabile || !chiavi.segreta) throw new Errore('Chiavi API non trovate nel progetto Supabase (Project Settings → API Keys)')
  ok('chiave pubblicabile e chiave segreta lette (non vengono mostrate)')

  titolo('Compilazione del pannello')
  const envBuild = { ...ambienteComandi }
  for (const k of Object.keys(envBuild)) if (k.startsWith('NEXT_PUBLIC_')) delete envBuild[k]
  esegui('npm', ['run', 'build'], { env: envBuild })
  ok('pannello compilato (web/out)')

  titolo(prova ? 'Pubblicazione (prova, nulla viene caricato)' : 'Pubblicazione su Cloudflare')
  const uscita = esegui('npx', ['wrangler', 'deploy', ...(prova ? ['--dry-run'] : [])], { cartella: WORKER })
  if (/workers\.dev subdomain/i.test(uscita)) {
    throw new Errore('Manca il sottodominio workers.dev: apri dash.cloudflare.com → Workers & Pages una volta (lo crea), poi rilancia.')
  }
  if (prova) {
    ok('prova riuscita: ' + (/Total Upload: .*/.exec(uscita)?.[0] ?? ''))
    return
  }
  const pubblicato = indirizzoPubblicato(uscita)
  const appUrl = (typeof a['app-url'] === 'string' ? a['app-url'] : pubblicato)?.replace(/\/+$/, '') ?? null
  ok(`pubblicato${pubblicato ? `: ${pubblicato}` : ''}`)

  titolo('Variabili del Worker')
  const elenco = JSON.parse(
    esegui('npx', ['wrangler', 'secret', 'list', '--format', 'json'], { cartella: WORKER, soloStdout: true }).replace(/^[^[]*/, ''),
  )
  const presenti = new Set(elenco.map((x) => x.name))
  const segreti = await segretiDaImpostare({ presenti, ref, chiavi, appUrl, email })
  esegui('npx', ['wrangler', 'secret', 'bulk'], { cartella: WORKER, ingresso: JSON.stringify(segreti) })
  ok(`impostate: ${Object.keys(segreti).join(', ')}`)
  if (segreti.WHATSAPP_VERIFY_TOKEN) info(`Verify token per Meta (copialo nella configurazione del webhook): ${segreti.WHATSAPP_VERIFY_TOKEN}`)
  const mancano = ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_APP_SECRET', 'RESEND_API_KEY'].filter((n) => !presenti.has(n))
  if (mancano.length) info(`Da inserire a mano su Cloudflare quando li avrai: ${mancano.join(', ')}`)

  if (appUrl) {
    titolo('Controllo')
    // il Worker appena pubblicato a volte impiega qualche secondo a rispondere ovunque
    let config = null
    for (let i = 0; i < 10 && !config?.supabaseChiave; i++) {
      if (i) await new Promise((r) => setTimeout(r, 3000))
      config = await chiama(`${appUrl}/api/config`).catch(() => null)
    }
    if (!config?.supabaseChiave) throw new Errore(`${appUrl}/api/config non risponde ancora con la configurazione: riprova tra un minuto`)
    ok(`${appUrl}/api/config risponde`)
    titolo('Fatto')
    info(`Pannello:          ${appUrl}`)
    info(`Webhook WhatsApp:  ${appUrl}/api/whatsapp/webhook`)
    info(`Informativa:       ${appUrl}/privacy/`)
    info(`Ricorda: lancia database.mjs con --app-url ${appUrl} (link per reimpostare la password).`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) principale(main)
