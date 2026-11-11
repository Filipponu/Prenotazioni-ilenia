-- =====================================================================
-- Sicurezza: privilegi e regole RLS (Row Level Security)
--
-- - anon (visitatore non loggato): nessun accesso.
-- - authenticated: solo se è un'operatrice attiva.
--     * servizi, orari, chiusure, appuntamenti, lista d'attesa,
--       impostazioni, push: solo le righe della propria operatrice_id
--     * clienti, conversazioni, log messaggi: condivisi nel salone
-- - service_role (Worker Cloudflare, chiave segreta): accesso completo,
--   bypassa RLS. Non va MAI usata nel browser.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Privilegi di base: si parte da zero e si concede solo il necessario
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

grant select on public.operatrici to authenticated;
grant update (nome) on public.operatrici to authenticated;

grant select, insert, update, delete on
  public.servizi,
  public.orari_settimanali,
  public.chiusure,
  public.clienti,
  public.appuntamenti,
  public.lista_attesa
to authenticated;

grant select, update on public.impostazioni to authenticated;
grant select, update on public.conversazioni to authenticated;
-- lista d'attesa: le azioni passano dal Worker, il pannello legge soltanto
grant select on public.slot_liberati, public.proposte_anticipo to authenticated;
grant select on public.log_messaggi, public.contatore_messaggi_mensile to authenticated;
grant select, insert, delete on public.push_iscrizioni to authenticated;

-- ---------------------------------------------------------------------
-- Attivazione RLS
-- ---------------------------------------------------------------------
alter table public.operatrici        enable row level security;
alter table public.servizi           enable row level security;
alter table public.orari_settimanali enable row level security;
alter table public.chiusure          enable row level security;
alter table public.clienti           enable row level security;
alter table public.appuntamenti      enable row level security;
alter table public.lista_attesa      enable row level security;
alter table public.slot_liberati     enable row level security;
alter table public.proposte_anticipo enable row level security;
alter table public.conversazioni     enable row level security;
alter table public.impostazioni      enable row level security;
alter table public.log_messaggi      enable row level security;
alter table public.push_iscrizioni   enable row level security;

-- ---------------------------------------------------------------------
-- Operatrici: le colleghe si vedono tra loro; ognuna modifica solo il
-- proprio nome (il privilegio di colonna impedisce di cambiare "attiva").
-- ---------------------------------------------------------------------
create policy operatrici_lettura on public.operatrici
  for select to authenticated
  using ((select public.e_operatrice()));

create policy operatrici_modifica_se_stessa on public.operatrici
  for update to authenticated
  using (user_id = (select auth.uid()) and attiva)
  with check (user_id = (select auth.uid()) and attiva);

-- ---------------------------------------------------------------------
-- Tabelle "personali" dell'operatrice
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'servizi', 'orari_settimanali', 'chiusure', 'appuntamenti', 'lista_attesa',
    'slot_liberati', 'proposte_anticipo', 'impostazioni', 'push_iscrizioni'
  ] loop
    execute format(
      'create policy %I on public.%I
         for all to authenticated
         using (operatrice_id = (select public.operatrice_corrente()))
         with check (operatrice_id = (select public.operatrice_corrente()))',
      t || '_solo_proprie', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Tabelle condivise del salone
-- ---------------------------------------------------------------------
create policy clienti_operatrici on public.clienti
  for all to authenticated
  using ((select public.e_operatrice()))
  with check ((select public.e_operatrice()));

create policy conversazioni_operatrici on public.conversazioni
  for all to authenticated
  using ((select public.e_operatrice()))
  with check ((select public.e_operatrice()));

create policy log_messaggi_operatrici on public.log_messaggi
  for select to authenticated
  using ((select public.e_operatrice()));
