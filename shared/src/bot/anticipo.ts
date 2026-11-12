/**
 * Lista d'attesa per anticipare: quando si libera un posto, lo si propone
 * a una cliente alla volta, partendo da chi ha l'appuntamento più lontano.
 *
 * 1. liberaSlot: registra il posto lasciato libero (disdetta, spostamento,
 *    richiesta rifiutata…) e avvia le proposte.
 * 2. prossimaProposta: calcola lo spazio libero reale (il posto + il tempo
 *    libero vicino, dentro l'orario di apertura), sceglie la candidata e:
 *    - modalità automatica → il bot le scrive (gratis se la finestra di 24 h
 *      è aperta, altrimenti template a pagamento) con Accetto / No grazie;
 *    - modalità manuale → avvisa Ilenia, che manda il messaggio già pronto
 *      dal suo telefono (dentro c'è il link «ACCETTO <codice>» verso il bot).
 * 3. rispondiProposta: accetta (sposta l'appuntamento e libera il vecchio
 *    posto → si ricomincia, a catena) o rifiuta (→ candidata successiva).
 * 4. elaboraScadenze (ogni minuto): proposte senza risposta → successiva.
 *
 * Nessuna proposta per posti che iniziano tra meno del preavviso minimo.
 */
import type { DateTime } from 'luxon'
import { fasceDelGiorno } from '../orari'
import { linkWhatsApp } from '../telefono'
import { adesso as adessoRoma, daIso, dataOraLunga, versoIso } from '../tempo'
import type { Impostazioni, StatoProposta } from '../tipi-db'
import { statoFinestra } from '../whatsapp/finestra'
import type { MessaggioUscita } from '../whatsapp/messaggi'
import { inviaERegistra, senzaErrori, verifica, verificaForse, type Canale, type Db, type Notifica } from './comune'
import { TEMPLATE, TESTI as T } from './testi'

export interface ContestoAnticipo {
  db: Db
  canale: Canale
  adesso?: () => DateTime
  notifica?: (n: Notifica) => void | Promise<void>
}

const APERTE: StatoProposta[] = ['da_inviare', 'inviata']
const MINUTO = 60_000
/** lettere e cifre facili da leggere (niente 0/O, 1/I) */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function nuovoCodice(): string {
  const casuali = new Uint8Array(5)
  crypto.getRandomValues(casuali)
  return Array.from(casuali, (x) => ALFABETO[x % ALFABETO.length]).join('')
}

const oraDi = (ctx: ContestoAnticipo) => (ctx.adesso ?? adessoRoma)()
const iso = (ms: number) => versoIso(daIso(new Date(ms).toISOString()))

async function impostazioni(ctx: ContestoAnticipo, operatriceId: string): Promise<Impostazioni> {
  return verifica(await ctx.db.from('impostazioni').select('*').eq('operatrice_id', operatriceId).single())
}

// ---------------------------------------------------------------------
// 1. Un posto si è liberato
// ---------------------------------------------------------------------
export async function liberaSlot(
  ctx: ContestoAnticipo,
  posto: { operatriceId: string; inizio: string; fine: string; origineAppuntamentoId?: string | null },
): Promise<string | null> {
  if (Date.parse(posto.inizio) <= oraDi(ctx).toMillis()) return null // già passato
  const slot = verifica(
    await ctx.db
      .from('slot_liberati')
      .insert({
        operatrice_id: posto.operatriceId,
        inizio: posto.inizio,
        fine: posto.fine,
        origine_appuntamento_id: posto.origineAppuntamentoId ?? null,
      })
      .select('id')
      .single(),
  )
  await prossimaProposta(ctx, slot.id)
  return slot.id
}

/**
 * Spazio libero attorno al posto liberato: si allarga al tempo libero
 * adiacente dentro la stessa fascia di apertura. null se nel frattempo il
 * posto è stato occupato.
 */
