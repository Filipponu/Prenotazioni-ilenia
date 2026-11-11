/**
 * Motore del bot WhatsApp: riceve un evento (messaggio della cliente o
 * stato di consegna), aggiorna lo stato della conversazione nel database
 * e risponde con messaggi liberi o interattivi (mai template: si risponde
 * sempre dentro la finestra di 24 ore aperta dal messaggio della cliente).
 *
 * È indipendente dall'ambiente: gira nel Worker Cloudflare (Supabase vero,
 * API di Meta) e nel simulatore della demo (dati finti, chat a schermo).
 *
 * Flusso di prenotazione:
 *   menu → servizio → giorno → orario → (nome) → riepilogo → conferma
 *        → «Se si libera un posto prima, vuoi essere avvisata?»
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DateTime } from 'luxon'
import { giorniLiberi, inOccupati, slotDelGiorno, slotLibero, type ParametriDisponibilita } from '../disponibilita'
import {
  adesso as adessoRoma,
  daDataOra,
  daIso,
  dataIso,
  dataLunga,
  dataOraLunga,
  durataLeggibile,
  oraBreve,
  prezzoLeggibile,
  versoIso,
} from '../tempo'
import type {
  Cliente,
  Conversazione,
  Database,
  Impostazioni,
  Json,
  Servizio,
  StatoAppuntamento,
  TipoMessaggio,
} from '../tipi-db'
import type { MessaggioUscita, RigaLista } from '../whatsapp/messaggi'
import type { ContenutoIngresso, EventoWhatsApp } from '../whatsapp/webhook'
import { TESTI as T } from './testi'

export type Db = SupabaseClient<Database>

/** Dove finiscono i messaggi del bot: API di Meta, simulatore, test. */
export interface Canale {
  invia(telefono: string, messaggio: MessaggioUscita): Promise<{ id: string | null }>
}

/** Avvisi per Ilenia (in seguito: notifiche push / email). */
export type Notifica =
  | { tipo: 'richiesta'; appuntamentoId: string; confermata: boolean; cliente: string; servizio: string; quando: string }
  | { tipo: 'operatore'; cliente: string; telefono: string }
  | { tipo: 'messaggio'; cliente: string; telefono: string; testo: string }

export interface ContestoBot {
  db: Db
  canale: Canale
  /** orologio (sostituibile nei test) */
  adesso?: () => DateTime
  /** operatrice servita dal numero; se assente, la prima attiva */
  operatriceId?: string | null
  notifica?: (n: Notifica) => void | Promise<void>
}

type Stato =
  | 'menu'
  | 'prenota_servizio'
  | 'prenota_giorno'
  | 'prenota_ora'
  | 'prenota_nome'
  | 'prenota_riepilogo'
  | 'chiedi_anticipo'
  | 'operatore'

interface DatiConversazione {
  servizioId?: string
  giorno?: string
  inizio?: string
  appuntamentoId?: string
  /** ultimo aggiornamento scritto dal bot (per la scadenza) */
  agg?: string
}

/** Dopo mezz'ora di silenzio una conversazione a metà riparte dal menu. */
const SCADENZA_MINUTI = 30
const STATI_ATTIVI: StatoAppuntamento[] = ['in_attesa', 'confermato']

type Risultato = { data: unknown; error: { message: string; code?: string } | null }

/** Risultato di una query che deve restituire dati (errore altrimenti). */
function verifica<R extends Risultato>(r: R): NonNullable<R['data']> {
  if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  if (r.data === null || r.data === undefined) throw new Error('Nessun dato restituito')
  return r.data as NonNullable<R['data']>
}

/** Risultato di .maybeSingle(): può essere null. */
function verificaForse<R extends Risultato>(r: R): R['data'] {
  if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data
}

/** Risultato di update/insert senza dati richiesti indietro. */
function senzaErrori(r: { error: { message: string; code?: string } | null }): void {
  if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code })
}

