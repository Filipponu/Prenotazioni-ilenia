-- Test della Fase 1: operatrici, impostazioni, vincoli e regole RLS.
-- Eseguito da esegui.sh su un database usa e getta.
\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ---------------------------------------------------------------------
-- Funzioni di asserzione
-- ---------------------------------------------------------------------
create schema test;
grant usage on schema test to anon, authenticated, service_role;

create function test.ok(condizione boolean, descrizione text) returns void
language plpgsql as $$
begin
  if condizione is distinct from true then
    raise exception 'FALLITO: %', descrizione;
  end if;
  raise notice 'ok - %', descrizione;
end;
$$;

create function test.errore(istruzione text, codice text, descrizione text) returns void
language plpgsql as $$
begin
  execute istruzione;
  raise exception 'FALLITO (nessun errore): %', descrizione;
exception when others then
  if sqlerrm like 'FALLITO%' then
    raise;
  end if;
  if sqlstate <> codice then
    raise exception 'FALLITO: % (atteso %, ottenuto %: %)', descrizione, codice, sqlstate, sqlerrm;
  end if;
  raise notice 'ok - % (%)', descrizione, sqlstate;
end;
$$;

grant execute on all functions in schema test to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Creazione utenti → operatrici e impostazioni
-- ---------------------------------------------------------------------
insert into auth.users (id, email)
values ('11111111-1111-1111-1111-111111111111', 'ilenia.rossi@example.com');
insert into auth.users (id, email, raw_user_meta_data)
values ('22222222-2222-2222-2222-222222222222', 'collega@example.com', '{"nome": "Giulia"}');

select test.ok(
  (select attiva from public.operatrici where user_id = '11111111-1111-1111-1111-111111111111'),
  'il primo utente diventa operatrice attiva');
select test.ok(
  (select nome from public.operatrici where user_id = '11111111-1111-1111-1111-111111111111') = 'Ilenia Rossi',
  'il nome viene ricavato dall''email');
select test.ok(
  not (select attiva from public.operatrici where user_id = '22222222-2222-2222-2222-222222222222'),
  'gli utenti successivi NON sono attivi');
select test.ok(
  (select nome from public.operatrici where user_id = '22222222-2222-2222-2222-222222222222') = 'Giulia',
  'il nome dai metadati ha la precedenza');
select test.ok((select count(*) from public.impostazioni) = 2, 'impostazioni create per ogni operatrice');

select id as ilenia from public.operatrici where user_id = '11111111-1111-1111-1111-111111111111' \gset
select id as giulia from public.operatrici where user_id = '22222222-2222-2222-2222-222222222222' \gset

select test.ok(
  (select approvazione = 'manuale' and ore_limite_modifica = 24 and promemoria = 'disattivato'
     and lista_attesa_modalita = 'manuale' and lista_attesa_minuti_risposta = 15
     and passo_slot_min = 30 and giorni_prenotabili = 30
   from public.impostazioni where operatrice_id = :'ilenia'),
  'valori predefiniti delle impostazioni');

-- servizio di Giulia, servirà per un test incrociato
insert into public.servizi (operatrice_id, nome, durata_minuti)
values (:'giulia', 'Colore Giulia', 90) returning id as servizio_giulia \gset

-- ---------------------------------------------------------------------
-- anon: nessun accesso
-- ---------------------------------------------------------------------
set role anon;
select test.errore('select * from public.clienti', '42501', 'anon non legge le clienti');
select test.errore('select * from public.appuntamenti', '42501', 'anon non legge gli appuntamenti');
reset role;

-- ---------------------------------------------------------------------
-- Ilenia
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111"}', false);

select test.ok(public.operatrice_corrente() = :'ilenia', 'operatrice_corrente() riconosce Ilenia');
select test.ok((select count(*) from public.servizi) = 0, 'Ilenia non vede i servizi di Giulia');

-- servizi
insert into public.servizi (operatrice_id, nome, durata_minuti, prezzo)
values (:'ilenia', 'Piega', 45, 25) returning id as piega \gset
insert into public.servizi (operatrice_id, nome, durata_minuti)
values (:'ilenia', 'Taglio', 30) returning id as taglio \gset
select test.errore(
  format('insert into public.servizi (operatrice_id, nome, durata_minuti) values (%L, %L, 0)', :'ilenia', 'Zero'),
  '23514', 'durata zero rifiutata');
select test.errore(
  format('insert into public.servizi (operatrice_id, nome, durata_minuti) values (%L, %L, 30)', :'giulia', 'Intruso'),
  '42501', 'non si possono creare servizi per un''altra operatrice');