async function spazioLibero(
  ctx: ContestoAnticipo,
  slot: { id: string; operatrice_id: string; inizio: string; fine: string },
): Promise<{ inizio: number; fine: number } | null> {
  const i = Date.parse(slot.inizio)
  const f = Date.parse(slot.fine)
  const giorno = daIso(slot.inizio).startOf('day')
  const da = versoIso(giorno)
  const a = versoIso(giorno.plus({ days: 1 }))
  const op = slot.operatrice_id
  const [orari, appuntamenti, chiusure, proposte] = await Promise.all([
    ctx.db.from('orari_settimanali').select('giorno, ora_inizio, ora_fine').eq('operatrice_id', op),
    ctx.db
      .from('appuntamenti')
      .select('inizio, fine')
      .eq('operatrice_id', op)
      .in('stato', ['in_attesa', 'confermato'])
      .lt('inizio', a)
      .gt('fine', da),
    ctx.db.from('chiusure').select('inizio, fine').eq('operatrice_id', op).lt('inizio', a).gt('fine', da),
    ctx.db.from('proposte_anticipo').select('slot_id, nuovo_inizio, nuova_fine').eq('operatrice_id', op).in('stato', APERTE),
  ])
  const occupati = [
    ...verifica(appuntamenti),
    ...verifica(chiusure),
    ...verifica(proposte)
      .filter((p) => p.slot_id !== slot.id)
      .map((p) => ({ inizio: p.nuovo_inizio, fine: p.nuova_fine })),
  ].map((o) => ({ inizio: Date.parse(o.inizio), fine: Date.parse(o.fine) }))

  if (occupati.some((o) => o.inizio < f && i < o.fine)) return null
  const fascia = fasceDelGiorno(giorno, verifica(orari)).find((x) => x.inizio.toMillis() <= i && f <= x.fine.toMillis())
  if (!fascia) return { inizio: i, fine: f }
  let inizio = fascia.inizio.toMillis()
  let fine = fascia.fine.toMillis()
  for (const o of occupati) {
    if (o.fine <= i) inizio = Math.max(inizio, o.fine)
    if (o.inizio >= f) fine = Math.min(fine, o.inizio)
  }
  return { inizio, fine }
}

