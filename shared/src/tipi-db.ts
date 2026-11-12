/**
 * Tipi del database nel formato di `supabase gen types typescript`.
 *
 * Scritti a mano seguendo supabase/migrations. Dopo aver collegato il
 * progetto si possono rigenerare con:
 *   npx supabase gen types typescript --project-id <id> --schema public > shared/src/tipi-db.ts
 * (in quel caso vanno riaggiunti gli alias in fondo al file).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

/** Insert: campi obbligatori K, tutti gli altri facoltativi (hanno un default). */
type Inserimento<Row, K extends keyof Row> = Pick<Row, K> & Partial<Omit<Row, K>>

type Fk<Nome extends string, Col extends string, Rel extends string> = {
  foreignKeyName: Nome
  columns: [Col]
  isOneToOne: false
  referencedRelation: Rel
  referencedColumns: ['id']
}

type Tabella<Row, K extends keyof Row, R extends unknown[]> = {
  Row: Row
  Insert: Inserimento<Row, K>
  Update: Partial<Row>
  Relationships: R
}

export type StatoAppuntamento = 'in_attesa' | 'confermato' | 'rifiutato' | 'disdetto' | 'completato'
export type OrigineAppuntamento = 'whatsapp' | 'pannello' | 'anticipo'
export type ModalitaApprovazione = 'manuale' | 'automatica'
export type ModalitaPromemoria = 'disattivato' | 'email' | 'template'
export type ModalitaListaAttesa = 'manuale' | 'automatica'
export type StatoSlotLiberato = 'aperto' | 'assegnato' | 'esaurito' | 'annullato'
export type CanaleProposta = 'interattivo' | 'template' | 'manuale'
export type StatoProposta = 'da_inviare' | 'inviata' | 'accettata' | 'rifiutata' | 'scaduta' | 'annullata'
export type DirezioneMessaggio = 'in' | 'out'
export type TipoMessaggio = 'testo' | 'interattivo' | 'template' | 'media' | 'altro'
export type CostoMessaggio = 'entrata' | 'libero' | 'template'

export type Operatrice = {
  id: string
  user_id: string | null
  nome: string
  email: string | null
  attiva: boolean
  creato_il: string
  aggiornato_il: string
}

export type Servizio = {
  id: string
  operatrice_id: string
  nome: string
  durata_minuti: number
  prezzo: number | null
  attivo: boolean
  ordine: number
  creato_il: string
  aggiornato_il: string
}

export type OrarioSettimanale = {
  id: string
  operatrice_id: string
  giorno: number
  ora_inizio: string
  ora_fine: string
  creato_il: string
  aggiornato_il: string
}

export type ChiusuraDb = {
  id: string
  operatrice_id: string
  inizio: string
  fine: string
  motivo: string | null
  creato_il: string
  aggiornato_il: string
}

export type Cliente = {
  id: string
  nome: string | null
  telefono: string | null
  email: string | null
  note: string | null
  creato_il: string
  aggiornato_il: string
}

export type Appuntamento = {
  id: string
  operatrice_id: string
  cliente_id: string
  servizio_id: string | null
  inizio: string
  fine: string
  stato: StatoAppuntamento
  origine: OrigineAppuntamento
  note: string | null
  motivo_rifiuto: string | null
  conferma_via_template: boolean
  promemoria_inviato_il: string | null
  creato_il: string
  aggiornato_il: string
}

export type ListaAttesa = {
  id: string
  appuntamento_id: string
  cliente_id: string
  operatrice_id: string
  attiva: boolean
  creato_il: string
  aggiornato_il: string
}

export type SlotLiberato = {
  id: string
  operatrice_id: string
  inizio: string
  fine: string
  origine_appuntamento_id: string | null
  stato: StatoSlotLiberato
  creato_il: string
  aggiornato_il: string
}

export type PropostaAnticipo = {
  id: string
  slot_id: string
  lista_attesa_id: string | null
  cliente_id: string
  appuntamento_id: string
  operatrice_id: string
  nuovo_inizio: string
  nuova_fine: string
  canale: CanaleProposta
  stato: StatoProposta
  codice: string
  inviata_il: string | null
  scade_il: string | null
  risposta_il: string | null
  creato_il: string
  aggiornato_il: string
}

