/**
 * Azioni del pannello che scrivono alla cliente: approvare o rifiutare
 * una richiesta, rispondere a mano.
 *
 * Regole di costo (vedi piano):
 * - finestra di 24 ore aperta → messaggio libero (gratuito);
 * - finestra chiusa → template solo per la conferma (a pagamento,
 *   segnalato nel pannello); per il rifiuto e le risposte a mano niente
 *   template: il pannello offre un link wa.me da usare dal telefono.
 *
 * Girano nel Worker (con la chiave segreta, dopo aver verificato chi è
 * l'operatrice) e nella demo (dati finti nel browser).
 */
import type { DateTime } from 'luxon'
import { linkWhatsApp } from '../telefono'
import { adesso as adessoRoma, daIso, dataOraLunga } from '../tempo'
import { statoFinestra } from '../whatsapp/finestra'
import type { MessaggioUscita } from '../whatsapp/messaggi'
import { liberaSlot, rispondiProposta, testoEsito, type EsitoRisposta } from './anticipo'
import { inviaERegistra, senzaErrori, verifica, verificaForse, type Canale, type Db, type Notifica } from './comune'
import { TEMPLATE, TESTI as T } from './testi'

export interface ContestoAzioni {
  db: Db
  canale: Canale
  adesso?: () => DateTime
  notifica?: (n: Notifica) => void | Promise<void>
}

export type EsitoInvio =
  | { inviato: 'libero' }
  | { inviato: 'template' }
  | { inviato: 'no'; motivo: 'senza_telefono' | 'finestra_chiusa'; link?: string }

export class ErroreAzione extends Error {
  constructor(
    readonly codice: 'non_trovato' | 'gia_gestita' | 'finestra_chiusa' | 'testo_non_valido',
    messaggio: string,
    readonly link?: string,
  ) {
    super(messaggio)
  }
}

interface Destinatario {
  clienteId: string
  telefono: string | null
}

/** Testo semplice di un messaggio (per il link wa.me). */
function testoSemplice(m: MessaggioUscita): string {
  return m.tipo === 'template' ? m.anteprima : m.testo
}

/**
 * Invia rispettando la finestra di 24 ore: libero se aperta, altrimenti il
 * template (se previsto), altrimenti niente e un link wa.me.
 */
export async function inviaConFinestra(
  ctx: ContestoAzioni,
  dest: Destinatario,
  libero: MessaggioUscita,
  template?: MessaggioUscita,
): Promise<EsitoInvio> {
  if (!dest.telefono) return { inviato: 'no', motivo: 'senza_telefono' }
  const ora = (ctx.adesso ?? adessoRoma)()
  const conv = verificaForse(
    await ctx.db
      .from('conversazioni')
      .select('ultimo_messaggio_cliente_il')
      .eq('cliente_id', dest.clienteId)
      .maybeSingle(),
  )
  const telefono = dest.telefono
  if (statoFinestra(conv?.ultimo_messaggio_cliente_il, ora).aperta) {
    await inviaERegistra(ctx.db, ctx.canale, { clienteId: dest.clienteId, telefono }, libero)
    return { inviato: 'libero' }
  }
  if (template) {
    await inviaERegistra(ctx.db, ctx.canale, { clienteId: dest.clienteId, telefono }, template)
    return { inviato: 'template' }
  }
  return { inviato: 'no', motivo: 'finestra_chiusa', link: linkWhatsApp(telefono, testoSemplice(libero)) }
}

async function caricaRichiesta(ctx: ContestoAzioni, operatriceId: string, appuntamentoId: string) {
  const app = verificaForse(
    await ctx.db
      .from('appuntamenti')
      .select('*, clienti(*), servizi(nome)')
      .eq('id', appuntamentoId)
      .eq('operatrice_id', operatriceId)
      .maybeSingle(),
  )
  if (!app) throw new ErroreAzione('non_trovato', 'Richiesta non trovata.')
  if (app.stato !== 'in_attesa') throw new ErroreAzione('gia_gestita', 'Questa richiesta è già stata gestita.')
  const operatrice = verifica(await ctx.db.from('operatrici').select('nome').eq('id', operatriceId).single())
  return {
    app,
    operatrice: operatrice.nome,
    servizio: app.servizi?.nome ?? 'il tuo appuntamento',
    quando: dataOraLunga(daIso(app.inizio)),
    nomeBreve: app.clienti?.nome?.split(' ')[0] ?? '',
  }
}

/** Approva una richiesta in attesa e avvisa la cliente. */
export async function approvaRichiesta(
  ctx: ContestoAzioni,
  operatriceId: string,
  appuntamentoId: string,
): Promise<EsitoInvio> {
  const r = await caricaRichiesta(ctx, operatriceId, appuntamentoId)
  // aggiornamento condizionato: se nel frattempo è cambiata, non si tocca
  const aggiornate = verifica(
    await ctx.db
      .from('appuntamenti')
      .update({ stato: 'confermato' })
      .eq('id', appuntamentoId)
      .eq('stato', 'in_attesa')
      .select('id'),
  )
  if (aggiornate.length === 0) throw new ErroreAzione('gia_gestita', 'Questa richiesta è già stata gestita.')

  const testo = T.confermataDaIlenia(r.operatrice, r.servizio, r.quando)
  const esito = await inviaConFinestra(
    ctx,
    { clienteId: r.app.cliente_id, telefono: r.app.clienti?.telefono ?? null },
    { tipo: 'testo', testo },
    {
      tipo: 'template',
      nome: TEMPLATE.conferma,
      lingua: TEMPLATE.lingua,
      parametri: [r.nomeBreve || 'ciao', r.servizio, r.quando],
      anteprima: testo,
    },
  )
  if (esito.inviato === 'template') {
    senzaErrori(await ctx.db.from('appuntamenti').update({ conferma_via_template: true }).eq('id', appuntamentoId))
  }
  return esito
}

