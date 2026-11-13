/**
 * Worker Cloudflare del salone.
 *
 * - GET  /api/whatsapp/webhook  verifica dell'indirizzo da parte di Meta
 * - POST /api/whatsapp/webhook  messaggi e stati: firma controllata, risposta
 *                               immediata 200, elaborazione in background
 * - POST /api/pannello/…        azioni del pannello che scrivono alle clienti
 *                               (approva, rifiuta, rispondi): vedi pannello.ts
 * - GET  /r/:id                 lista d'attesa manuale: segna la proposta come
 *                               inviata e apre WhatsApp col messaggio pronto
 * - GET  /api/salute            controllo che il Worker sia vivo
 * - GET  /api/config            configurazione pubblica per il pannello
 *                               (indirizzo Supabase, chiave pubblicabile, chiave push)
 * - GET  /api/info              nome e contatti del salone (pagina privacy)
 * - ogni minuto (cron)          scadenze della lista d'attesa e promemoria del giorno prima
 * - tutto il resto: file statici del pannello (web/out)
 */
import { elaboraScadenze, inviaPropostaManuale } from '@ilenia/shared/bot/anticipo'
import { inviaPromemoria } from '@ilenia/shared/bot/promemoria'
import { gestisciEvento, type ContestoBot, type Db } from '@ilenia/shared/bot/motore'
import type { Database } from '@ilenia/shared/tipi-db'
import { firmaValida } from '@ilenia/shared/whatsapp/firma'
import { leggiWebhook, type EventoWhatsApp } from '@ilenia/shared/whatsapp/webhook'
import { createClient } from '@supabase/supabase-js'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Ambiente } from './ambiente'
import { creaCanale, type CanaleWorker } from './meta'
import { inviaEmail } from './email'
import { creaNotificatore } from './notifiche'
import { creaApiPannello } from './pannello'

export interface Dipendenze {
  creaDb: (env: Ambiente) => Db
  creaCanale: (env: Ambiente) => CanaleWorker
}

const predefinite: Dipendenze = {
  creaDb: (env) =>
    createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
  creaCanale,
}

export function creaApp(dipendenze: Dipendenze = predefinite) {
  const app = new Hono<{ Bindings: Ambiente }>()

  app.get('/api/salute', (c) => c.json({ ok: true }))

  // solo valori pubblici per natura (finiscono comunque nel browser)
  app.get('/api/config', cors({ origin: '*', allowMethods: ['GET'] }), (c) => {
    c.header('cache-control', 'no-store')
    return c.json({
      supabaseUrl: c.env.SUPABASE_URL ?? '',
      supabaseChiave: c.env.SUPABASE_PUBLISHABLE_KEY ?? '',
      chiaveVapid: c.env.VAPID_PUBLIC_KEY ?? '',
    })
  })

  app.get('/api/info', cors({ origin: '*', allowMethods: ['GET'] }), async (c) => {
    const db = dipendenze.creaDb(c.env)
    const q = db.from('operatrici').select('id, nome')
    const { data: op } = c.env.BOT_OPERATRICE_ID
      ? await q.eq('id', c.env.BOT_OPERATRICE_ID).maybeSingle()
      : await q.eq('attiva', true).order('creato_il').limit(1).maybeSingle()
    const { data: imp } = op
      ? await db.from('impostazioni').select('telefono_salone, numero_whatsapp, email_notifiche').eq('operatrice_id', op.id).maybeSingle()
      : { data: null }
    c.header('cache-control', 'public, max-age=300')
    return c.json({
      nome: op?.nome ?? null,
      telefono: imp?.telefono_salone ?? null,
      whatsapp: imp?.numero_whatsapp ?? null,
      email: imp?.email_notifiche ?? null,
    })
  })

  app.get('/api/whatsapp/webhook', (c) => {
    const modo = c.req.query('hub.mode')
    const token = c.req.query('hub.verify_token')
    const sfida = c.req.query('hub.challenge')
    if (modo === 'subscribe' && sfida && token && token === c.env.WHATSAPP_VERIFY_TOKEN) return c.text(sfida)
    return c.text('Verifica non riuscita', 403)
  })

  app.post('/api/whatsapp/webhook', async (c) => {
    const grezzo = await c.req.text()
    const firma = c.req.header('x-hub-signature-256') ?? null
    if (!(await firmaValida(grezzo, firma, c.env.WHATSAPP_APP_SECRET))) return c.text('Firma non valida', 401)

    let corpo: unknown
    try {
      corpo = JSON.parse(grezzo)
    } catch {
      return c.text('JSON non valido', 400)
    }
    // risposta subito a Meta (altrimenti riprova); il lavoro continua in background
    c.executionCtx.waitUntil(elabora(c.env, dipendenze, leggiWebhook(corpo)))
    return c.text('ok')
  })

  app.route('/api/pannello', creaApiPannello(dipendenze))

  // link aperto da Ilenia (pannello o notifica): l'id è un UUID, non indovinabile
  app.get('/r/:id', async (c) => {
    const db = dipendenze.creaDb(c.env)
    const { data: proposta } = await db.from('proposte_anticipo').select('operatrice_id').eq('id', c.req.param('id')).maybeSingle()
    const messaggio = proposta
      ? await inviaPropostaManuale({ db, canale: dipendenze.creaCanale(c.env) }, proposta.operatrice_id, c.req.param('id'))
      : null
    if (!messaggio) return c.text('Questa proposta non è più valida: il posto è già stato assegnato o è scaduto.', 410)
    return c.redirect(messaggio.link, 302)
  })

  app.all('/api/*', (c) => c.json({ errore: 'Indirizzo non trovato' }, 404))

  return app
}

/** Lavoro programmato ogni minuto: scadenze della lista d'attesa e promemoria. */
export async function lavoroProgrammato(env: Ambiente, dipendenze: Dipendenze = predefinite) {
  const db = dipendenze.creaDb(env)
  const canale = dipendenze.creaCanale(env)
  const scadute = await elaboraScadenze({ db, canale, notifica: creaNotificatore(env, db) })
  if (scadute > 0) console.log(`Lista d'attesa: ${scadute} proposte scadute gestite`)
  const promemoria = await inviaPromemoria({
    db,
    canale,
    email: env.RESEND_API_KEY ? (a, oggetto, testo) => inviaEmail(env, a, oggetto, testo) : undefined,
  })
  if (promemoria.inviati + promemoria.saltati > 0) console.log('Promemoria:', JSON.stringify(promemoria))
  return { scadute, promemoria }
}

async function elabora(env: Ambiente, dipendenze: Dipendenze, eventi: EventoWhatsApp[]) {
  if (eventi.length === 0) return
  const canale = dipendenze.creaCanale(env)
  const db = dipendenze.creaDb(env)
  const ctx: ContestoBot = {
    db,
    canale,
    operatriceId: env.BOT_OPERATRICE_ID || null,
    notifica: creaNotificatore(env, db),
  }
  // uno alla volta, nell'ordine di arrivo
  for (const evento of eventi) {
    try {
      if (evento.tipo === 'messaggio') await canale.segnaLetto(evento.id)
      await gestisciEvento(ctx, evento)
    } catch (e) {
      console.error(`Errore nel gestire un evento WhatsApp (${evento.tipo} ${evento.id})`, e)
    }
  }
}

const app = creaApp()

export default {
  fetch: app.fetch,
  async scheduled(_evento, env, ctx) {
    ctx.waitUntil(lavoroProgrammato(env))
  },
} satisfies ExportedHandler<Ambiente>
