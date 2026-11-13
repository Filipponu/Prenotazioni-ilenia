#!/usr/bin/env node
/**
 * Prova degli script di messa online contro servizi finti, senza account:
 * - finta Management API di Supabase che esegue l'SQL su un Postgres usa e getta;
 * - finta Graph API di Meta.
 *
 *   TEST_DATABASE_URL=postgres://… node strumenti/messa-online/prova.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { RADICE } from './comune.mjs'
import { indirizzoPubblicato, segretiDaImpostare } from './pubblica.mjs'

const BASE_URL = process.env.TEST_DATABASE_URL
if (!BASE_URL) {
  console.error('Imposta TEST_DATABASE_URL verso un Postgres usa e getta (come per npm run test:db)')
  process.exit(1)
}
const DB = `ilenia_messa_online_${process.pid}`
const URL_DB = BASE_URL.replace(/^(postgres(?:ql)?:\/\/[^/]*)\/[^?]*/, `$1/${DB}`)
const psql = (url, args, input) =>
  execFileSync('psql', [url, '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args], {
    input,
    encoding: 'utf8',
    env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' },
  })

psql(BASE_URL, ['-c', `create database ${DB}`])
let esito = 1
try {
  psql(URL_DB, ['-f', join(RADICE, 'supabase/tests/stub-supabase.sql')])
  // l'utente di Ilenia creato PRIMA delle tabelle: lo script deve collegarlo
  psql(URL_DB, ['-c', `insert into auth.users (email) values ('ilenia.rossi@example.com')`])

  // ---------------------------------------------------------------- finta Supabase
  const auth = []
  const supa = createServer(async (req, res) => {
    let corpo = ''
    for await (const c of req) corpo += c
    const json = corpo ? JSON.parse(corpo) : null
    const invia = (stato, o) => {
      res.writeHead(stato, { 'content-type': 'application/json' })
      res.end(JSON.stringify(o))
    }
    if (req.headers.authorization !== 'Bearer sbp_prova') return invia(401, { message: 'token mancante' })
    const u = new URL(req.url, 'http://x')
    if (u.pathname === '/v1/projects/abcdefghijklmnopqrst') return invia(200, { name: 'salone', region: 'eu-central-1', status: 'ACTIVE_HEALTHY' })
    if (u.pathname.endsWith('/database/query')) {
      try {
        const q = json.query.trim()
        // come l'API: più comandi = una transazione; per le select restituisce le righe
        const select = /^(select|with)\b/i.test(q) && !q.replace(/;\s*$/, '').includes(';')
        const out = select
          ? psql(URL_DB, ['-t', '-A', '-c', `select coalesce(json_agg(t), '[]') from (${q.replace(/;\s*$/, '')}) t`])
          : (psql(URL_DB, ['-c', q]), '[]')
        return invia(200, JSON.parse(out))
      } catch (e) {
        return invia(400, { message: String(e.stderr ?? e.message).trim() })
      }
    }
    if (u.pathname.endsWith('/config/auth') && req.method === 'PATCH') {
      auth.push(json)
      return invia(200, json)
    }
    if (u.pathname.endsWith('/api-keys')) {
      const rivela = u.searchParams.get('reveal') === 'true'
      return invia(200, [
        { type: 'legacy', name: 'anon', api_key: 'eyJ.vecchia.anon' },
        { type: 'publishable', name: 'default', api_key: 'sb_publishable_prova' },
        { type: 'secret', name: 'default', api_key: rivela ? 'sb_secret_prova' : 'sb_secret_pr••••••' },
      ])
    }
    invia(404, { message: 'non simulato ' + u.pathname })
  }).listen(0)

  // ---------------------------------------------------------------- finta Graph API
  const meta = { registrato: null, iscritta: false, template: [] }
  const graph = createServer(async (req, res) => {
    let corpo = ''
    for await (const c of req) corpo += c
    const json = corpo ? JSON.parse(corpo) : null
    const invia = (stato, o) => {
      res.writeHead(stato, { 'content-type': 'application/json' })
      res.end(JSON.stringify(o))
    }
    if (req.headers.authorization !== 'Bearer EAAprova') return invia(401, { error: { message: 'Invalid OAuth access token' } })
    const p = new URL(req.url, 'http://x').pathname.replace(/^\/v\d+\.\d+\//, '')
    if (p === '1234567890/phone_numbers') return invia(200, { data: [{ id: '9876543210', display_phone_number: '+39 300 000 0999', verified_name: 'Salone Ilenia', name_status: 'APPROVED', platform_type: meta.registrato ? 'CLOUD_API' : 'NOT_APPLICABLE' }] })
    if (p === '9876543210/register' && req.method === 'POST') {
      meta.registrato = json
      return invia(200, { success: true })
    }
    if (p === '1234567890/subscribed_apps') {
      if (req.method === 'POST') meta.iscritta = true
      return invia(200, req.method === 'POST' ? { success: true } : { data: meta.iscritta ? [{ whatsapp_business_api_data: { name: 'Prenotazioni' } }] : [] })
    }
    if (p === '1234567890/message_templates') {
      if (req.method === 'POST') {
        if (/^\{\{|\}\}[.!?]?$/.test(json.components[0].text)) return invia(400, { error: { message: 'variabile all\'inizio o alla fine' } })
        meta.template.push(json)
        return invia(200, { id: String(meta.template.length), status: 'PENDING', category: json.category })
      }
      return invia(200, { data: meta.template.map((t) => ({ name: t.name, language: t.language, status: 'APPROVED' })) })
    }
    if (p === '9876543210') return invia(200, { display_phone_number: '+39 300 000 0999', verified_name: 'Salone Ilenia', name_status: 'APPROVED', platform_type: 'CLOUD_API', status: 'CONNECTED' })
    invia(404, { error: { message: 'non simulato ' + p } })
  }).listen(0)

  const env = {
    ...process.env,
    SUPABASE_API_URL: `http://127.0.0.1:${supa.address().port}`,
    SUPABASE_ACCESS_TOKEN: 'sbp_prova',
    GRAPH_URL: `http://127.0.0.1:${graph.address().port}`,
    WHATSAPP_TOKEN: 'EAAprova',
  }
  const lancia = async (script, args) => {
    // asincrono: i server finti girano in questo stesso processo
    const { spawn } = await import('node:child_process')
    return new Promise((ok) => {
      const p = spawn('node', [join(RADICE, 'strumenti/messa-online', script), ...args], { env })
      let out = ''
      p.stdout.on('data', (d) => (out += d))
      p.stderr.on('data', (d) => (out += d))
      p.on('close', (stato) => ok({ stato, out }))
    })
  }
  const passo = (t) => console.log('•', t)

  passo('database: prima volta (migrazioni, utente collegato, iscrizioni chiuse)')
  let r = await lancia('database.mjs', ['--progetto', 'https://abcdefghijklmnopqrst.supabase.co', '--app-url', 'https://prenotazioni-ilenia.salone.workers.dev/'])
  assert.equal(r.stato, 0, r.out)
  assert.match(r.out, /migrazione 20261111120000_schema\.sql/)
  assert.match(r.out, /utente ilenia\.rossi@example\.com collegata come operatrice/)
  assert.match(r.out, /SUPABASE_PUBLISHABLE_KEY=sb_publishable_prova/)
  assert.doesNotMatch(r.out, /sb_secret/)
  assert.deepEqual(auth.at(-1), {
    disable_signup: true,
    site_url: 'https://prenotazioni-ilenia.salone.workers.dev',
    uri_allow_list: 'https://prenotazioni-ilenia.salone.workers.dev/**',
  })
  const op = psql(URL_DB, ['-t', '-A', '-c', `select nome || '|' || attiva || '|' || (select count(*) from public.impostazioni) from public.operatrici`]).trim()
  assert.equal(op, 'Ilenia Rossi|true|1')

  passo('database: seconda volta (niente da rifare, nessun doppione)')
  r = await lancia('database.mjs', ['--progetto', 'abcdefghijklmnopqrst'])
  assert.equal(r.stato, 0, r.out)
  assert.match(r.out, /database già aggiornato/)
  assert.match(r.out, /1 utenti, 1 operatrici attive/)

  passo('database: token sbagliato → errore chiaro')
  env.SUPABASE_ACCESS_TOKEN = 'sbagliato'
  r = await lancia('database.mjs', ['--progetto', 'abcdefghijklmnopqrst'])
  assert.notEqual(r.stato, 0)
  assert.match(r.out, /401: token mancante/)
  env.SUPABASE_ACCESS_TOKEN = 'sbp_prova'

  passo('whatsapp: numeri, registrazione, iscrizione, modelli, stato')
  r = await lancia('whatsapp.mjs', ['numeri', '--account', '1234567890'])
  assert.match(r.out, /ID: 9876543210/)
  r = await lancia('whatsapp.mjs', ['registra', '--numero', '9876543210', '--pin', '12345'])
  assert.notEqual(r.stato, 0)
  assert.match(r.out, /6 cifre/)
  r = await lancia('whatsapp.mjs', ['registra', '--numero', '9876543210', '--pin', '123456'])
  assert.equal(r.stato, 0, r.out)
  assert.deepEqual(meta.registrato, { messaging_product: 'whatsapp', pin: '123456' })
  r = await lancia('whatsapp.mjs', ['iscrivi', '--account', '1234567890'])
  assert.equal(r.stato, 0, r.out)
  r = await lancia('whatsapp.mjs', ['template', '--account', '1234567890'])
  assert.equal(r.stato, 0, r.out)
  assert.deepEqual(meta.template.map((t) => t.name), ['conferma_appuntamento', 'promemoria_appuntamento', 'proposta_anticipo'])
  r = await lancia('whatsapp.mjs', ['template', '--account', '1234567890'])
  assert.equal(meta.template.length, 3, 'i modelli già presenti non si ricreano')
  r = await lancia('whatsapp.mjs', ['stato', '--numero', '9876543210', '--account', '1234567890'])
  assert.match(r.out, /app collegata/)
  assert.match(r.out, /modello proposta_anticipo: approvato/)

  passo('pubblica: segreti generati solo la prima volta, indirizzo letto da wrangler')
  assert.equal(indirizzoPubblicato('Deployed prenotazioni-ilenia triggers\n  https://prenotazioni-ilenia.salone.workers.dev\n'), 'https://prenotazioni-ilenia.salone.workers.dev')
  const chiavi = { pubblicabile: 'sb_publishable_prova', segreta: 'sb_secret_prova' }
  const prima = await segretiDaImpostare({ presenti: new Set(), ref: 'abcdefghijklmnopqrst', chiavi, appUrl: 'https://x.workers.dev', email: 'salone@example.com' })
  assert.deepEqual(Object.keys(prima).sort(), ['APP_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_URL', 'VAPID_PRIVATE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_SUBJECT', 'WHATSAPP_VERIFY_TOKEN'])
  assert.equal(Buffer.from(prima.VAPID_PUBLIC_KEY, 'base64url').length, 65)
  const dopo = await segretiDaImpostare({ presenti: new Set(Object.keys(prima)), ref: 'abcdefghijklmnopqrst', chiavi, appUrl: 'https://x.workers.dev', email: null })
  assert.deepEqual(Object.keys(dopo).sort(), ['APP_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_URL'])
  await assert.rejects(segretiDaImpostare({ presenti: new Set(), ref: 'x', chiavi, appUrl: null, email: null }), /--email/)

  if (process.argv.includes('--con-build')) {
    passo('pubblica --prova: compilazione e prova di wrangler (lenta)')
    r = await lancia('pubblica.mjs', ['--progetto', 'abcdefghijklmnopqrst', '--prova'])
    assert.equal(r.stato, 0, r.out)
    assert.match(r.out, /prova riuscita: Total Upload/)
  }

  supa.close()
  graph.close()
  console.log('\nTutto bene.')
  esito = 0
} catch (e) {
  console.error(e)
} finally {
  spawnSync('psql', [BASE_URL, '-X', '-q', '-c', `drop database if exists ${DB}`])
  process.exit(esito)
}
