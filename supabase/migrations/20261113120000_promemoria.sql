-- =====================================================================
-- Fase 5 — Promemoria del giorno prima
-- =====================================================================

-- com'è andato il promemoria (promemoria_inviato_il dice quando):
--   whatsapp        messaggio libero (la cliente aveva scritto nelle ultime 24 ore)
--   template        template WhatsApp a pagamento
--   email           email alla cliente
--   senza_contatto  la cliente non ha il canale richiesto (numero o email)
--   non_necessario  prenotato da poco: niente promemoria
--   errore          invio non riuscito (vedi log del Worker)
alter table public.appuntamenti
  add column promemoria_esito text
  check (promemoria_esito is null or promemoria_esito in
    ('whatsapp', 'template', 'email', 'senza_contatto', 'non_necessario', 'errore'));

-- Se l'orario cambia (spostato dal pannello o dal bot), il promemoria già
-- inviato non vale più: si azzera, così la cliente riceve quello giusto.
create or replace function public.azzera_promemoria_se_spostato()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.inizio is distinct from old.inizio then
    new.promemoria_inviato_il := null;
    new.promemoria_esito := null;
  end if;
  return new;
end;
$$;

create trigger appuntamenti_azzera_promemoria
  before update of inizio on public.appuntamenti
  for each row execute function public.azzera_promemoria_se_spostato();
