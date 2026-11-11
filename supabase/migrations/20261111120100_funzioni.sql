-- =====================================================================
-- Funzioni di supporto, trigger e viste
-- =====================================================================

-- ---------------------------------------------------------------------
-- aggiornato_il automatico
-- ---------------------------------------------------------------------
create or replace function public.tocca_aggiornato_il()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.aggiornato_il := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'operatrici', 'servizi', 'orari_settimanali', 'chiusure', 'clienti', 'appuntamenti',
    'lista_attesa', 'slot_liberati', 'proposte_anticipo', 'conversazioni', 'impostazioni'
  ] loop
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.tocca_aggiornato_il()',
      t || '_aggiornato_il', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Un appuntamento può usare solo un servizio della stessa operatrice
-- ---------------------------------------------------------------------
create or replace function public.verifica_servizio_appuntamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.servizio_id is not null and not exists (
    select 1 from public.servizi s
    where s.id = new.servizio_id and s.operatrice_id = new.operatrice_id
  ) then
    raise exception 'Il servizio non appartiene a questa operatrice'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger appuntamenti_verifica_servizio
  before insert or update of servizio_id, operatrice_id on public.appuntamenti
  for each row execute function public.verifica_servizio_appuntamento();

-- ---------------------------------------------------------------------
-- Chi è l'operatrice collegata? (usate dalle regole RLS)
-- security definer: leggono operatrici senza passare dalle sue regole RLS.
-- ---------------------------------------------------------------------
create or replace function public.operatrice_corrente()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
  from public.operatrici o
  where o.user_id = auth.uid() and o.attiva
$$;

create or replace function public.e_operatrice()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.operatrici o where o.user_id = auth.uid() and o.attiva
  )
$$;

revoke execute on function public.operatrice_corrente() from public, anon;
revoke execute on function public.e_operatrice() from public, anon;
grant execute on function public.operatrice_corrente() to authenticated, service_role;
grant execute on function public.e_operatrice() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Ogni nuova operatrice riceve le impostazioni predefinite
-- ---------------------------------------------------------------------
create or replace function public.crea_impostazioni_operatrice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.impostazioni (operatrice_id) values (new.id)
  on conflict (operatrice_id) do nothing;
  return new;
end;
$$;

create trigger operatrici_crea_impostazioni
  after insert on public.operatrici
  for each row execute function public.crea_impostazioni_operatrice();

-- ---------------------------------------------------------------------
-- Collegamento automatico utente → operatrice
--
-- Il PRIMO utente creato in Supabase Auth diventa operatrice attiva
-- (Ilenia). Gli utenti successivi vengono registrati come operatrici NON
-- attive: non vedono nulla finché non le si attiva a mano con
--   update public.operatrici set attiva = true where email = '...';
-- Così, anche se per errore le registrazioni restassero aperte, un
-- estraneo non potrebbe accedere ai dati.
-- ---------------------------------------------------------------------
create or replace function public.crea_operatrice_da_utente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prima boolean;
begin
  -- evita che due creazioni simultanee risultino entrambe "prima"
  perform pg_advisory_xact_lock(hashtext('crea_operatrice_da_utente'));
  select not exists (select 1 from public.operatrici) into prima;

  insert into public.operatrici (user_id, nome, email, attiva)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'nome'), ''),
      initcap(replace(split_part(coalesce(new.email, 'operatrice'), '@', 1), '.', ' '))
    ),
    new.email,
    prima
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger auth_utente_crea_operatrice
  after insert on auth.users
  for each row execute function public.crea_operatrice_da_utente();

-- ---------------------------------------------------------------------
-- Salva l'intero orario settimanale dell'operatrice collegata in un colpo
-- solo: tutto o niente (se una fascia non è valida non cambia nulla).
-- fasce: [{"giorno": 1, "ora_inizio": "09:00", "ora_fine": "13:00"}, …]
-- ---------------------------------------------------------------------
create or replace function public.salva_orari_settimanali(fasce jsonb)
returns setof public.orari_settimanali
language plpgsql
security invoker
set search_path = ''
as $$
declare
  op uuid := public.operatrice_corrente();
begin
  if op is null then
    raise exception 'Operatrice non riconosciuta' using errcode = '42501';
  end if;

  delete from public.orari_settimanali where operatrice_id = op;

  insert into public.orari_settimanali (operatrice_id, giorno, ora_inizio, ora_fine)
  select op, (f ->> 'giorno')::smallint, (f ->> 'ora_inizio')::time, (f ->> 'ora_fine')::time
  from jsonb_array_elements(coalesce(fasce, '[]'::jsonb)) as f;

  return query
    select * from public.orari_settimanali o
    where o.operatrice_id = op
    order by o.giorno, o.ora_inizio;
end;
$$;

revoke execute on function public.salva_orari_settimanali(jsonb) from public, anon;
grant execute on function public.salva_orari_settimanali(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Contatore mensile dei messaggi WhatsApp (mese calcolato in UTC, come
-- la fatturazione di Meta). security_invoker: rispetta le regole RLS.
-- ---------------------------------------------------------------------
create view public.contatore_messaggi_mensile
with (security_invoker = true)
as
select
  to_char(date_trunc('month', l.creato_il at time zone 'UTC'), 'YYYY-MM') as mese,
  (count(*) filter (where l.direzione = 'out' and l.costo = 'libero'))::integer as liberi,
  (count(*) filter (where l.direzione = 'out' and l.costo = 'template'))::integer as template,
  (count(*) filter (where l.direzione = 'in'))::integer as ricevuti
from public.log_messaggi l
group by 1;
