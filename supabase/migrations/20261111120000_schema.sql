-- =====================================================================
-- Prenotazioni Ilenia — schema del database
--
-- Tutte le date/ore sono timestamptz (istanti assoluti). Il pannello e il
-- bot le mostrano nel fuso Europe/Rome. Gli orari settimanali invece sono
-- "ora locale" (time), perché le 9:00 restano le 9:00 anche col cambio
-- dell'ora legale.
-- =====================================================================

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- Tipi
-- ---------------------------------------------------------------------
create type public.stato_appuntamento as enum
  ('in_attesa', 'confermato', 'rifiutato', 'disdetto', 'completato');
create type public.origine_appuntamento as enum ('whatsapp', 'pannello', 'anticipo');
create type public.modalita_approvazione as enum ('manuale', 'automatica');
create type public.modalita_promemoria as enum ('disattivato', 'email', 'template');
create type public.modalita_lista_attesa as enum ('manuale', 'automatica');
create type public.stato_slot_liberato as enum ('aperto', 'assegnato', 'esaurito', 'annullato');
create type public.canale_proposta as enum ('interattivo', 'template', 'manuale');
create type public.stato_proposta as enum
  ('da_inviare', 'inviata', 'accettata', 'rifiutata', 'scaduta', 'annullata');
create type public.direzione_messaggio as enum ('in', 'out');
create type public.tipo_messaggio as enum ('testo', 'interattivo', 'template', 'media', 'altro');
-- entrata = messaggio ricevuto (gratis); libero = risposta nella finestra 24 h
-- (gratis fino a 1.000/mese per numero); template = a pagamento.
create type public.costo_messaggio as enum ('entrata', 'libero', 'template');

