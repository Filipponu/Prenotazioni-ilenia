# Piano approvato — Prenotazioni Ilenia

Approvato l'11/11/2026. Questo documento è il riferimento per tutte le fasi.

## Decisioni confermate

1. **Architettura A**: pannello Next.js esportato come file statici + Worker TypeScript (Hono) nello
   stesso deploy Cloudflare. Motivo: il piano gratuito di Workers ha 10 ms di CPU per richiesta e
   3 MiB di codice compresso; un Next.js completo con rendering lato server rischia errori 1102
   sul webhook di WhatsApp. I file statici sono gratuiti, illimitati e non consumano CPU.
2. **Risposte a mano dal pannello** (pagina Conversazioni): un numero registrato sull'API Cloud
   non si può usare anche nell'app WhatsApp.
3. **Email delle clienti facoltativa**: il bot la chiede (con pulsante «Salta») solo se i promemoria
   sono impostati su email. Senza dominio verificato, Resend può scrivere solo a Ilenia.
4. **Rifiuto a finestra chiusa**: niente template a pagamento; il pannello offre un link wa.me
   da inviare gratis dal telefono di Ilenia.
5. **Valori predefiniti** (tutti modificabili): orari ogni 30 minuti, prenotabile con almeno 2 ore
   di anticipo e fino a 30 giorni, promemoria alle 18:00, bot in pausa 12 ore dopo "operatore",
   lista d'attesa in modalità manuale, lo spostamento dal bot si applica subito anche in modalità
   di approvazione manuale.

## Componenti

| Parte | Tecnologia |
|---|---|
| Pannello PWA | Next.js + TypeScript, `output: 'export'`, Tailwind, FullCalendar |
| API, webhook, attività programmate | Worker Cloudflare in TypeScript (Hono), dalla Fase 2 |
| Database e login | Supabase (Postgres + Auth), regole RLS, funzioni SQL atomiche |
| WhatsApp | API Cloud ufficiale di Meta (mai librerie non ufficiali) |
| Email | Resend, solo canale di riserva |
| Notifiche | Web Push (VAPID) firmato con Web Crypto |

Fuso orario Europe/Rome; interfaccia e messaggi in italiano; chiavi solo in variabili d'ambiente.

## Struttura delle cartelle

```
supabase/migrations/   schema, RLS, funzioni
supabase/tests/        test SQL eseguibili su un Postgres usa-e-getta
shared/                codice comune (tempo Europe/Rome, telefono, orari, tipi DB, disponibilità)
web/                   pannello Next.js (PWA)
worker/                Worker Cloudflare (dalla Fase 2)
docs/                  piano, guide di test per fase, guida Meta
```

## Modello dati

Tabelle: `operatrici`, `servizi`, `orari_settimanali`, `chiusure`, `clienti`, `appuntamenti`,
`lista_attesa`, `slot_liberati`, `proposte_anticipo`, `conversazioni`, `impostazioni`,
`log_messaggi`, `push_iscrizioni`; vista `contatore_messaggi_mensile`.

- Ogni servizio, orario, chiusura e appuntamento ha `operatrice_id`.
- Vincolo anti-sovrapposizione nel database (`EXCLUDE USING gist`) sugli appuntamenti
  `in_attesa` e `confermato` della stessa operatrice. Una richiesta in attesa occupa già lo slot.
- Le clienti sono condivise tra le operatrici; il resto è visibile solo all'operatrice proprietaria.

## Bot WhatsApp (Fasi 2-3)

Menu «Ciao! Sono l'assistente di Ilenia, cosa vuoi fare?» con Prenota / Sposta / Disdici.

- **Prenota**: servizio → giorno → orario → nome (se nuova) → riepilogo → conferma
  (manuale: in attesa; automatica: confermato) → «Se si libera un posto prima, vuoi essere avvisata?».
- **Sposta / Disdici**: appuntamenti futuri → limite ore (default 24) → esecuzione e conferma →
  lo slot liberato va alla lista d'attesa.
- **Operatore**: parola chiave → push a Ilenia, bot in pausa.
- Input non capito → menu. Conversazione ferma da più di 30 minuti → menu.
- Limiti Meta: 3 pulsanti (20 caratteri), liste da 10 righe (24 caratteri) → paginazione «Altri ›».

### Regole di costo

| Situazione | Messaggio |
|---|---|
| Finestra 24 h aperta | sempre libero o interattivo, mai template |
| Finestra chiusa, conferma di Ilenia | template `conferma_appuntamento`, segnalato nel pannello |
| Finestra chiusa, promemoria | template solo se l'impostazione è "template" |
| Finestra chiusa, anticipo | template solo se la lista d'attesa è "automatica" |
| Finestra chiusa, altro | nessun template: link wa.me nel pannello |

## Lista d'attesa (Fase 4)

Spazio liberato (+ tempo libero adiacente) → candidate con avvisi attivi, appuntamento successivo,
servizio che entra → dalla più lontana → una proposta alla volta (15 min) → a catena.
Modalità automatica (interattivo gratis se finestra aperta, altrimenti template) o manuale
(push a Ilenia + link wa.me tracciato + link di ritorno `ACCETTO <codice>` al numero del bot).

## Fasi

1. Database, login e pannello: servizi, orari, chiusure, clienti, agenda manuale.
2. Webhook WhatsApp e bot di prenotazione con il numero di test di Meta.
3. Approvazione manuale/automatica, disdette e spostamenti con limite ore.
4. Lista d'attesa nelle due modalità.
5. PWA installabile, notifiche push, promemoria.
6. Deploy e guida per attivare la SIM nuova su Meta Business.