-- orari
insert into public.orari_settimanali (operatrice_id, giorno, ora_inizio, ora_fine)
values (:'ilenia', 1, '09:00', '13:00'), (:'ilenia', 1, '14:30', '19:00');
select test.errore(
  format('insert into public.orari_settimanali (operatrice_id, giorno, ora_inizio, ora_fine) values (%L, 1, %L, %L)',
         :'ilenia', '12:00', '15:00'),
  '23P01', 'fasce sovrapposte nello stesso giorno rifiutate');
select test.errore(
  format('insert into public.orari_settimanali (operatrice_id, giorno, ora_inizio, ora_fine) values (%L, 2, %L, %L)',
         :'ilenia', '13:00', '09:00'),
  '23514', 'fascia con fine prima dell''inizio rifiutata');
insert into public.orari_settimanali (operatrice_id, giorno, ora_inizio, ora_fine)
values (:'ilenia', 2, '13:00', '14:00');
select test.ok(true, 'fasce adiacenti (lun 13:00 e mar 13:00) accettate');

-- salvataggio dell'orario intero (tutto o niente)
select test.ok(
  (select count(*) from public.salva_orari_settimanali(
     '[{"giorno": 3, "ora_inizio": "09:00", "ora_fine": "13:00"},
       {"giorno": 3, "ora_inizio": "14:00", "ora_fine": "18:00"},
       {"giorno": 1, "ora_inizio": "09:00", "ora_fine": "13:00"},
       {"giorno": 1, "ora_inizio": "14:30", "ora_fine": "19:00"},
       {"giorno": 2, "ora_inizio": "13:00", "ora_fine": "14:00"}]'::jsonb)) = 5,
  'salva_orari_settimanali sostituisce l''orario');
select test.errore(
  $q$select public.salva_orari_settimanali('[{"giorno": 4, "ora_inizio": "09:00", "ora_fine": "13:00"},
                                             {"giorno": 4, "ora_inizio": "12:00", "ora_fine": "15:00"}]')$q$,
  '23P01', 'salva_orari_settimanali rifiuta fasce sovrapposte');
select test.ok(
  (select count(*) from public.orari_settimanali) = 5,
  'dopo un errore l''orario precedente resta intatto');

-- chiusure
insert into public.chiusure (operatrice_id, inizio, fine, motivo)
values (:'ilenia', '2026-12-24 00:00+01', '2026-12-27 00:00+01', 'Natale');
select test.errore(
  format('insert into public.chiusure (operatrice_id, inizio, fine) values (%L, %L, %L)',
         :'ilenia', '2026-12-24 10:00+01', '2026-12-24 09:00+01'),
  '23514', 'chiusura con fine prima dell''inizio rifiutata');

-- clienti
insert into public.clienti (nome, telefono) values ('Maria Bianchi', '393331234567')
returning id as maria \gset
select test.errore(
  'insert into public.clienti (nome, telefono) values (''X'', ''+39 333'')',
  '23514', 'telefono non normalizzato rifiutato');
select test.errore(
  'insert into public.clienti (note) values (''solo note'')',
  '23514', 'cliente senza nome né telefono rifiutata');
select test.errore(
  'insert into public.clienti (nome, telefono) values (''Doppione'', ''393331234567'')',
  '23505', 'telefono duplicato rifiutato');

-- appuntamenti: vincolo anti-sovrapposizione
insert into public.appuntamenti (operatrice_id, cliente_id, servizio_id, inizio, fine, stato)
values (:'ilenia', :'maria', :'piega', '2026-11-16 10:00+01', '2026-11-16 10:45+01', 'confermato')
returning id as app1 \gset

select test.errore(
  format($q$insert into public.appuntamenti (operatrice_id, cliente_id, inizio, fine, stato)
            values (%L, %L, '2026-11-16 10:30+01', '2026-11-16 11:00+01', 'in_attesa')$q$,
         :'ilenia', :'maria'),
  '23P01', 'una richiesta in attesa non può sovrapporsi a un confermato');

select test.errore(
  format($q$insert into public.appuntamenti (operatrice_id, cliente_id, inizio, fine, stato)
            values (%L, %L, '2026-11-16 09:00+01', '2026-11-16 12:00+01', 'confermato')$q$,
         :'ilenia', :'maria'),
  '23P01', 'un appuntamento che ne contiene un altro è rifiutato');

insert into public.appuntamenti (operatrice_id, cliente_id, inizio, fine, stato)
values (:'ilenia', :'maria', '2026-11-16 10:45+01', '2026-11-16 11:15+01', 'in_attesa')
returning id as app_adiacente \gset
select test.ok(true, 'appuntamento adiacente (10:45) accettato');

insert into public.appuntamenti (operatrice_id, cliente_id, inizio, fine, stato)
values (:'ilenia', :'maria', '2026-11-16 10:00+01', '2026-11-16 10:45+01', 'disdetto')
returning id as app_disdetto \gset
select test.ok(true, 'un appuntamento disdetto non occupa lo slot');

select test.errore(
  format($q$update public.appuntamenti set stato = 'confermato' where id = %L$q$, :'app_disdetto'),
  '23P01', 'riattivare un disdetto sovrapposto è rifiutato');

select test.errore(
  format($q$update public.appuntamenti set inizio = '2026-11-16 10:15+01', fine = '2026-11-16 10:50+01' where id = %L$q$,
         :'app_adiacente'),
  '23P01', 'spostare un appuntamento sopra un altro è rifiutato');

update public.appuntamenti set stato = 'disdetto' where id = :'app1';
update public.appuntamenti set stato = 'confermato' where id = :'app_disdetto';
select test.ok(true, 'disdetto il primo, lo slot si libera per l''altro');

select test.errore(
  format($q$insert into public.appuntamenti (operatrice_id, cliente_id, inizio, fine)
            values (%L, %L, '2026-11-16 15:00+01', '2026-11-16 14:00+01')$q$,
         :'ilenia', :'maria'),
  '23514', 'appuntamento con fine prima dell''inizio rifiutato');

select test.errore(
  format($q$insert into public.appuntamenti (operatrice_id, cliente_id, servizio_id, inizio, fine)
            values (%L, %L, %L, '2026-11-17 15:00+01', '2026-11-17 16:30+01')$q$,
         :'ilenia', :'maria', :'servizio_giulia'),
  '23514', 'non si può usare il servizio di un''altra operatrice');

select test.errore(
  format('delete from public.servizi where id = %L', :'piega'),
  '23503', 'un servizio usato negli appuntamenti non si può eliminare');
delete from public.servizi where id = :'taglio';
select test.ok(true, 'un servizio mai usato si elimina');

-- impostazioni
update public.impostazioni set approvazione = 'automatica' where operatrice_id = :'ilenia';
select test.ok((select approvazione from public.impostazioni) = 'automatica', 'Ilenia modifica le sue impostazioni');
select test.errore(
  format('insert into public.impostazioni (operatrice_id) values (%L)', :'giulia'),
  '42501', 'le impostazioni non si creano dal pannello');
select test.errore(
  'update public.operatrici set attiva = false',
  '42501', 'un''operatrice non può cambiare il campo attiva');
update public.operatrici set nome = 'Ilenia' where id = :'ilenia';
select test.ok((select nome from public.operatrici where id = :'ilenia') = 'Ilenia', 'Ilenia modifica il proprio nome');

reset role;

-- ---------------------------------------------------------------------
-- Giulia NON attiva: non vede e non scrive nulla
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222"}', false);

select test.ok(public.operatrice_corrente() is null, 'operatrice non attiva: nessuna identità');
select test.ok((select count(*) from public.clienti) = 0, 'operatrice non attiva: nessuna cliente visibile');
select test.ok((select count(*) from public.operatrici) = 0, 'operatrice non attiva: nessuna operatrice visibile');
select test.ok((select count(*) from public.servizi) = 0, 'operatrice non attiva: nemmeno i propri servizi');
select test.errore(
  'insert into public.clienti (nome) values (''Intrusa'')',
  '42501', 'operatrice non attiva: non crea clienti');
select test.errore(
  'update public.operatrici set attiva = true',
  '42501', 'operatrice non attiva: non può attivarsi da sola');
reset role;

-- ---------------------------------------------------------------------
-- Giulia attivata: clienti condivise, agenda separata
-- ---------------------------------------------------------------------
update public.operatrici set attiva = true where id = :'giulia';

set role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222"}', false);

select test.ok((select count(*) from public.clienti) = 1, 'le clienti sono condivise tra colleghe');
select test.ok((select count(*) from public.appuntamenti) = 0, 'Giulia non vede l''agenda di Ilenia');
select test.ok((select count(*) from public.servizi) = 1, 'Giulia vede solo i propri servizi');
select test.ok((select count(*) from public.impostazioni) = 1, 'Giulia vede solo le proprie impostazioni');

insert into public.appuntamenti (operatrice_id, cliente_id, servizio_id, inizio, fine, stato)
values (:'giulia', :'maria', :'servizio_giulia', '2026-11-16 10:00+01', '2026-11-16 11:30+01', 'confermato');
select test.ok(true, 'operatrici diverse possono avere appuntamenti alla stessa ora');

update public.appuntamenti set stato = 'disdetto' where operatrice_id = :'ilenia';
reset role;
select test.ok(
  (select count(*) from public.appuntamenti where operatrice_id = :'ilenia' and stato = 'disdetto') = 1,
  'Giulia non può modificare gli appuntamenti di Ilenia');

-- ---------------------------------------------------------------------
-- Contatore messaggi (scritto dal Worker con la chiave segreta)
-- ---------------------------------------------------------------------
set role service_role;
insert into public.log_messaggi (direzione, telefono, wa_message_id, tipo, costo) values
  ('in',  '393331234567', 'wamid.1', 'testo', 'entrata'),
  ('out', '393331234567', 'wamid.2', 'interattivo', 'libero'),
  ('out', '393331234567', 'wamid.3', 'testo', 'libero'),
  ('out', '393331234567', 'wamid.4', 'template', 'template');
select test.errore(
  $q$insert into public.log_messaggi (direzione, telefono, wa_message_id, tipo, costo)
     values ('in', '393331234567', 'wamid.1', 'testo', 'entrata')$q$,
  '23505', 'un messaggio ripetuto da Meta viene scartato');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111"}', false);
select test.ok(
  (select liberi = 2 and template = 1 and ricevuti = 1 from public.contatore_messaggi_mensile),
  'contatore mensile: 2 liberi, 1 template, 1 ricevuto');
select test.errore(
  $q$insert into public.log_messaggi (direzione, telefono, tipo, costo) values ('out', '39333', 'testo', 'libero')$q$,
  '42501', 'il pannello non scrive nel registro messaggi');
reset role;

-- ---------------------------------------------------------------------
-- Fase 4: lista d'attesa
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111"}', false);
update public.impostazioni set numero_whatsapp = '393000000999' where operatrice_id = :'ilenia';
select test.ok((select numero_whatsapp from public.impostazioni) = '393000000999', 'numero WhatsApp del bot salvato');
select test.errore(
  format('update public.impostazioni set numero_whatsapp = %L where operatrice_id = %L', '+39 333', :'ilenia'),
  '23514', 'numero WhatsApp del bot non valido rifiutato');
reset role;

insert into public.slot_liberati (id, operatrice_id, inizio, fine)
values ('aaaaaaaa-0000-0000-0000-00000000000a', :'ilenia', '2026-11-20 10:00+01', '2026-11-20 11:00+01');
insert into public.appuntamenti (id, operatrice_id, cliente_id, inizio, fine, stato)
values ('aaaaaaaa-0000-0000-0000-00000000000b', :'ilenia', :'maria', '2026-11-27 10:00+01', '2026-11-27 10:45+01', 'confermato');
insert into public.proposte_anticipo (slot_id, cliente_id, appuntamento_id, operatrice_id, nuovo_inizio, nuova_fine, canale, stato, codice)
values ('aaaaaaaa-0000-0000-0000-00000000000a', :'maria', 'aaaaaaaa-0000-0000-0000-00000000000b', :'ilenia',
        '2026-11-20 10:00+01', '2026-11-20 10:45+01', 'manuale', 'da_inviare', 'K7P2Q');
select test.errore(
  format($q$insert into public.proposte_anticipo (slot_id, cliente_id, appuntamento_id, operatrice_id, nuovo_inizio, nuova_fine, canale, stato, codice)
            values (%L, %L, %L, %L, '2026-11-20 10:00+01', '2026-11-20 10:45+01', 'manuale', 'inviata', 'ZZZZ9')$q$,
         'aaaaaaaa-0000-0000-0000-00000000000a', :'maria', 'aaaaaaaa-0000-0000-0000-00000000000b', :'ilenia'),
  '23505', 'una sola proposta aperta per posto liberato');

set role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222"}', false);
select test.ok((select count(*) from public.proposte_anticipo) = 0, 'Giulia non vede le proposte di Ilenia');
reset role;

-- costi comunicati da Meta (webhook di stato)
set role service_role;
update public.log_messaggi set fatturato = true, categoria_meta = 'utility' where wa_message_id = 'wamid.4';
update public.log_messaggi set fatturato = false, categoria_meta = 'service' where wa_message_id = 'wamid.2';
reset role;
set role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111"}', false);
select test.ok((select fatturati from public.contatore_messaggi_mensile) = 1, 'contatore: 1 messaggio fatturato da Meta');
reset role;