-- ---------------------------------------------------------------------
-- Operatrici (per ora solo Ilenia)
-- ---------------------------------------------------------------------
create table public.operatrici (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users (id) on delete set null,
  nome          text not null check (length(trim(nome)) between 1 and 80),
  email         text,
  attiva        boolean not null default true,
  creato_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Servizi (inizialmente vuoto: li inserisce Ilenia)
-- ---------------------------------------------------------------------
create table public.servizi (
  id             uuid primary key default gen_random_uuid(),
  operatrice_id  uuid not null references public.operatrici (id) on delete cascade,
  nome           text not null check (length(trim(nome)) between 1 and 60),
  durata_minuti  integer not null check (durata_minuti between 5 and 600),
  prezzo         numeric(8, 2) check (prezzo is null or prezzo >= 0),
  attivo         boolean not null default true,
  ordine         integer not null default 0,
  creato_il      timestamptz not null default now(),
  aggiornato_il  timestamptz not null default now()
);
create index servizi_operatrice_idx on public.servizi (operatrice_id, ordine);

-- ---------------------------------------------------------------------
-- Orario settimanale fisso: più righe nello stesso giorno = più fasce
-- (es. 9:00–13:00 e 14:30–19:00). giorno: 1 = lunedì … 7 = domenica.
-- ---------------------------------------------------------------------
create table public.orari_settimanali (
  id             uuid primary key default gen_random_uuid(),
  operatrice_id  uuid not null references public.operatrici (id) on delete cascade,
  giorno         smallint not null check (giorno between 1 and 7),
  ora_inizio     time not null,
  ora_fine       time not null,
  creato_il      timestamptz not null default now(),
  aggiornato_il  timestamptz not null default now(),
  constraint orari_fine_dopo_inizio check (ora_fine > ora_inizio),
  -- due fasce dello stesso giorno non possono sovrapporsi
  constraint orari_no_sovrapposizioni exclude using gist (
    operatrice_id with =,
    giorno with =,
    tsrange(date '2000-01-01' + ora_inizio, date '2000-01-01' + ora_fine, '[)') with &&
  )
);

-- ---------------------------------------------------------------------
-- Chiusure straordinarie e ferie
-- ---------------------------------------------------------------------
create table public.chiusure (
  id             uuid primary key default gen_random_uuid(),
  operatrice_id  uuid not null references public.operatrici (id) on delete cascade,
  inizio         timestamptz not null,
  fine           timestamptz not null,
  motivo         text check (motivo is null or length(motivo) <= 200),
  creato_il      timestamptz not null default now(),
  aggiornato_il  timestamptz not null default now(),
  constraint chiusure_fine_dopo_inizio check (fine > inizio)
);
create index chiusure_operatrice_idx on public.chiusure (operatrice_id, inizio);

-- ---------------------------------------------------------------------
-- Clienti (condivise tra le operatrici del salone)
-- telefono nel formato wa_id di WhatsApp: solo cifre con prefisso
-- internazionale, es. 393331234567. Può mancare per clienti inserite a
-- mano senza numero, ma allora serve il nome.
-- ---------------------------------------------------------------------
create table public.clienti (
  id             uuid primary key default gen_random_uuid(),
  nome           text check (nome is null or length(trim(nome)) between 1 and 80),
  telefono       text unique check (telefono is null or telefono ~ '^[1-9][0-9]{7,14}$'),
  email          text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  note           text check (note is null or length(note) <= 2000),
  creato_il      timestamptz not null default now(),
  aggiornato_il  timestamptz not null default now(),
  constraint clienti_nome_o_telefono check (nome is not null or telefono is not null)
);
create index clienti_nome_idx on public.clienti (lower(nome));

-- ---------------------------------------------------------------------
-- Appuntamenti
-- ---------------------------------------------------------------------
create table public.appuntamenti (
  id                     uuid primary key default gen_random_uuid(),
  operatrice_id          uuid not null references public.operatrici (id) on delete restrict,
  cliente_id             uuid not null references public.clienti (id) on delete cascade,
  servizio_id            uuid references public.servizi (id) on delete restrict,
  inizio                 timestamptz not null,
  fine                   timestamptz not null,
  stato                  public.stato_appuntamento not null default 'in_attesa',
  origine                public.origine_appuntamento not null default 'pannello',
  note                   text check (note is null or length(note) <= 1000),
  motivo_rifiuto         text,
  -- true se la conferma è partita come template a pagamento (finestra 24 h chiusa)
  conferma_via_template  boolean not null default false,
  promemoria_inviato_il  timestamptz,
  creato_il              timestamptz not null default now(),
  aggiornato_il          timestamptz not null default now(),
  constraint appuntamenti_fine_dopo_inizio check (fine > inizio),
  -- Nessuna sovrapposizione: due appuntamenti attivi (in attesa o
  -- confermati) della stessa operatrice non possono condividere nemmeno
  -- un minuto. Intervalli semiaperti [inizio, fine): 10:00–10:30 e
  -- 10:30–11:00 sono compatibili.
  constraint appuntamenti_no_sovrapposizioni exclude using gist (
    operatrice_id with =,
    tstzrange(inizio, fine, '[)') with &&
  ) where (stato in ('in_attesa', 'confermato'))
);
create index appuntamenti_operatrice_inizio_idx on public.appuntamenti (operatrice_id, inizio);
create index appuntamenti_cliente_idx on public.appuntamenti (cliente_id, inizio);

-- ---------------------------------------------------------------------
-- Lista d'attesa: la cliente ha detto "Sì, avvisami se si libera prima"
-- per uno specifico appuntamento.
-- ---------------------------------------------------------------------
create table public.lista_attesa (
  id               uuid primary key default gen_random_uuid(),
  appuntamento_id  uuid not null unique references public.appuntamenti (id) on delete cascade,
  cliente_id       uuid not null references public.clienti (id) on delete cascade,
  operatrice_id    uuid not null references public.operatrici (id) on delete cascade,
  attiva           boolean not null default true,
  creato_il        timestamptz not null default now(),
  aggiornato_il    timestamptz not null default now()
);
create index lista_attesa_operatrice_idx on public.lista_attesa (operatrice_id) where attiva;

-- Spazi liberati da una disdetta/spostamento, da proporre alla lista d'attesa
create table public.slot_liberati (
  id                       uuid primary key default gen_random_uuid(),
  operatrice_id            uuid not null references public.operatrici (id) on delete cascade,
  inizio                   timestamptz not null,
  fine                     timestamptz not null,
  origine_appuntamento_id  uuid references public.appuntamenti (id) on delete set null,
  stato                    public.stato_slot_liberato not null default 'aperto',
  creato_il                timestamptz not null default now(),
  aggiornato_il            timestamptz not null default now(),
  constraint slot_fine_dopo_inizio check (fine > inizio)
);
create index slot_liberati_aperti_idx on public.slot_liberati (operatrice_id, inizio) where stato = 'aperto';

-- Ogni tentativo di proporre uno slot a una cliente (una alla volta)
create table public.proposte_anticipo (
  id               uuid primary key default gen_random_uuid(),
  slot_id          uuid not null references public.slot_liberati (id) on delete cascade,
  lista_attesa_id  uuid references public.lista_attesa (id) on delete set null,
  cliente_id       uuid not null references public.clienti (id) on delete cascade,
  appuntamento_id  uuid not null references public.appuntamenti (id) on delete cascade,
  operatrice_id    uuid not null references public.operatrici (id) on delete cascade,
  nuovo_inizio     timestamptz not null,
  nuova_fine       timestamptz not null,
  canale           public.canale_proposta not null,
  stato            public.stato_proposta not null default 'da_inviare',
  -- codice breve per il link di ritorno "ACCETTO K7P2"
  codice           text not null unique check (codice ~ '^[A-Z0-9]{4,8}$'),
  inviata_il       timestamptz,
  scade_il         timestamptz,
  risposta_il      timestamptz,
  creato_il        timestamptz not null default now(),
  aggiornato_il    timestamptz not null default now(),
  constraint proposte_fine_dopo_inizio check (nuova_fine > nuovo_inizio)
);
create index proposte_slot_idx on public.proposte_anticipo (slot_id);
create index proposte_attive_idx on public.proposte_anticipo (scade_il)
  where stato in ('da_inviare', 'inviata');

-- ---------------------------------------------------------------------
-- Stato della conversazione del bot per ogni cliente
-- ---------------------------------------------------------------------
create table public.conversazioni (
  id                           uuid primary key default gen_random_uuid(),
  cliente_id                   uuid not null unique references public.clienti (id) on delete cascade,
  stato                        text not null default 'menu',
  contesto                     jsonb not null default '{}'::jsonb,
  -- ultimo messaggio della cliente: apre la finestra gratuita di 24 h
  ultimo_messaggio_cliente_il  timestamptz,
  -- modalità "operatore": il bot tace fino a questo istante
  bot_in_pausa_fino_al         timestamptz,
  creato_il                    timestamptz not null default now(),
  aggiornato_il                timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Impostazioni (una riga per operatrice, creata automaticamente)
-- ---------------------------------------------------------------------
create table public.impostazioni (
  operatrice_id                      uuid primary key references public.operatrici (id) on delete cascade,
  approvazione                       public.modalita_approvazione not null default 'manuale',
  ore_limite_modifica                integer not null default 24
                                       check (ore_limite_modifica between 0 and 336),
  promemoria                         public.modalita_promemoria not null default 'disattivato',
  ora_promemoria                     time not null default '18:00',
  lista_attesa_modalita              public.modalita_lista_attesa not null default 'manuale',
  lista_attesa_minuti_risposta       integer not null default 15
                                       check (lista_attesa_minuti_risposta between 1 and 1440),
  lista_attesa_preavviso_minimo_min  integer not null default 120
                                       check (lista_attesa_preavviso_minimo_min between 0 and 10080),
  preavviso_minimo_prenotazione_min  integer not null default 120
                                       check (preavviso_minimo_prenotazione_min between 0 and 10080),
  giorni_prenotabili                 integer not null default 30
                                       check (giorni_prenotabili between 1 and 365),
  passo_slot_min                     integer not null default 30
                                       check (passo_slot_min in (5, 10, 15, 20, 30, 60)),
  parola_operatore                   text not null default 'operatore'
                                       check (length(trim(parola_operatore)) between 2 and 30),
  ore_pausa_operatore                integer not null default 12
                                       check (ore_pausa_operatore between 1 and 168),
  telefono_salone                    text check (telefono_salone is null or length(telefono_salone) <= 30),
  email_notifiche                    text check (email_notifiche is null
                                       or email_notifiche ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  creato_il                          timestamptz not null default now(),
  aggiornato_il                      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Registro dei messaggi WhatsApp (deduplica + contatori di costo)
-- ---------------------------------------------------------------------
create table public.log_messaggi (
  id              bigint generated always as identity primary key,
  direzione       public.direzione_messaggio not null,
  cliente_id      uuid references public.clienti (id) on delete set null,
  telefono        text not null,
  -- id del messaggio di Meta: i retry del webhook vengono scartati
  wa_message_id   text unique,
  tipo            public.tipo_messaggio not null,
  costo           public.costo_messaggio not null,
  template_nome   text,
  contenuto       jsonb,
  stato_consegna  text,
  errore          text,
  creato_il       timestamptz not null default now()
);
create index log_messaggi_creato_idx on public.log_messaggi (creato_il);
create index log_messaggi_cliente_idx on public.log_messaggi (cliente_id, creato_il);

-- ---------------------------------------------------------------------
-- Iscrizioni alle notifiche push del pannello (una per dispositivo)
-- ---------------------------------------------------------------------
create table public.push_iscrizioni (
  id             uuid primary key default gen_random_uuid(),
  operatrice_id  uuid not null references public.operatrici (id) on delete cascade,
  endpoint       text not null unique,
  p256dh         text not null,
  auth           text not null,
  user_agent     text,
  creato_il      timestamptz not null default now()
);
