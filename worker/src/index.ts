/**
 * Worker Cloudflare del salone.
 *
 * - GET  /api/whatsapp/webhook  verifica dell'indirizzo da parte di Meta
 * - POST /api/whatsapp/webhook  messaggi e stati: firma controllata, risposta
 *                               immediata 200, elaborazione in background
 * - POST /api/pannello/…        azioni del pannello che scrivono alle clienti
 *                               (approva, rifiuta, rispondi): vedi pannello.ts
 * - GET  /api/salute            controllo che il Worker sia vivo
 * - tutto il resto: file statici del pannello (web/out)
 */
import { gestisciEvento, type ContestoBot, type Db } from '@ilenia/shared/bot/motore'
import type { Database } from '@ilenia/shared/tipi-db'
import { firmaValida } from '@ilenia/shared/whatsapp/firma'
import { leggiWebhook, type EventoWhatsApp } from '@ilenia/shared/whatsapp/webhook'
import { createClient } from '@supabase/supabase-js'
import { Hono } from 'hono'
import type { Ambiente } from './ambiente'
import { creaCanale, type CanaleWorker } from './meta'
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

  app.all('/api/*', (c) => c.json({ errore: 'Indirizzo non trovato' }, 404))

  return app
}

async function elabora(env: Ambiente, dipendenze: Dipendenze, eventi: EventoWhatsApp[]) {
  if (eventi.length === 0) return
  const canale = dipendenze.creaCanale(env)
  const ctx: ContestoBot = {
    db: dipendenze.creaDb(env),
    canale,
    operatriceId: env.BOT_OPERATRICE_ID || null,
    // Fase 5: notifiche push / email a Ilenia
    notifica: (n) => console.log('Notifica per Ilenia:', JSON.stringify(n)),
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

export default creaApp()