export type Conversazione = {
  id: string
  cliente_id: string
  stato: string
  contesto: Json
  ultimo_messaggio_cliente_il: string | null
  bot_in_pausa_fino_al: string | null
  creato_il: string
  aggiornato_il: string
}

export type Impostazioni = {
  operatrice_id: string
  approvazione: ModalitaApprovazione
  ore_limite_modifica: number
  promemoria: ModalitaPromemoria
  ora_promemoria: string
  lista_attesa_modalita: ModalitaListaAttesa
  lista_attesa_minuti_risposta: number
  lista_attesa_preavviso_minimo_min: number
  preavviso_minimo_prenotazione_min: number
  giorni_prenotabili: number
  passo_slot_min: number
  parola_operatore: string
  ore_pausa_operatore: number
  telefono_salone: string | null
  email_notifiche: string | null
  /** numero WhatsApp del bot (wa_id), per il link «ACCETTO» della lista d'attesa manuale */
  numero_whatsapp: string | null
  creato_il: string
  aggiornato_il: string
}

export type LogMessaggio = {
  id: number
  direzione: DirezioneMessaggio
  cliente_id: string | null
  telefono: string
  wa_message_id: string | null
  tipo: TipoMessaggio
  costo: CostoMessaggio
  template_nome: string | null
  contenuto: Json | null
  stato_consegna: string | null
  errore: string | null
  /** dal webhook di stato di Meta: il messaggio è a pagamento? */
  fatturato: boolean | null
  categoria_meta: string | null
  creato_il: string
}

export type PushIscrizione = {
  id: string
  operatrice_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  creato_il: string
}

