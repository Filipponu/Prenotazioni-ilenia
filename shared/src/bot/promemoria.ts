/**
 * Promemoria del giorno prima, secondo l'impostazione dell'operatrice:
 * - "template": WhatsApp. Messaggio libero (gratis) se la cliente ha scritto
 *   nelle ultime 24 ore, altrimenti template promemoria_appuntamento (a pagamento);
 * - "email": email alla cliente, se ha l'indirizzo in anagrafica;
 * - "disattivato": niente.
 *
 * Va chiamata spesso (ogni minuto): parte solo dopo l'ora impostata e ogni
 * appuntamento viene "prenotato" prima dell'invio, quindi mai due promemoria.
 */
import type { DateTime } from 'luxon'
import { adesso as adessoRoma, daIso, dataOraLunga, minutiDaOra, versoIso } from '../tempo'
import { inviaConFinestra } from './azioni'
import { senzaErrori, verifica, type Canale, type Db } from './comune'
import { TEMPLATE, TESTI as T } from './testi'
import type { EsitoPromemoria } from '../tipi-db'

export interface ContestoPromemoria {
  db: Db
  canale: Canale
  adesso?: () => DateTime
  /** invio email (Resend nel Worker); se manca, i promemoria via email non partono */
  email?: (destinatario: string, oggetto: string, testo: string) => Promise<void>
}

/** Prenotato da meno di così: il promemoria non serve. */
const ORE_PRENOTAZIONE_RECENTE = 2

export async function inviaPromemoria(
  ctx: ContestoPromemoria,
  opz: { forza?: boolean; giorno?: DateTime } = {},
): Promise<{ inviati: number; saltati: number }> {
  const ora = (ctx.adesso ?? adessoRoma)()
  const risultato = { inviati: 0, saltati: 0 }
  const impostazioni = verifica(await ctx.db.from('impostazioni').select('*').neq('promemoria', 'disattivato'))

  for (const imp of impostazioni) {
    if (!opz.forza && ora.hour * 60 + ora.minute < minutiDaOra(imp.ora_promemoria)) continue
    const giorno = (opz.giorno ?? ora.plus({ days: 1 })).startOf('day')
    const appuntamenti = verifica(
      await ctx.db
        .from('appuntamenti')
        .select('id, inizio, creato_il, cliente_id, servizi(nome), clienti(nome, telefono, email)')
        .eq('operatrice_id', imp.operatrice_id)
        .eq('stato', 'confermato')
        .gte('inizio', versoIso(giorno))
        .lt('inizio', versoIso(giorno.plus({ days: 1 })))
        .is('promemoria_inviato_il', null),
    )
    if (appuntamenti.length === 0) continue
    const operatrice = verifica(await ctx.db.from('operatrici').select('nome').eq('id', imp.operatrice_id).single()).nome

    for (const app of appuntamenti) {
      // prima "prenoto" il promemoria, poi invio: così non parte mai due volte
      const preso = verifica(
        await ctx.db
          .from('appuntamenti')
          .update({ promemoria_inviato_il: versoIso(ora) })
          .eq('id', app.id)
          .is('promemoria_inviato_il', null)
          .select('id'),
      )
      if (preso.length === 0) continue

      const servizio = app.servizi?.nome ?? 'appuntamento'
      const quando = dataOraLunga(daIso(app.inizio))
      const nome = app.clienti?.nome?.split(' ')[0] ?? ''
      let esito: EsitoPromemoria
      try {
        if (!opz.forza && ora.diff(daIso(app.creato_il), 'hours').hours < ORE_PRENOTAZIONE_RECENTE) {
          esito = 'non_necessario'
        } else if (imp.promemoria === 'template') {
          const invio = await inviaConFinestra(
            ctx,
            { clienteId: app.cliente_id, telefono: app.clienti?.telefono ?? null },
            { tipo: 'testo', testo: T.promemoria(servizio, quando, imp.telefono_salone) },
            {
              tipo: 'template',
              nome: TEMPLATE.promemoria,
              lingua: TEMPLATE.lingua,
              parametri: [nome || 'ciao', servizio, quando],
              anteprima: T.promemoria(servizio, quando, imp.telefono_salone),
            },
          )
          esito =
            invio.inviato === 'libero'
              ? 'whatsapp'
              : invio.inviato === 'template'
                ? 'template'
                : invio.motivo === 'template_non_riuscito'
                  ? 'errore'
                  : 'senza_contatto'
        } else if (app.clienti?.email && ctx.email) {
          await ctx.email(
            app.clienti.email,
            T.oggettoEmailPromemoria(quando),
            T.emailPromemoria(nome, operatrice, servizio, quando, imp.telefono_salone),
          )
          esito = 'email'
        } else {
          esito = 'senza_contatto'
        }
      } catch (e) {
        console.error('Promemoria non inviato', app.id, e)
        esito = 'errore'
      }
      senzaErrori(await ctx.db.from('appuntamenti').update({ promemoria_esito: esito }).eq('id', app.id))
      if (esito === 'whatsapp' || esito === 'template' || esito === 'email') risultato.inviati++
      else risultato.saltati++
    }
  }
  return risultato
}