/** Rifiuta una richiesta in attesa; avvisa la cliente se la finestra è aperta. */
export async function rifiutaRichiesta(
  ctx: ContestoAzioni,
  operatriceId: string,
  appuntamentoId: string,
  motivo?: string | null,
): Promise<EsitoInvio> {
  const r = await caricaRichiesta(ctx, operatriceId, appuntamentoId)
  const motivoPulito = motivo?.trim().slice(0, 300) || null
  const aggiornate = verifica(
    await ctx.db
      .from('appuntamenti')
      .update({ stato: 'rifiutato', motivo_rifiuto: motivoPulito })
      .eq('id', appuntamentoId)
      .eq('stato', 'in_attesa')
      .select('id'),
  )
  if (aggiornate.length === 0) throw new ErroreAzione('gia_gestita', 'Questa richiesta è già stata gestita.')
  senzaErrori(await ctx.db.from('lista_attesa').update({ attiva: false }).eq('appuntamento_id', appuntamentoId))
  // il posto che la richiesta teneva occupato torna disponibile per la lista d'attesa
  await liberaSlot(ctx, { operatriceId, inizio: r.app.inizio, fine: r.app.fine, origineAppuntamentoId: appuntamentoId })

  return inviaConFinestra(
    ctx,
    { clienteId: r.app.cliente_id, telefono: r.app.clienti?.telefono ?? null },
    {
      tipo: 'pulsanti',
      testo: T.rifiutataDaIlenia(r.operatrice, r.servizio, r.quando, motivoPulito),
      pulsanti: [{ id: 'menu:prenota', titolo: T.pulsanteAltroOrario }],
    },
  )
}

/** Risposta scritta a mano da Ilenia: solo dentro la finestra di 24 ore. */
export async function rispondiCliente(ctx: ContestoAzioni, clienteId: string, testo: string): Promise<EsitoInvio> {
  const pulito = testo.trim()
  if (!pulito || pulito.length > 4000) throw new ErroreAzione('testo_non_valido', 'Scrivi un messaggio (massimo 4000 caratteri).')
  const cliente = verificaForse(await ctx.db.from('clienti').select('id, telefono').eq('id', clienteId).maybeSingle())
  if (!cliente) throw new ErroreAzione('non_trovato', 'Cliente non trovata.')
  const esito = await inviaConFinestra(ctx, { clienteId, telefono: cliente.telefono }, { tipo: 'testo', testo: pulito })
  if (esito.inviato === 'no' && esito.motivo === 'finestra_chiusa') {
    throw new ErroreAzione(
      'finestra_chiusa',
      'Sono passate più di 24 ore dall\'ultimo messaggio della cliente: scrivile dal tuo telefono.',
      esito.link,
    )
  }
  return esito
}

/** Toglie la pausa "operatore": il bot torna a rispondere a questa cliente. */
export async function riattivaBot(db: Db, clienteId: string): Promise<void> {
  senzaErrori(
    await db
      .from('conversazioni')
      .update({ bot_in_pausa_fino_al: null, stato: 'menu', contesto: {} })
      .eq('cliente_id', clienteId),
  )
}

/** Disdetta decisa da Ilenia dall'agenda; se richiesto, il posto va alla lista d'attesa. */
export async function disdiciDalPannello(
  ctx: ContestoAzioni,
  operatriceId: string,
  appuntamentoId: string,
  proponi: boolean,
): Promise<{ proposto: boolean }> {
  const aggiornati = verifica(
    await ctx.db
      .from('appuntamenti')
      .update({ stato: 'disdetto' })
      .eq('id', appuntamentoId)
      .eq('operatrice_id', operatriceId)
      .in('stato', ['in_attesa', 'confermato'])
      .select('id, inizio, fine'),
  )
  const app = aggiornati[0]
  if (!app) throw new ErroreAzione('gia_gestita', 'Questo appuntamento non è più attivo.')
  senzaErrori(await ctx.db.from('lista_attesa').update({ attiva: false }).eq('appuntamento_id', appuntamentoId))
  if (!proponi) return { proposto: false }
  const slot = await liberaSlot(ctx, { operatriceId, inizio: app.inizio, fine: app.fine, origineAppuntamentoId: app.id })
  if (!slot) return { proposto: false }
  // proposto davvero solo se c'era una candidata (altrimenti il posto risulta «esaurito»)
  const stato = verificaForse(await ctx.db.from('slot_liberati').select('stato').eq('id', slot).maybeSingle())
  return { proposto: stato?.stato === 'aperto' }
}

/**
 * Lista d'attesa manuale: Ilenia segna la risposta che la cliente le ha dato
 * sul suo telefono. Se accetta, l'appuntamento si sposta (e la cliente, se ha
 * scritto al bot nelle ultime 24 ore, riceve la conferma gratis).
 */
export async function segnaRispostaProposta(
  ctx: ContestoAzioni,
  operatriceId: string,
  propostaId: string,
  accettata: boolean,
): Promise<EsitoRisposta> {
  return rispondiProposta(ctx, { propostaId, operatriceId }, accettata, async (esito) => {
    if (esito.esito === 'accettata') {
      await inviaConFinestra(ctx, { clienteId: esito.clienteId, telefono: esito.telefono }, { tipo: 'testo', testo: testoEsito(esito) })
    }
  })
}