export type ContatoreMessaggiMensile = {
  mese: string | null
  liberi: number | null
  template: number | null
  ricevuti: number | null
  fatturati: number | null
}

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '13'
  }
  public: {
    Tables: {
      operatrici: Tabella<Operatrice, 'nome', []>
      servizi: Tabella<
        Servizio,
        'operatrice_id' | 'nome' | 'durata_minuti',
        [Fk<'servizi_operatrice_id_fkey', 'operatrice_id', 'operatrici'>]
      >
      orari_settimanali: Tabella<
        OrarioSettimanale,
        'operatrice_id' | 'giorno' | 'ora_inizio' | 'ora_fine',
        [Fk<'orari_settimanali_operatrice_id_fkey', 'operatrice_id', 'operatrici'>]
      >
      chiusure: Tabella<
        ChiusuraDb,
        'operatrice_id' | 'inizio' | 'fine',
        [Fk<'chiusure_operatrice_id_fkey', 'operatrice_id', 'operatrici'>]
      >
      clienti: Tabella<Cliente, never, []>
      appuntamenti: Tabella<
        Appuntamento,
        'operatrice_id' | 'cliente_id' | 'inizio' | 'fine',
        [
          Fk<'appuntamenti_operatrice_id_fkey', 'operatrice_id', 'operatrici'>,
          Fk<'appuntamenti_cliente_id_fkey', 'cliente_id', 'clienti'>,
          Fk<'appuntamenti_servizio_id_fkey', 'servizio_id', 'servizi'>,
        ]
      >
      lista_attesa: Tabella<
        ListaAttesa,
        'appuntamento_id' | 'cliente_id' | 'operatrice_id',
        [
          {
            foreignKeyName: 'lista_attesa_appuntamento_id_fkey'
            columns: ['appuntamento_id']
            isOneToOne: true
            referencedRelation: 'appuntamenti'
            referencedColumns: ['id']
          },
          Fk<'lista_attesa_cliente_id_fkey', 'cliente_id', 'clienti'>,
          Fk<'lista_attesa_operatrice_id_fkey', 'operatrice_id', 'operatrici'>,
        ]
      >
      slot_liberati: Tabella<
        SlotLiberato,
        'operatrice_id' | 'inizio' | 'fine',
        [
          Fk<'slot_liberati_operatrice_id_fkey', 'operatrice_id', 'operatrici'>,
          Fk<'slot_liberati_origine_appuntamento_id_fkey', 'origine_appuntamento_id', 'appuntamenti'>,
        ]
      >
      proposte_anticipo: Tabella<
        PropostaAnticipo,
        | 'slot_id'
        | 'cliente_id'
        | 'appuntamento_id'
        | 'operatrice_id'
        | 'nuovo_inizio'
        | 'nuova_fine'
        | 'canale'
        | 'codice',
        [
          Fk<'proposte_anticipo_slot_id_fkey', 'slot_id', 'slot_liberati'>,
          Fk<'proposte_anticipo_lista_attesa_id_fkey', 'lista_attesa_id', 'lista_attesa'>,
          Fk<'proposte_anticipo_cliente_id_fkey', 'cliente_id', 'clienti'>,
          Fk<'proposte_anticipo_appuntamento_id_fkey', 'appuntamento_id', 'appuntamenti'>,
          Fk<'proposte_anticipo_operatrice_id_fkey', 'operatrice_id', 'operatrici'>,
        ]
      >
      conversazioni: Tabella<
        Conversazione,
        'cliente_id',
        [
          {
            foreignKeyName: 'conversazioni_cliente_id_fkey'
            columns: ['cliente_id']
            isOneToOne: true
            referencedRelation: 'clienti'
            referencedColumns: ['id']
          },
        ]
      >
      impostazioni: Tabella<
        Impostazioni,
        'operatrice_id',
        [
          {
            foreignKeyName: 'impostazioni_operatrice_id_fkey'
            columns: ['operatrice_id']
            isOneToOne: true
            referencedRelation: 'operatrici'
            referencedColumns: ['id']
          },
        ]
      >
      log_messaggi: Tabella<
        LogMessaggio,
        'direzione' | 'telefono' | 'tipo' | 'costo',
        [Fk<'log_messaggi_cliente_id_fkey', 'cliente_id', 'clienti'>]
      >
      push_iscrizioni: Tabella<
        PushIscrizione,
        'operatrice_id' | 'endpoint' | 'p256dh' | 'auth',
        [Fk<'push_iscrizioni_operatrice_id_fkey', 'operatrice_id', 'operatrici'>]
      >
    }
    Views: {
      contatore_messaggi_mensile: {
        Row: ContatoreMessaggiMensile
        Relationships: []
      }
    }
    Functions: {
      e_operatrice: { Args: Record<PropertyKey, never>; Returns: boolean }
      operatrice_corrente: { Args: Record<PropertyKey, never>; Returns: string }
      salva_orari_settimanali: { Args: { fasce: Json }; Returns: OrarioSettimanale[] }
    }
    Enums: {
      stato_appuntamento: StatoAppuntamento
      origine_appuntamento: OrigineAppuntamento
      modalita_approvazione: ModalitaApprovazione
      modalita_promemoria: ModalitaPromemoria
      modalita_lista_attesa: ModalitaListaAttesa
      stato_slot_liberato: StatoSlotLiberato
      canale_proposta: CanaleProposta
      stato_proposta: StatoProposta
      direzione_messaggio: DirezioneMessaggio
      tipo_messaggio: TipoMessaggio
      costo_messaggio: CostoMessaggio
    }
    CompositeTypes: { [_ in never]: never }
  }
}

type Pubblico = Database['public']
export type Tabelle = Pubblico['Tables']
export type Riga<T extends keyof Tabelle> = Tabelle[T]['Row']
export type NuovaRiga<T extends keyof Tabelle> = Tabelle[T]['Insert']
export type ModificaRiga<T extends keyof Tabelle> = Tabelle[T]['Update']

/** Codici di errore Postgres utili per i messaggi in italiano */
export const ERRORI_PG = {
  /** vincolo di esclusione: appuntamento o fascia sovrapposta */
  SOVRAPPOSIZIONE: '23P01',
  /** riferimento ancora in uso (es. servizio usato in un appuntamento) */
  IN_USO: '23503',
  /** valore duplicato (es. telefono già presente) */
  DUPLICATO: '23505',
  /** controllo non superato (formato o valori non validi) */
  CONTROLLO: '23514',
  /** permesso negato / regola RLS */
  PERMESSO: '42501',
} as const