function normalizza(testo: string): string {
  return testo.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function contieneParola(testo: string, parola: string): boolean {
  const p = normalizza(parola.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return p.length > 0 && new RegExp(`(^|[^\\p{L}])${p}([^\\p{L}]|$)`, 'u').test(normalizza(testo))
}

function maiuscolaIniziale(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Nome digitato dalla cliente → "Maria Rossi", oppure null se non sembra un nome. */
export function pulisciNome(testo: string): string | null {
  const s = testo.replace(/\s+/g, ' ').trim()
  if (!/^\p{L}[\p{L}' .-]{1,59}$/u.test(s)) return null
  if ((s.match(/\p{L}/gu) ?? []).length < 2) return null
  const tuttoUguale = s === s.toLowerCase() || s === s.toUpperCase()
  return tuttoUguale ? s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()) : s
}

function tipoIngresso(c: ContenutoIngresso): TipoMessaggio {
  return c.tipo === 'testo' ? 'testo' : c.tipo === 'scelta' ? 'interattivo' : 'media'
}

// ---------------------------------------------------------------------
// Ingresso
// ---------------------------------------------------------------------
export async function gestisciEvento(ctx: ContestoBot, evento: EventoWhatsApp): Promise<void> {
  if (evento.tipo === 'stato') {
    await ctx.db
      .from('log_messaggi')
      .update({ stato_consegna: evento.stato, errore: evento.errore })
      .eq('wa_message_id', evento.id)
    return
  }

  const ora = (ctx.adesso ?? adessoRoma)()
  const cliente = await trovaOCreaCliente(ctx.db, evento.da)

  // registro + deduplica: Meta può rimandare lo stesso messaggio più volte
  const registrato = await ctx.db.from('log_messaggi').insert({
    direzione: 'in',
    cliente_id: cliente.id,
    telefono: evento.da,
    wa_message_id: evento.id || null,
    tipo: tipoIngresso(evento.contenuto),
    costo: 'entrata',
    contenuto: evento.contenuto as unknown as Json,
  })
  if (registrato.error) {
    if (registrato.error.code === '23505') return
    throw new Error(registrato.error.message)
  }

  const operatrice = await caricaOperatrice(ctx)
  const impostazioni = verifica(
    await ctx.db.from('impostazioni').select('*').eq('operatrice_id', operatrice.id).single(),
  )
  const conversazione = await trovaOCreaConversazione(ctx.db, cliente.id)
  const aggiornata = verifica(
    await ctx.db
      .from('conversazioni')
      .update({ ultimo_messaggio_cliente_il: versoIso(ora) })
      .eq('id', conversazione.id)
      .select('*')
      .single(),
  )

  await new Turno(ctx, ora, cliente, aggiornata, operatrice, impostazioni).gestisci(evento.contenuto)
}

async function trovaOCreaCliente(db: Db, telefono: string): Promise<Cliente> {
  const esistente = verificaForse(await db.from('clienti').select('*').eq('telefono', telefono).maybeSingle())
  if (esistente) return esistente
  const nuova = await db.from('clienti').insert({ telefono }).select('*').single()
  if (nuova.error?.code === '23505') {
    return verifica(await db.from('clienti').select('*').eq('telefono', telefono).single())
  }
  return verifica(nuova)
}

async function trovaOCreaConversazione(db: Db, clienteId: string): Promise<Conversazione> {
  const esistente = verificaForse(await db.from('conversazioni').select('*').eq('cliente_id', clienteId).maybeSingle())
  if (esistente) return esistente
  const nuova = await db.from('conversazioni').insert({ cliente_id: clienteId }).select('*').single()
  if (nuova.error?.code === '23505') {
    return verifica(await db.from('conversazioni').select('*').eq('cliente_id', clienteId).single())
  }
  return verifica(nuova)
}

async function caricaOperatrice(ctx: ContestoBot): Promise<{ id: string; nome: string }> {
  const q = ctx.db.from('operatrici').select('id, nome')
  const r = ctx.operatriceId
    ? await q.eq('id', ctx.operatriceId).maybeSingle()
    : await q.eq('attiva', true).order('creato_il').limit(1).maybeSingle()
  const op = verificaForse(r)
  if (!op) throw new Error('Nessuna operatrice attiva a cui collegare il bot')
  return op
}

// ---------------------------------------------------------------------
// Un turno: risposta a un singolo messaggio della cliente
// ---------------------------------------------------------------------
class Turno {
  constructor(
    private readonly ctx: ContestoBot,
    private readonly ora: DateTime,
    private cliente: Cliente,
    private readonly conversazione: Conversazione,
    private readonly operatrice: { id: string; nome: string },
    private readonly imp: Impostazioni,
  ) {}

  private get db() {
    return this.ctx.db
  }

  private get telefono(): string {
    return this.cliente.telefono ?? ''
  }

  private get nomeCliente(): string {
    return this.cliente.nome ?? this.telefono
  }

  async gestisci(c: ContenutoIngresso) {
    // modalità operatore: il bot tace, Ilenia risponde a mano
    const pausa = this.conversazione.bot_in_pausa_fino_al
    if (pausa && Date.parse(pausa) > this.ora.toMillis()) {
      await this.ctx.notifica?.({
        tipo: 'messaggio',
        cliente: this.nomeCliente,
        telefono: this.telefono,
        testo: c.tipo === 'testo' ? c.testo : c.tipo === 'scelta' ? c.titolo : `(${c.descrizione})`,
      })
      return
    }

    const testo = c.tipo === 'testo' ? c.testo.trim() : ''
    if (testo && contieneParola(testo, this.imp.parola_operatore)) return this.operatore()

    let stato = (this.conversazione.stato as Stato) || 'menu'
    let dati = (this.conversazione.contesto ?? {}) as DatiConversazione
    const scaduta = !dati.agg || this.ora.toMillis() - Date.parse(dati.agg) > SCADENZA_MINUTI * 60_000
    if (stato !== 'menu' && scaduta) {
      stato = 'menu'
      dati = {}
    }

    if (c.tipo === 'scelta') return this.scelta(c.id, stato, dati)

    if (c.tipo === 'testo') {
      if (stato === 'prenota_nome') return this.nome(testo, dati)
      const t = normalizza(testo)
      if (/(^|\s)prenot/.test(t)) return this.mostraServizi()
      if (/(^|\s)spost/.test(t)) return this.inArrivo('spostare')
      if (/(^|\s)(disdi|annull)/.test(t)) return this.inArrivo('disdire')
    }

    // qualunque altra cosa: menu iniziale
    return this.menu(c.tipo === 'altro' ? T.nonLeggo : undefined)
  }

  // ----- scelte da pulsanti e liste
  private async scelta(id: string, stato: Stato, dati: DatiConversazione) {
    const [chiave = '', ...resto] = id.split(':')
    const valore = resto.join(':')
    switch (chiave) {
      case 'menu':
        if (valore === 'prenota') return this.mostraServizi()
        if (valore === 'sposta') return this.inArrivo('spostare')
        if (valore === 'disdici') return this.inArrivo('disdire')
        return this.menu()
      case 'srv-pag':
        return this.mostraServizi(Number(valore) || 0)
      case 'srv': {
        const servizio = await this.servizio(valore)
        return servizio ? this.mostraGiorni(servizio) : undefined
      }
      case 'giorni-da':
      case 'giorno':
      case 'ore-pag':
      case 'cambia-giorno':
      case 'ora': {
        if (!dati.servizioId) return this.mostraServizi()
        const servizio = await this.servizio(dati.servizioId)
        if (!servizio) return
        if (chiave === 'giorni-da') return this.mostraGiorni(servizio, valore)
        if (chiave === 'cambia-giorno') return this.mostraGiorni(servizio)
        if (chiave === 'giorno') return this.mostraOre(servizio, valore, 0)
        if (chiave === 'ore-pag') return this.mostraOre(servizio, dati.giorno ?? '', Number(valore) || 0)
        return this.scegliOra(servizio, valore)
      }
      case 'conferma': {
        if (stato !== 'prenota_riepilogo' || !dati.servizioId || !dati.inizio) return this.menu()
        if (valore === 'annulla') {
          await this.invia({ tipo: 'testo', testo: T.annullata })
          return this.salva('menu', {})
        }
        const servizio = await this.servizio(dati.servizioId)
        if (!servizio) return
        if (valore === 'cambia') return this.mostraGiorni(servizio)
        return this.conferma(servizio, dati.inizio)
      }
      case 'anticipo':
        if (stato !== 'chiedi_anticipo' || !dati.appuntamentoId) return this.menu()
        return this.anticipo(valore === 'si', dati.appuntamentoId)
      default:
        return this.menu()
    }
  }

  // ----- menu
  private async menu(prefisso?: string) {
    const nome = this.cliente.nome?.split(' ')[0] ?? null
    await this.invia({
      tipo: 'pulsanti',
      testo: `${prefisso ? `${prefisso}\n\n` : ''}${T.menu(nome, this.operatrice.nome)}`,
      piede: T.piedeMenu(this.imp.parola_operatore, this.operatrice.nome),
      pulsanti: [
        { id: 'menu:prenota', titolo: T.pulsantePrenota },
        { id: 'menu:sposta', titolo: T.pulsanteSposta },
        { id: 'menu:disdici', titolo: T.pulsanteDisdici },
      ],
    })
    await this.salva('menu', {})
  }

  private async inArrivo(azione: string) {
    await this.invia({
      tipo: 'testo',
      testo: T.funzioneInArrivo(azione, this.operatrice.nome, this.imp.parola_operatore),
    })
    await this.salva('menu', {})
  }

  private async operatore() {
    const fino = this.ora.plus({ hours: this.imp.ore_pausa_operatore })
    senzaErrori(
      await this.db
        .from('conversazioni')
        .update({ stato: 'operatore', contesto: { agg: versoIso(this.ora) }, bot_in_pausa_fino_al: versoIso(fino) })
        .eq('id', this.conversazione.id),
    )
    await this.invia({ tipo: 'testo', testo: T.operatoreAvvisata(this.operatrice.nome) })
    await this.ctx.notifica?.({ tipo: 'operatore', cliente: this.nomeCliente, telefono: this.telefono })
  }

  // ----- prenotazione
  private async servizio(id: string): Promise<Servizio | null> {
    const s = verificaForse(
      await this.db.from('servizi').select('*').eq('id', id).eq('operatrice_id', this.operatrice.id).maybeSingle(),
    )
    if (s?.attivo) return s
    await this.mostraServizi(0, T.servizioNonDisponibile)
    return null
  }

  private async mostraServizi(pagina = 0, testo: string = T.sceltaServizio) {
    const servizi = verifica(
      await this.db
        .from('servizi')
        .select('*')
        .eq('operatrice_id', this.operatrice.id)
        .eq('attivo', true)
        .order('ordine')
        .order('nome'),
    )
    if (servizi.length === 0) {
      await this.invia({ tipo: 'testo', testo: T.nessunServizio(this.imp.telefono_salone) })
      return this.salva('menu', {})
    }
    const perPagina = servizi.length > 10 ? 9 : 10
    const parte = servizi.slice(pagina * perPagina, (pagina + 1) * perPagina)
    const righe: RigaLista[] = parte.map((s) => ({
      id: `srv:${s.id}`,
      titolo: s.nome,
      descrizione: [durataLeggibile(s.durata_minuti), s.prezzo !== null ? prezzoLeggibile(s.prezzo) : null]
        .filter(Boolean)
        .join(' · '),
    }))
    if ((pagina + 1) * perPagina < servizi.length) righe.push({ id: `srv-pag:${pagina + 1}`, titolo: T.altriServizi })
    await this.invia({ tipo: 'lista', testo, pulsante: T.pulsanteServizi, righe })
    await this.salva('prenota_servizio', {})
  }

  private async mostraGiorni(servizio: Servizio, dal?: string, prefisso?: string) {
    const p = await this.parametri(servizio.durata_minuti)
    const { giorni, altri } = giorniLiberi(p, 9, dal ? daDataOra(dal, '00:00') : undefined)
    if (giorni.length === 0) {
      await this.invia({
        tipo: 'testo',
        testo: T.nessunGiorno(this.imp.giorni_prenotabili, this.operatrice.nome, this.imp.parola_operatore),
      })
      return this.salva('menu', {})
    }
    const righe: RigaLista[] = giorni.map((g) => ({
      id: `giorno:${dataIso(g.giorno)}`,
      titolo: maiuscolaIniziale(g.giorno.toFormat('ccc d LLLL')),
      descrizione: T.orariLiberi(g.slot),
    }))
    if (altri) {
      const ultimo = giorni[giorni.length - 1]!.giorno
      righe.push({ id: `giorni-da:${dataIso(ultimo.plus({ days: 1 }))}`, titolo: T.altriGiorni })
    }
    const testo = T.sceltaGiorno(servizio.nome, durataLeggibile(servizio.durata_minuti))
    await this.invia({
      tipo: 'lista',
      testo: prefisso ? `${prefisso}\n\n${testo}` : testo,
      pulsante: T.pulsanteGiorni,
      righe,
    })
    await this.salva('prenota_giorno', { servizioId: servizio.id })
  }

  private async mostraOre(servizio: Servizio, giorno: string, pagina: number, prefisso?: string) {
    let inizioGiorno: DateTime
    try {
      inizioGiorno = daDataOra(giorno, '00:00')
    } catch {
      return this.mostraGiorni(servizio)
    }
    const p = await this.parametri(servizio.durata_minuti)
    const slot = slotDelGiorno(inizioGiorno, p)
    if (slot.length === 0) return this.mostraGiorni(servizio, undefined, T.giornoPieno)

    // 10 righe al massimo: orari + eventuale «Altri orari» + «Cambia giorno»
    const da = pagina * 8
    const restanti = slot.slice(da)
    const parte = restanti.length > 9 ? restanti.slice(0, 8) : restanti
    const righe: RigaLista[] = parte.map((s) => ({
      id: `ora:${versoIso(s)}`,
      titolo: oraBreve(s),
      descrizione: T.finoAlle(oraBreve(s.plus({ minutes: servizio.durata_minuti }))),
    }))
    if (restanti.length > 9) righe.push({ id: `ore-pag:${pagina + 1}`, titolo: T.altriOrari })
    righe.push({ id: 'cambia-giorno', titolo: T.cambiaGiorno })

    const testo = T.sceltaOra(dataLunga(inizioGiorno))
    await this.invia({ tipo: 'lista', testo: prefisso ? `${prefisso}\n\n${testo}` : testo, pulsante: T.pulsanteOre, righe })
    await this.salva('prenota_ora', { servizioId: servizio.id, giorno })
  }

  private async scegliOra(servizio: Servizio, valore: string) {
    let inizio: DateTime
    try {
      inizio = daIso(valore)
    } catch {
      return this.mostraGiorni(servizio)
    }
    const p = await this.parametri(servizio.durata_minuti)
    if (!slotLibero(inizio, p)) return this.mostraOre(servizio, dataIso(inizio), 0, T.slotPreso)
    if (!this.cliente.nome) {
      await this.invia({ tipo: 'testo', testo: T.chiediNome })
      return this.salva('prenota_nome', { servizioId: servizio.id, inizio: versoIso(inizio) })
    }
    return this.riepilogo(servizio, inizio)
  }

  private async nome(testo: string, dati: DatiConversazione) {
    const nome = pulisciNome(testo)
    if (!nome) {
      await this.invia({ tipo: 'testo', testo: T.nomeNonValido })
      return this.salva('prenota_nome', dati)
    }
    this.cliente = verifica(
      await this.db.from('clienti').update({ nome }).eq('id', this.cliente.id).select('*').single(),
    )
    if (!dati.servizioId || !dati.inizio) return this.menu()
    const servizio = await this.servizio(dati.servizioId)
    if (!servizio) return
    return this.riepilogo(servizio, daIso(dati.inizio))
  }

  private async riepilogo(servizio: Servizio, inizio: DateTime) {
    await this.invia({
      tipo: 'pulsanti',
      testo: T.riepilogo(servizio.nome, durataLeggibile(servizio.durata_minuti), dataOraLunga(inizio), this.nomeCliente),
      pulsanti: [
        { id: 'conferma:si', titolo: T.pulsanteConferma },
        { id: 'conferma:cambia', titolo: T.pulsanteCambiaOrario },
        { id: 'conferma:annulla', titolo: T.pulsanteAnnulla },
      ],
    })
    await this.salva('prenota_riepilogo', { servizioId: servizio.id, inizio: versoIso(inizio) })
  }

  private async conferma(servizio: Servizio, inizioIso: string) {
    const inizio = daIso(inizioIso)
    const p = await this.parametri(servizio.durata_minuti)
    if (!slotLibero(inizio, p)) return this.mostraOre(servizio, dataIso(inizio), 0, T.slotPreso)

    const automatica = this.imp.approvazione === 'automatica'
    const inserito = await this.db
      .from('appuntamenti')
      .insert({
        operatrice_id: this.operatrice.id,
        cliente_id: this.cliente.id,
        servizio_id: servizio.id,
        inizio: versoIso(inizio),
        fine: versoIso(inizio.plus({ minutes: servizio.durata_minuti })),
        stato: automatica ? 'confermato' : 'in_attesa',
        origine: 'whatsapp',
      })
      .select('id')
      .single()
    // il vincolo del database ha l'ultima parola: qualcun altro è arrivato prima
    if (inserito.error?.code === '23P01') return this.mostraOre(servizio, dataIso(inizio), 0, T.slotPreso)
    const { id } = verifica(inserito)

    const quando = dataOraLunga(inizio)
    await this.invia({
      tipo: 'testo',
      testo: automatica
        ? T.prenotazioneConfermata(servizio.nome, quando)
        : T.richiestaRicevuta(this.operatrice.nome, servizio.nome, quando),
    })
    await this.ctx.notifica?.({
      tipo: 'richiesta',
      appuntamentoId: id,
      confermata: automatica,
      cliente: this.nomeCliente,
      servizio: servizio.nome,
      quando,
    })
    await this.invia({
      tipo: 'pulsanti',
      testo: T.domandaAnticipo,
      pulsanti: [
        { id: 'anticipo:si', titolo: T.pulsanteSi },
        { id: 'anticipo:no', titolo: T.pulsanteNo },
      ],
    })
    await this.salva('chiedi_anticipo', { appuntamentoId: id })
  }

  private async anticipo(si: boolean, appuntamentoId: string) {
    if (si) {
      const r = await this.db.from('lista_attesa').insert({
        appuntamento_id: appuntamentoId,
        cliente_id: this.cliente.id,
        operatrice_id: this.operatrice.id,
      })
      if (r.error && r.error.code !== '23505') throw new Error(r.error.message)
    }
    await this.invia({ tipo: 'testo', testo: si ? T.anticipoSi : T.anticipoNo })
    await this.salva('menu', {})
  }

  // ----- supporto
  private async parametri(durataMinuti: number): Promise<ParametriDisponibilita> {
    const da = versoIso(this.ora)
    const a = versoIso(this.ora.plus({ days: this.imp.giorni_prenotabili + 1 }))
    const op = this.operatrice.id
    const [orari, appuntamenti, chiusure, proposte] = await Promise.all([
      this.db.from('orari_settimanali').select('giorno, ora_inizio, ora_fine').eq('operatrice_id', op),
      this.db
        .from('appuntamenti')
        .select('inizio, fine')
        .eq('operatrice_id', op)
        .in('stato', STATI_ATTIVI)
        .lt('inizio', a)
        .gt('fine', da),
      this.db.from('chiusure').select('inizio, fine').eq('operatrice_id', op).lt('inizio', a).gt('fine', da),
      // posti già proposti alla lista d'attesa (Fase 4): restano bloccati finché la proposta è aperta
      this.db
        .from('proposte_anticipo')
        .select('nuovo_inizio, nuova_fine')
        .eq('operatrice_id', op)
        .in('stato', ['da_inviare', 'inviata']),
    ])
    return {
      ora: this.ora,
      durataMinuti,
      passoMinuti: this.imp.passo_slot_min,
      preavvisoMinimoMinuti: this.imp.preavviso_minimo_prenotazione_min,
      giorniPrenotabili: this.imp.giorni_prenotabili,
      orari: verifica(orari),
      occupati: [
        ...inOccupati(verifica(appuntamenti)),
        ...inOccupati(verifica(chiusure)),
        ...inOccupati(verifica(proposte).map((x) => ({ inizio: x.nuovo_inizio, fine: x.nuova_fine }))),
      ],
    }
  }

  private async invia(m: MessaggioUscita) {
    const { id } = await this.ctx.canale.invia(this.telefono, m)
    await this.db.from('log_messaggi').insert({
      direzione: 'out',
      cliente_id: this.cliente.id,
      telefono: this.telefono,
      wa_message_id: id,
      tipo: m.tipo === 'testo' ? 'testo' : m.tipo === 'template' ? 'template' : 'interattivo',
      costo: m.tipo === 'template' ? 'template' : 'libero',
      contenuto: m as unknown as Json,
    })
  }

  private async salva(stato: Stato, dati: DatiConversazione) {
    senzaErrori(
      await this.db
        .from('conversazioni')
        .update({ stato, contesto: { ...dati, agg: versoIso(this.ora) } as unknown as Json })
        .eq('id', this.conversazione.id),
    )
  }
}
