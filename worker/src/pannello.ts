/**
 * API usate dal pannello per le azioni che scrivono alle clienti
 * (servono la chiave segreta e il token di WhatsApp, che stanno solo qui).
 *
 * Ogni richiesta deve avere "Authorization: Bearer <token di accesso>" della
 * sessione Supabase dell'operatrice: il Worker lo verifica con Supabase e
 * controlla che l'utente sia un'operatrice attiva.
 */
import {
  approvaRichiesta,
  ErroreAzione,
  rifiutaRichiesta,
  rispondiCliente,
  type ContestoAzioni,
} from '@ilenia/shared/bot/azioni'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Ambiente } from './ambiente'
import type { Dipendenze } from './index'

type Variabili = { operatriceId: string; azioni: ContestoAzioni }

const STATI_ERRORE = { non_trovato: 404, gia_gestita: 409, finestra_chiusa: 409, testo_non_valido: 422 } as const

export function creaApiPannello(dipendenze: Dipendenze) {
  const api = new Hono<{ Bindings: Ambiente; Variables: Variabili }>()

  // il pannello può essere servito da un altro indirizzo in sviluppo (es. localhost:3000)
  api.use('*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'], allowMethods: ['POST', 'OPTIONS'] }))

  api.use('*', async (c, next) => {
    const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '').trim()
    if (!token) return c.json({ errore: 'Accesso richiesto' }, 401)
    const db = dipendenze.creaDb(c.env)
    const { data, error } = await db.auth.getUser(token)
    if (error || !data.user) return c.json({ errore: 'Sessione non valida: esci e rientra' }, 401)
    const { data: operatrice } = await db
      .from('operatrici')
      .select('id')
      .eq('user_id', data.user.id)
      .eq('attiva', true)
      .maybeSingle()
    if (!operatrice) return c.json({ errore: 'Account non abilitato' }, 403)
    c.set('operatriceId', operatrice.id)
    c.set('azioni', { db, canale: dipendenze.creaCanale(c.env) })
    await next()
  })

  api.onError((e, c) => {
    if (e instanceof ErroreAzione) {
      return c.json({ errore: e.message, codice: e.codice, link: e.link ?? null }, STATI_ERRORE[e.codice])
    }
    console.error('Errore API pannello', e)
    return c.json({ errore: 'Errore interno, riprova' }, 500)
  })

  api.post('/richieste/:id/approva', async (c) =>
    c.json(await approvaRichiesta(c.get('azioni'), c.get('operatriceId'), c.req.param('id'))),
  )

  api.post('/richieste/:id/rifiuta', async (c) => {
    const corpo = (await c.req.json().catch(() => ({}))) as { motivo?: string }
    return c.json(await rifiutaRichiesta(c.get('azioni'), c.get('operatriceId'), c.req.param('id'), corpo.motivo))
  })

  api.post('/clienti/:id/messaggio', async (c) => {
    const corpo = (await c.req.json().catch(() => ({}))) as { testo?: string }
    return c.json(await rispondiCliente(c.get('azioni'), c.req.param('id'), corpo.testo ?? ''))
  })

  return api
}
