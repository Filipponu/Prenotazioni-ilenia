/**
 * Motore del bot WhatsApp: riceve un evento (messaggio della cliente o
 * stato di consegna), aggiorna lo stato della conversazione nel database
 * e risponde con messaggi liberi o interattivi (mai template: si risponde
 * sempre dentro la finestra di 24 ore aperta dal messaggio della cliente).
 *
 * È indipendente dall'ambiente: gira nel Worker Cloudflare (Supabase vero,
 * API di Meta) e nel simulatore della demo (dati finti, chat a schermo).
 *
 * Flussi:
 *   Prenota: menu → servizio → giorno → orario → (nome) → riepilogo → conferma
 *            → «Se si libera un posto prima, vuoi essere avvisata?»
 *   Sposta:  menu → appuntamento → (limite ore) → giorno → orario → riepilogo → fatto
 *   Disdici: menu → appuntamento → (limite ore) → conferma → fatto
 */
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
import type { Cliente, Conversazione, Impostazioni, Json, Servizio, StatoAppuntamento, TipoMessaggio } from '../tipi-db'
import type { MessaggioUscita, RigaLista } from '../whatsapp/messaggi'
import type { ContenutoIngresso, EventoWhatsApp } from '../whatsapp/webhook'
import { codiceAccettazione, liberaSlot, rispondiProposta, testoEsito } from './anticipo'
import { inviaERegistra, senzaErrori, verifica, verificaForse, type Canale, type Db, type Notifica } from './comune'
import { TESTI as T } from './testi'

export type { Canale, Db, Notifica } from './comune'

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
  | 'sposta_scegli'
  | 'disdici_scegli'
  | 'disdici_conferma'
  | 'operatore'

interface DatiConversazione {
  servizioId?: string
  giorno?: string
  inizio?: string
  appuntamentoId?: string
  /** appuntamento che si sta spostando (giorno/orario/riepilogo servono allo spostamento) */
  spostaId?: string
  /** ultimo aggiornamento scritto dal bot (per la scadenza) */
  agg?: string
}

/** Dopo mezz'ora di silenzio una conversazione a metà riparte dal menu. */
const SCADENZA_MINUTI = 30
const STATI_ATTIVI: StatoAppuntamento[] = ['in_attesa', 'confermato']

/** Ciò che si prenota o si sposta: un servizio, o la durata di un appuntamento esistente. */
type Prodotto = Pick<Servizio, 'id' | 'nome' | 'durata_minuti'>