// ---------------------------------------------------------------------
// 2. Proposta alla candidata successiva
// ---------------------------------------------------------------------
export async function prossimaProposta(ctx: ContestoAnticipo, slotId: string): Promise<void> {
  const slot = verificaForse(await ctx.db.from('slot_liberati').select('*').eq('id', slotId).maybeSingle())
  if (!slot || slot.stato !== 'aperto') return
  const fatte = verifica(await ctx.db.from('proposte_anticipo').select('appuntamento_id, stato').eq('slot_id', slotId))
  if (fatte.some((p) => APERTE.includes(p.stato))) return

  const chiudi = async (stato: 'esaurito' | 'annullato') =>
    senzaErrori(await ctx.db.from('slot_liberati').update({ stato }).eq('id', slotId).eq('stato', 'aperto'))

  const imp = await impostazioni(ctx, slot.operatrice_id)
  const ora = oraDi(ctx)
  const spazio = await spazioLibero(ctx, slot)
  if (!spazio) return chiudi('annullato')
  const minimo = ora.toMillis() + imp.lista_attesa_preavviso_minimo_min * MINUTO
  const liberoDa = Date.parse(slot.inizio)

  const iscritte = verifica(
    await ctx.db
      .from('lista_attesa')
      .select('id, cliente_id, appuntamento_id, appuntamenti(id, inizio, fine, stato, servizi(nome)), clienti(id, nome, telefono)')
      .eq('operatrice_id', slot.operatrice_id)
      .eq('attiva', true),
  )
  const giaProposti = new Set(fatte.map((p) => p.appuntamento_id))

  const candidate = iscritte
    .map((x) => {
      const app = x.appuntamenti
      if (!app || app.stato !== 'confermato' || !x.clienti?.telefono || giaProposti.has(app.id)) return null
      // non si ripropone il posto a chi l'ha appena lasciato
      if (app.id === slot.origine_appuntamento_id) return null
      const inizioApp = Date.parse(app.inizio)
      const durata = Date.parse(app.fine) - inizioApp
      if (inizioApp <= liberoDa || durata > spazio.fine - spazio.inizio) return null
      // si propone l'orario del posto liberato; se il servizio non ci sta, si anticipa dentro lo spazio
      const inizio = Math.max(spazio.inizio, Math.min(liberoDa, spazio.fine - durata))
      if (inizio < minimo || inizio >= inizioApp) return null
      return { iscritta: x, app, inizio, durata, telefono: x.clienti.telefono }
    })
    .filter((c) => c !== null)
    .sort((a, b) => Date.parse(b.app.inizio) - Date.parse(a.app.inizio))

  const scelta = candidate[0]
  if (!scelta) return chiudi('esaurito')

  const automatica = imp.lista_attesa_modalita === 'automatica'
  let canale: 'interattivo' | 'template' | 'manuale' = 'manuale'
  if (automatica) {
    const conv = verificaForse(
      await ctx.db.from('conversazioni').select('ultimo_messaggio_cliente_il').eq('cliente_id', scelta.iscritta.cliente_id).maybeSingle(),
    )
    canale = statoFinestra(conv?.ultimo_messaggio_cliente_il, ora).aperta ? 'interattivo' : 'template'
  }
  const scadenza = Math.min(ora.toMillis() + imp.lista_attesa_minuti_risposta * MINUTO, scelta.inizio - imp.lista_attesa_preavviso_minimo_min * MINUTO)

  let proposta: { id: string; codice: string } | null = null
  for (let tentativo = 0; tentativo < 3 && !proposta; tentativo++) {
    const r = await ctx.db
      .from('proposte_anticipo')
      .insert({
        slot_id: slotId,
        lista_attesa_id: scelta.iscritta.id,
        cliente_id: scelta.iscritta.cliente_id,
        appuntamento_id: scelta.app.id,
        operatrice_id: slot.operatrice_id,
        nuovo_inizio: iso(scelta.inizio),
        nuova_fine: iso(scelta.inizio + scelta.durata),
        canale,
        stato: automatica ? 'inviata' : 'da_inviare',
        codice: nuovoCodice(),
        inviata_il: automatica ? versoIso(ora) : null,
        scade_il: automatica ? iso(scadenza) : null,
      })
      .select('id, codice')
      .single()
    if (r.error?.code === '23505' && r.error.message.includes('codice')) continue
    if (r.error?.code === '23505') return // un'altra proposta è partita nel frattempo
    proposta = verifica(r)
  }
  if (!proposta) throw new Error('Impossibile creare un codice unico per la proposta')

  const servizio = scelta.app.servizi?.nome ?? 'il tuo appuntamento'
  const nuovo = dataOraLunga(daIso(iso(scelta.inizio)))
  const attuale = dataOraLunga(daIso(scelta.app.inizio))
  const nome = scelta.iscritta.clienti?.nome?.split(' ')[0] ?? ''

  if (!automatica) {
    await ctx.notifica?.({
      tipo: 'anticipo_da_inviare',
      propostaId: proposta.id,
      cliente: scelta.iscritta.clienti?.nome ?? scelta.telefono,
      servizio,
      quando: nuovo,
      attuale,
    })
    return
  }

  const testo = T.propostaAnticipo(servizio, nuovo, attuale, imp.lista_attesa_minuti_risposta)
  const messaggio: MessaggioUscita =
    canale === 'interattivo'
      ? {
          tipo: 'pulsanti',
          testo,
          pulsanti: [
            { id: `anticipo-ok:${proposta.codice}`, titolo: T.pulsanteAccetto },
            { id: `anticipo-no:${proposta.codice}`, titolo: T.pulsanteNoGrazie },
          ],
        }
      : {
          tipo: 'template',
          nome: TEMPLATE.anticipo,
          lingua: TEMPLATE.lingua,
          parametri: [nome || 'ciao', servizio, nuovo, attuale, String(imp.lista_attesa_minuti_risposta)],
          risposte: [`anticipo-ok:${proposta.codice}`, `anticipo-no:${proposta.codice}`],
          anteprima: testo,
        }
  try {
    await inviaERegistra(ctx.db, ctx.canale, { clienteId: scelta.iscritta.cliente_id, telefono: scelta.telefono }, messaggio)
  } catch (e) {
    // invio fallito (es. template non ancora approvato): si passa alla successiva
    console.error('Proposta di anticipo non inviata', e)
    senzaErrori(await ctx.db.from('proposte_anticipo').update({ stato: 'annullata' }).eq('id', proposta.id))
    return prossimaProposta(ctx, slotId)
  }
  await ctx.notifica?.({
    tipo: 'anticipo_proposto',
    propostaId: proposta.id,
    cliente: scelta.iscritta.clienti?.nome ?? scelta.telefono,
    servizio,
    quando: nuovo,
  })
}

