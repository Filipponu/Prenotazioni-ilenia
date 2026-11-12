-- =====================================================================
-- Fase 4 — Lista d'attesa
-- =====================================================================

-- Numero WhatsApp del bot (la SIM del salone), nel formato wa_id
-- (es. 393331234567). Serve nella modalità manuale: il messaggio che Ilenia
-- invia dal suo telefono contiene il link «ACCETTO <codice>» verso il bot.
alter table public.impostazioni
  add column numero_whatsapp text
  check (numero_whatsapp is null or numero_whatsapp ~ '^[1-9][0-9]{7,14}$');

-- una sola proposta aperta alla volta per ogni posto liberato
create unique index proposte_una_attiva_per_slot
  on public.proposte_anticipo (slot_id)
  where stato in ('da_inviare', 'inviata');

-- ---------------------------------------------------------------------
-- Costi reali comunicati da Meta nei webhook di stato (oggetto "pricing":
-- billable, category). La franchigia di 1.000 riguarda i messaggi di
-- servizio CONSEGNATI; senza metodo di pagamento Meta non consegna oltre.
-- ---------------------------------------------------------------------
alter table public.log_messaggi
  add column fatturato boolean,
  add column categoria_meta text;

create or replace view public.contatore_messaggi_mensile
with (security_invoker = true)
as
select
  to_char(date_trunc('month', l.creato_il at time zone 'UTC'), 'YYYY-MM') as mese,
  (count(*) filter (where l.direzione = 'out' and l.costo = 'libero'))::integer as liberi,
  (count(*) filter (where l.direzione = 'out' and l.costo = 'template'))::integer as template,
  (count(*) filter (where l.direzione = 'in'))::integer as ricevuti,
  -- messaggi che Meta ha dichiarato a pagamento (billable = true)
  (count(*) filter (where l.direzione = 'out' and l.fatturato))::integer as fatturati
from public.log_messaggi l
group by 1;