interface AppuntamentoCliente {
  id: string
  inizio: string
  fine: string
  stato: StatoAppuntamento
  servizio_id: string | null
  servizi: { nome: string } | null
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
      .update({
        stato_consegna: evento.stato,
        errore: evento.errore,
        // costo reale dichiarato da Meta (presente sugli stati "sent"/"delivered")
        ...(evento.fatturazione
          ? { fatturato: evento.fatturazione.fatturabile, categoria_meta: evento.fatturazione.categoria }
          : {}),
      })
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
    // risposta a una proposta della lista d'attesa (pulsanti o «ACCETTO <codice>»): vale sempre
    const sceltaAnticipo = c.tipo === 'scelta' ? /^anticipo-(ok|no):([A-Z0-9]{4,8})$/i.exec(c.id) : null
    if (sceltaAnticipo) return this.rispostaAnticipo(sceltaAnticipo[2]!, sceltaAnticipo[1] === 'ok')
    const codiceScritto = c.tipo === 'testo' ? codiceAccettazione(c.testo) : null
    if (codiceScritto) return this.rispostaAnticipo(codiceScritto, true)

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
      if (/(^|\s)spost/.test(t)) return this.iniziaSposta()
      if (/(^|\s)(disdi|annull)/.test(t)) return this.iniziaDisdici()
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
        if (valore === 'sposta') return this.iniziaSposta()
        if (valore === 'disdici') return this.iniziaDisdici()
        return this.menu()
      case 'app-sposta':
        return this.sposta(valore)
      case 'app-disdici':
        return this.chiediDisdetta(valore)
      case 'disdetta':
        if (stato !== 'disdici_conferma' || !dati.appuntamentoId) return this.menu()
        return valore === 'si' ? this.disdici(dati.appuntamentoId) : this.annullaDisdetta()
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
        if (!dati.spostaId && !dati.servizioId) return this.mostraServizi()
        const prodotto = dati.spostaId
          ? await this.prodottoDaSpostare(dati.spostaId)
          : await this.servizio(dati.servizioId ?? '')
        if (!prodotto) return
        const sposta = dati.spostaId
        if (chiave === 'giorni-da') return this.mostraGiorni(prodotto, { dal: valore, sposta })
        if (chiave === 'cambia-giorno') return this.mostraGiorni(prodotto, { sposta })
        if (chiave === 'giorno') return this.mostraOre(prodotto, valore, 0, { sposta })
        if (chiave === 'ore-pag') return this.mostraOre(prodotto, dati.giorno ?? '', Number(valore) || 0, { sposta })
        return this.scegliOra(prodotto, valore, sposta)
      }
      case 'conferma': {
        if (stato !== 'prenota_riepilogo' || !dati.inizio || (!dati.servizioId && !dati.spostaId)) return this.menu()
        if (valore === 'annulla') {
          await this.invia({ tipo: 'testo', testo: dati.spostaId ? T.spostamentoAnnullato : T.annullata })
          return this.salva('menu', {})
        }
        const prodotto = dati.spostaId
          ? await this.prodottoDaSpostare(dati.spostaId)
          : await this.servizio(dati.servizioId ?? '')
        if (!prodotto) return
        if (valore === 'cambia') return this.mostraGiorni(prodotto, { sposta: dati.spostaId })
        return dati.spostaId ? this.eseguiSpostamento(dati.spostaId, dati.inizio) : this.conferma(prodotto, dati.inizio)
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

  private async mostraGiorni(servizio: Prodotto, opz: { dal?: string; prefisso?: string; sposta?: string } = {}) {
    const { dal, prefisso, sposta } = opz
    const p = await this.parametri(servizio.durata_minuti, sposta)
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
    await this.salva('prenota_giorno', { servizioId: servizio.id, spostaId: sposta })
  }

  private async mostraOre(
    servizio: Prodotto,
    giorno: string,
    pagina: number,
    opz: { prefisso?: string; sposta?: string } = {},
  ) {
    const { prefisso, sposta } = opz
    let inizioGiorno: DateTime
    try {
      inizioGiorno = daDataOra(giorno, '00:00')
    } catch {
      return this.mostraGiorni(servizio, { sposta })
    }
    const p = await this.parametri(servizio.durata_minuti, sposta)
    const slot = slotDelGiorno(inizioGiorno, p)
    if (slot.length === 0) return this.mostraGiorni(servizio, { prefisso: T.giornoPieno, sposta })

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
    await this.salva('prenota_ora', { servizioId: servizio.id, giorno, spostaId: sposta })
  }

  private async scegliOra(servizio: Prodotto, valore: string, sposta?: string) {
    let inizio: DateTime
    try {
      inizio = daIso(valore)
    } catch {
      return this.mostraGiorni(servizio, { sposta })
    }
    const p = await this.parametri(servizio.durata_minuti, sposta)
    if (!slotLibero(inizio, p)) return this.mostraOre(servizio, dataIso(inizio), 0, { prefisso: T.slotPreso, sposta })
    if (sposta) return this.riepilogoSpostamento(servizio, sposta, inizio)
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

  private async riepilogo(servizio: Prodotto, inizio: DateTime) {
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

  private async conferma(servizio: Prodotto, inizioIso: string) {
    const inizio = daIso(inizioIso)
    const p = await this.parametri(servizio.durata_minuti)
    if (!slotLibero(inizio, p)) return this.mostraOre(servizio, dataIso(inizio), 0, { prefisso: T.slotPreso })

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
    if (inserito.error?.code === '23P01') return this.mostraOre(servizio, dataIso(inizio), 0, { prefisso: T.slotPreso })
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

  // ----- lista d'attesa
  private async rispostaAnticipo(codice: string, accetta: boolean) {
    let risposto = false
    const rispondi = async (e: Parameters<typeof testoEsito>[0]) => {
      if (risposto) return
      risposto = true
      await this.invia({ tipo: 'testo', testo: testoEsito(e) })
    }
    const esito = await rispondiProposta(this.ctx, { codice, clienteId: this.cliente.id }, accetta, rispondi)
    await rispondi(esito)
    await this.salva('menu', {})
  }

  /** Propone il posto liberato alla lista d'attesa (un errore qui non blocca la cliente). */
  private async proponiPosto(a: { id: string; inizio: string; fine: string }) {
    try {
      await liberaSlot(this.ctx, { operatriceId: this.operatrice.id, inizio: a.inizio, fine: a.fine, origineAppuntamentoId: a.id })
    } catch (e) {
      console.error('Lista d\'attesa: impossibile proporre il posto liberato', e)
    }
  }

  // ----- sposta e disdici
  private async appuntamentiFuturi(): Promise<AppuntamentoCliente[]> {
    return verifica(
      await this.db
        .from('appuntamenti')
        .select('id, inizio, fine, stato, servizio_id, servizi(nome)')
        .eq('cliente_id', this.cliente.id)
        .eq('operatrice_id', this.operatrice.id)
        .in('stato', STATI_ATTIVI)
        .gt('inizio', versoIso(this.ora))
        .order('inizio')
        .limit(10),
    )
  }

  private async appuntamento(id: string): Promise<AppuntamentoCliente | null> {
    const a = verificaForse(
      await this.db
        .from('appuntamenti')
        .select('id, inizio, fine, stato, servizio_id, servizi(nome)')
        .eq('id', id)
        .eq('cliente_id', this.cliente.id)
        .eq('operatrice_id', this.operatrice.id)
        .maybeSingle(),
    )
    if (!a || !STATI_ATTIVI.includes(a.stato) || Date.parse(a.inizio) <= this.ora.toMillis()) return null
    return a
  }

  /** true se l'appuntamento è ancora oltre il limite di ore per modificarlo. */
  private modificabile(a: AppuntamentoCliente): boolean {
    return Date.parse(a.inizio) - this.ora.toMillis() >= this.imp.ore_limite_modifica * 3_600_000
  }

  private async rispostaTroppoTardi() {
    await this.invia({
      tipo: 'testo',
      testo: T.troppoTardi(
        this.imp.ore_limite_modifica,
        this.imp.telefono_salone,
        this.operatrice.nome,
        this.imp.parola_operatore,
      ),
    })
    await this.salva('menu', {})
  }

  private async nonDisponibile() {
    await this.invia({ tipo: 'testo', testo: T.appuntamentoNonDisponibile })
    await this.salva('menu', {})
  }

  /** Lista degli appuntamenti futuri da cui scegliere (o salta se ce n'è uno solo). */
  private async scegliAppuntamento(azione: 'sposta' | 'disdici') {
    const futuri = await this.appuntamentiFuturi()
    if (futuri.length === 0) {
      await this.invia({ tipo: 'testo', testo: T.nessunAppuntamento })
      return this.salva('menu', {})
    }
    if (futuri.length === 1) return azione === 'sposta' ? this.sposta(futuri[0]!.id) : this.chiediDisdetta(futuri[0]!.id)
    await this.invia({
      tipo: 'lista',
      testo: azione === 'sposta' ? T.sceltaAppuntamentoSposta : T.sceltaAppuntamentoDisdici,
      pulsante: T.pulsanteAppuntamenti,
      righe: futuri.map((a) => {
        const inizio = daIso(a.inizio)
        return {
          id: `app-${azione}:${a.id}`,
          titolo: `${maiuscolaIniziale(inizio.toFormat('ccc d LLL'))} ${oraBreve(inizio)}`,
          descrizione: [a.servizi?.nome, a.stato === 'in_attesa' ? T.inAttesaDiConferma : null].filter(Boolean).join(' · '),
        }
      }),
    })
    await this.salva(azione === 'sposta' ? 'sposta_scegli' : 'disdici_scegli', {})
  }

  private iniziaSposta() {
    return this.scegliAppuntamento('sposta')
  }

  private iniziaDisdici() {
    return this.scegliAppuntamento('disdici')
  }

  private prodottoDi(a: AppuntamentoCliente): Prodotto {
    return {
      id: a.servizio_id ?? '',
      nome: a.servizi?.nome ?? 'Appuntamento',
      durata_minuti: Math.round((Date.parse(a.fine) - Date.parse(a.inizio)) / 60_000),
    }
  }

  /** L'appuntamento da spostare, se è ancora spostabile (altrimenti risponde e restituisce null). */
  private async prodottoDaSpostare(id: string): Promise<Prodotto | null> {
    const a = await this.appuntamento(id)
    if (!a) {
      await this.nonDisponibile()
      return null
    }
    if (!this.modificabile(a)) {
      await this.rispostaTroppoTardi()
      return null
    }
    return this.prodottoDi(a)
  }

  private async sposta(id: string) {
    const a = await this.appuntamento(id)
    if (!a) return this.nonDisponibile()
    if (!this.modificabile(a)) return this.rispostaTroppoTardi()
    const prodotto = this.prodottoDi(a)
    return this.mostraGiorni(prodotto, {
      sposta: a.id,
      prefisso: T.introSposta(prodotto.nome, dataOraLunga(daIso(a.inizio))),
    })
  }

  private async riepilogoSpostamento(prodotto: Prodotto, spostaId: string, nuovo: DateTime) {
    const a = await this.appuntamento(spostaId)
    if (!a) return this.nonDisponibile()
    await this.invia({
      tipo: 'pulsanti',
      testo: T.riepilogoSposta(prodotto.nome, dataOraLunga(daIso(a.inizio)), dataOraLunga(nuovo)),
      pulsanti: [
        { id: 'conferma:si', titolo: T.pulsanteConferma },
        { id: 'conferma:cambia', titolo: T.pulsanteCambiaOrario },
        { id: 'conferma:annulla', titolo: T.pulsanteAnnulla },
      ],
    })
    await this.salva('prenota_riepilogo', { servizioId: prodotto.id, inizio: versoIso(nuovo), spostaId })
  }

  private async eseguiSpostamento(spostaId: string, inizioIso: string) {
    const a = await this.appuntamento(spostaId)
    if (!a) return this.nonDisponibile()
    if (!this.modificabile(a)) return this.rispostaTroppoTardi()
    const prodotto = this.prodottoDi(a)
    const nuovo = daIso(inizioIso)
    const p = await this.parametri(prodotto.durata_minuti, spostaId)
    if (!slotLibero(nuovo, p)) {
      return this.mostraOre(prodotto, dataIso(nuovo), 0, { prefisso: T.slotPreso, sposta: spostaId })
    }
    const aggiornato = await this.db
      .from('appuntamenti')
      .update({ inizio: versoIso(nuovo), fine: versoIso(nuovo.plus({ minutes: prodotto.durata_minuti })) })
      .eq('id', spostaId)
      .in('stato', STATI_ATTIVI)
      .select('id')
    if (aggiornato.error?.code === '23P01') {
      return this.mostraOre(prodotto, dataIso(nuovo), 0, { prefisso: T.slotPreso, sposta: spostaId })
    }
    if (verifica(aggiornato).length === 0) return this.nonDisponibile()

    const da = dataOraLunga(daIso(a.inizio))
    const quando = dataOraLunga(nuovo)
    await this.invia({
      tipo: 'testo',
      testo: T.spostato(prodotto.nome, quando, a.stato === 'in_attesa', this.operatrice.nome),
    })
    await this.ctx.notifica?.({
      tipo: 'spostamento',
      appuntamentoId: spostaId,
      cliente: this.nomeCliente,
      servizio: prodotto.nome,
      da,
      a: quando,
    })
    await this.salva('menu', {})
    await this.proponiPosto(a)
  }

  private async chiediDisdetta(id: string) {
    const a = await this.appuntamento(id)
    if (!a) return this.nonDisponibile()
    if (!this.modificabile(a)) return this.rispostaTroppoTardi()
    await this.invia({
      tipo: 'pulsanti',
      testo: T.domandaDisdetta(a.servizi?.nome ?? 'l\'appuntamento', dataOraLunga(daIso(a.inizio))),
      pulsanti: [
        { id: 'disdetta:si', titolo: T.pulsanteSiDisdici },
        { id: 'disdetta:no', titolo: T.pulsanteNoTieni },
      ],
    })
    await this.salva('disdici_conferma', { appuntamentoId: a.id })
  }

  private async disdici(id: string) {
    const a = await this.appuntamento(id)
    if (!a) return this.nonDisponibile()
    if (!this.modificabile(a)) return this.rispostaTroppoTardi()
    const aggiornato = verifica(
      await this.db.from('appuntamenti').update({ stato: 'disdetto' }).eq('id', id).in('stato', STATI_ATTIVI).select('id'),
    )
    if (aggiornato.length === 0) return this.nonDisponibile()
    senzaErrori(await this.db.from('lista_attesa').update({ attiva: false }).eq('appuntamento_id', id))
    await this.invia({ tipo: 'testo', testo: T.disdetto })
    await this.ctx.notifica?.({
      tipo: 'disdetta',
      appuntamentoId: id,
      cliente: this.nomeCliente,
      servizio: a.servizi?.nome ?? 'Appuntamento',
      quando: dataOraLunga(daIso(a.inizio)),
    })
    await this.salva('menu', {})
    await this.proponiPosto(a)
  }

  private async annullaDisdetta() {
    await this.invia({ tipo: 'testo', testo: T.disdettaAnnullata })
    await this.salva('menu', {})
  }

  // ----- supporto
  private async parametri(durataMinuti: number, escludiId?: string): Promise<ParametriDisponibilita> {
    const da = versoIso(this.ora)
    const a = versoIso(this.ora.plus({ days: this.imp.giorni_prenotabili + 1 }))
    const op = this.operatrice.id
    const [orari, appuntamenti, chiusure, proposte] = await Promise.all([
      this.db.from('orari_settimanali').select('giorno, ora_inizio, ora_fine').eq('operatrice_id', op),
      this.db
        .from('appuntamenti')
        .select('id, inizio, fine')
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
        // durante uno spostamento, il posto attuale della cliente conta come libero
        ...inOccupati(verifica(appuntamenti).filter((a) => a.id !== escludiId)),
        ...inOccupati(verifica(chiusure)),
        ...inOccupati(verifica(proposte).map((x) => ({ inizio: x.nuovo_inizio, fine: x.nuova_fine }))),
      ],
    }
  }

  private async invia(m: MessaggioUscita) {
    await inviaERegistra(this.db, this.ctx.canale, { clienteId: this.cliente.id, telefono: this.telefono }, m)
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