// ---------------------------------------------------------------------
// Modalità manuale: messaggio pronto per Ilenia
// ---------------------------------------------------------------------
export interface MessaggioManuale {
  link: string
  testo: string
  scade: string | null
}

/** Segna la proposta come inviata da Ilenia (fa partire il tempo) e restituisce il link wa.me. */
export async function inviaPropostaManuale(
  ctx: ContestoAnticipo,
  operatriceId: string,
  propostaId: string,
): Promise<MessaggioManuale | null> {
  const p = verificaForse(
    await ctx.db
      .from('proposte_anticipo')
      .select('*, clienti(nome, telefono), appuntamenti(inizio, servizi(nome))')
      .eq('id', propostaId)
      .eq('operatrice_id', operatriceId)
      .maybeSingle(),
  )
  if (!p || !APERTE.includes(p.stato) || !p.clienti?.telefono) return null
  const imp = await impostazioni(ctx, operatriceId)
  const ora = oraDi(ctx)
  let scade = p.scade_il
  if (p.stato === 'da_inviare') {
    scade = iso(
      Math.min(
        ora.toMillis() + imp.lista_attesa_minuti_risposta * MINUTO,
        Date.parse(p.nuovo_inizio) - imp.lista_attesa_preavviso_minimo_min * MINUTO,
      ),
    )
    senzaErrori(
      await ctx.db
        .from('proposte_anticipo')
        .update({ stato: 'inviata', inviata_il: versoIso(ora), scade_il: scade })
        .eq('id', propostaId)
        .eq('stato', 'da_inviare'),
    )
  }
  return { ...messaggioManuale(p, imp), scade }
}

/** Messaggio (e link wa.me) che Ilenia manda dal suo telefono alla cliente. */
export function messaggioManuale(
  p: {
    codice: string
    nuovo_inizio: string
    clienti: { nome: string | null; telefono: string | null } | null
    appuntamenti: { inizio: string; servizi: { nome: string } | null } | null
  },
  imp: Pick<Impostazioni, 'numero_whatsapp' | 'lista_attesa_minuti_risposta'>,
): { link: string; testo: string } {
  const ritorno = imp.numero_whatsapp ? linkWhatsApp(imp.numero_whatsapp, `ACCETTO ${p.codice}`) : null
  const testo = T.propostaManuale(
    p.clienti?.nome?.split(' ')[0] ?? '',
    p.appuntamenti?.servizi?.nome ?? 'il tuo appuntamento',
    dataOraLunga(daIso(p.nuovo_inizio)),
    p.appuntamenti ? dataOraLunga(daIso(p.appuntamenti.inizio)) : '',
    imp.lista_attesa_minuti_risposta,
    ritorno,
  )
  return { link: linkWhatsApp(p.clienti?.telefono ?? '', testo), testo }
}

