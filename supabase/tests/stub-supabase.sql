-- Simula il minimo indispensabile di Supabase su un Postgres vuoto, così
-- le migrazioni e i test girano anche senza lo stack completo.
-- NON eseguire su un progetto Supabase vero.

create extension if not exists pgcrypto;
create schema if not exists extensions;
create schema if not exists auth;

do $$
begin
  create role anon nologin noinherit;
exception when duplicate_object then null;
end $$;
do $$
begin
  create role authenticated nologin noinherit;
exception when duplicate_object then null;
end $$;
do $$
begin
  create role service_role nologin noinherit bypassrls;
exception when duplicate_object then null;
end $$;

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if not pg_has_role(current_user, r, 'member') then
      execute format('grant %I to %I', r, current_user);
    end if;
  end loop;
end $$;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- come in Supabase: l'utente arriva dal JWT
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
