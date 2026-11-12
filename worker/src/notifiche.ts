/**
 * Avvisi per Ilenia: notifica push su ogni dispositivo dove le ha attivate;
 * se nessuna arriva, email di riserva (solo per gli avvisi che richiedono
 * un'azione: nuova richiesta, «operatore», posto da proporre).
 */
import type { Db, Notifica } from '@ilenia/shared/bot/motore'
import { descriviNotifica } from '@ilenia/shared/bot/notifiche'
import { inviaPush, type ChiaviVapid } from '@ilenia/shared/notifiche/webpush'
import type { Ambiente } from './ambiente'
import { inviaEmail } from './email'

const CON_EMAIL_DI_RISERVA = new Set<Notifica['tipo']>(['richiesta', 'operatore', 'anticipo_da_inviare'])

function chiaviVapid(env: Ambiente): ChiaviVapid | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null
  return { pubblica: env.VAPID_PUBLIC_KEY, privata: env.VAPID_PRIVATE_KEY, soggetto: env.VAPID_SUBJECT || 'mailto:noreply@example.com' }
}

export interface ContenutoNotifica {
  titolo: string
  testo: string
  url: string
  /** stesso tag = la nuova notifica sostituisce la precedente (solo per la prova) */
  tag?: string
}

/** Invia a tutte le iscrizioni (opzionalmente di una sola operatrice); cancella quelle scadute. */
export async function inviaATutti(env: Ambiente, db: Db, contenuto: ContenutoNotifica, operatriceId?: string): Promise<number> {
  const chiavi = chiaviVapid(env)
  if (!chiavi) return 0
  let q = db.from('push_iscrizioni').select('id, endpoint, p256dh, auth')
  if (operatriceId) q = q.eq('operatrice_id', operatriceId)
  const { data: iscrizioni } = await q
  let arrivate = 0
  for (const s of iscrizioni ?? []) {
    try {
      const esito = await inviaPush(s, contenuto, chiavi)
      if (esito.ok) arrivate++
      else if (esito.scaduta) await db.from('push_iscrizioni').delete().eq('id', s.id)
      else console.warn('Push non accettata', esito.stato)
    } catch (e) {
      console.error('Errore invio push', e)
    }
  }
  return arrivate
}

export function creaNotificatore(env: Ambiente, db: Db) {
  return async (n: Notifica) => {
    console.log('Notifica per Ilenia:', JSON.stringify(n))
    const { titolo, testo, pagina } = descriviNotifica(n)
    try {
      const arrivate = await inviaATutti(env, db, { titolo, testo, url: `${env.APP_URL ?? ''}${pagina}` })
      if (arrivate > 0 || !CON_EMAIL_DI_RISERVA.has(n.tipo) || !env.RESEND_API_KEY) return
      const { data } = await db.from('impostazioni').select('email_notifiche').not('email_notifiche', 'is', null).limit(1)
      const destinatario = data?.[0]?.email_notifiche
      if (destinatario) {
        await inviaEmail(env, destinatario, titolo, `${testo}\n\nApri il pannello: ${env.APP_URL ?? ''}${pagina}`)
      }
    } catch (e) {
      // un avviso non partito non deve bloccare il bot
      console.error('Avviso a Ilenia non inviato', e)
    }
  }
}