// ---------------------------------------------------------------------
// 3. Risposta della cliente (dal bot) o segnata da Ilenia (dal pannello)
// ---------------------------------------------------------------------
export type EsitoRisposta =
  | { esito: 'accettata'; servizio: string; quando: string; da: string; clienteId: string; telefono: string | null }
  | { esito: 'rifiutata'; attuale: string }
  | { esito: 'scaduta' | 'non_trovata' }
  | { esito: 'preso'; attuale: string }

/**
 * prima: chiamata con l'esito appena deciso, PRIMA di proseguire (proposta
 * alla successiva o catena), così chi ha risposto riceve subito il suo messaggio.
 */
export async function rispondiProposta(
  ctx: ContestoAnticipo,
  chi: { codice?: string; propostaId?: string; clienteId?: string; operatriceId?: string },
  accetta: boolean,
  prima?: (esito: EsitoRisposta) => Promise<void>,
): Promise<EsitoRisposta> {
  let q = ctx.db.from('proposte_anticipo').select('*, appuntamenti(id, inizio, fine, stato, servizi(nome)), clienti(nome, telefono)')
  if (chi.propostaId) q = q.eq('id', chi.propostaId)
  else if (chi.codice) q = q.eq('codice', chi.codice.toUpperCase())
  else return { esito: 'non_trovata' }
  if (chi.clienteId) q = q.eq('cliente_id', chi.clienteId)
  if (chi.operatriceId) q = q.eq('operatrice_id', chi.operatriceId)
  const p = verificaForse(await q.maybeSingle())
  if (!p || !p.appuntamenti) return { esito: 'non_trovata' }

  const ora = oraDi(ctx)
  const app = p.appuntamenti
  const attuale = dataOraLunga(daIso(app.inizio))
  if (!APERTE.includes(p.stato)) return { esito: p.stato === 'accettata' ? 'non_trovata' : 'scaduta' }
  if (p.scade_il && Date.parse(p.scade_il) < ora.toMillis()) {
    await prima?.({ esito: 'scaduta' })
    await scadi(ctx, p.id, p.slot_id)
    return { esito: 'scaduta' }
  }

  if (!accetta) {
    senzaErrori(
      await ctx.db
        .from('proposte_anticipo')
        .update({ stato: 'rifiutata', risposta_il: versoIso(ora) })
        .eq('id', p.id)
        .in('stato', APERTE),
    )
    const rifiutata: EsitoRisposta = { esito: 'rifiutata', attuale }
    await prima?.(rifiutata)
    await prossimaProposta(ctx, p.slot_id)
    return rifiutata
  }

  // la prima risposta vince (un doppio tocco non sposta due volte)
  const presa = verifica(
    await ctx.db
      .from('proposte_anticipo')
      .update({ stato: 'accettata', risposta_il: versoIso(ora) })
      .eq('id', p.id)
      .in('stato', APERTE)
      .select('id'),
  )
  if (presa.length === 0) return { esito: 'scaduta' }

  const spostato = await ctx.db
    .from('appuntamenti')
    .update({ inizio: p.nuovo_inizio, fine: p.nuova_fine })
    .eq('id', app.id)
    .eq('stato', 'confermato')
    .select('id')
  if (spostato.error?.code === '23P01' || (spostato.data && spostato.data.length === 0)) {
    // occupato nel frattempo (o appuntamento non più valido)
    senzaErrori(await ctx.db.from('proposte_anticipo').update({ stato: 'annullata' }).eq('id', p.id))
    senzaErrori(await ctx.db.from('slot_liberati').update({ stato: 'annullato' }).eq('id', p.slot_id).eq('stato', 'aperto'))
    return { esito: 'preso', attuale }
  }
  senzaErrori(spostato)
  senzaErrori(await ctx.db.from('slot_liberati').update({ stato: 'assegnato' }).eq('id', p.slot_id))

  const servizio = app.servizi?.nome ?? 'il tuo appuntamento'
  const quando = dataOraLunga(daIso(p.nuovo_inizio))
  const accettata: EsitoRisposta = {
    esito: 'accettata',
    servizio,
    quando,
    da: attuale,
    clienteId: p.cliente_id,
    telefono: p.clienti?.telefono ?? null,
  }
  await prima?.(accettata)
  await ctx.notifica?.({ tipo: 'anticipo_accettato', cliente: p.clienti?.nome ?? '', servizio, da: attuale, a: quando })

  // a catena: il vecchio posto della cliente si libera per le altre
  await liberaSlot(ctx, { operatriceId: p.operatrice_id, inizio: app.inizio, fine: app.fine, origineAppuntamentoId: app.id })
  return accettata
}

async function scadi(ctx: ContestoAnticipo, propostaId: string, slotId: string) {
  const fatto = verifica(
    await ctx.db.from('proposte_anticipo').update({ stato: 'scaduta' }).eq('id', propostaId).in('stato', APERTE).select('id'),
  )
  if (fatto.length > 0) await prossimaProposta(ctx, slotId)
}

/** Testo per la cliente dopo la sua risposta. */
export function testoEsito(e: EsitoRisposta): string {
  switch (e.esito) {
    case 'accettata':
      return T.anticipoAccettato(e.servizio, e.quando)
    case 'rifiutata':
      return T.anticipoRifiutato(e.attuale)
    case 'preso':
      return T.anticipoPreso(e.attuale)
    case 'scaduta':
      return T.anticipoScaduto
    case 'non_trovata':
      return T.anticipoNonTrovato
  }
}

// ---------------------------------------------------------------------
// 4. Scadenze (ogni minuto)
// ---------------------------------------------------------------------
export async function elaboraScadenze(ctx: ContestoAnticipo): Promise<number> {
  const ora = oraDi(ctx)
  let gestite = 0
  // proposte inviate senza risposta in tempo → candidata successiva
  const scadute = verifica(
    await ctx.db.from('proposte_anticipo').select('id, slot_id').eq('stato', 'inviata').lt('scade_il', versoIso(ora)),
  )
  for (const p of scadute) {
    await scadi(ctx, p.id, p.slot_id)
    gestite++
  }
  // proposte manuali mai inviate da Ilenia, ormai troppo vicine all'orario → posto chiuso
  const daInviare = verifica(
    await ctx.db.from('proposte_anticipo').select('id, slot_id, nuovo_inizio, operatrice_id').eq('stato', 'da_inviare'),
  )
  for (const p of daInviare) {
    const imp = await impostazioni(ctx, p.operatrice_id)
    if (Date.parse(p.nuovo_inizio) - imp.lista_attesa_preavviso_minimo_min * MINUTO > ora.toMillis()) continue
    senzaErrori(await ctx.db.from('proposte_anticipo').update({ stato: 'annullata' }).eq('id', p.id).eq('stato', 'da_inviare'))
    senzaErrori(await ctx.db.from('slot_liberati').update({ stato: 'esaurito' }).eq('id', p.slot_id).eq('stato', 'aperto'))
    gestite++
  }
  return gestite
}

/** Ilenia chiude a mano un posto (es. l'ha riempito lei): stop alle proposte. */
export async function chiudiSlot(ctx: ContestoAnticipo, operatriceId: string, slotId: string): Promise<void> {
  senzaErrori(
    await ctx.db
      .from('proposte_anticipo')
      .update({ stato: 'annullata' })
      .eq('slot_id', slotId)
      .eq('operatrice_id', operatriceId)
      .in('stato', APERTE),
  )
  senzaErrori(
    await ctx.db.from('slot_liberati').update({ stato: 'annullato' }).eq('id', slotId).eq('operatrice_id', operatriceId).eq('stato', 'aperto'),
  )
}

/** Codice in un messaggio scritto, es. «ACCETTO K7P2Q» → "K7P2Q". */
export function codiceAccettazione(testo: string): string | null {
  const m = /(?:^|\s)accetto\s+([a-z0-9]{4,8})\b/i.exec(testo.trim())
  return m ? m[1]!.toUpperCase() : null
}
