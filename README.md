# Prenotazioni Ilenia

Gestione delle prenotazioni per Ilenia (parrucchiera): pannello web installabile (PWA) e,
dalle prossime fasi, bot WhatsApp sull'**API Cloud ufficiale di Meta**.
Obiettivo: costo di gestione vicino a zero e nessun rischio di ban del numero.

- Piano approvato: [`docs/PIANO.md`](docs/PIANO.md)
- Come provare: [Fase 1](docs/test-fase-1.md) · [Fase 2](docs/test-fase-2.md)

## Stato

| Fase | Contenuto | Stato |
|---|---|---|
| 1 | Database, login, pannello (agenda, servizi, orari, clienti, impostazioni) | ✅ pronta da provare |
| 2 | Webhook WhatsApp e bot di prenotazione (numero di test Meta) | ✅ pronta (provata con messaggi simulati; manca l'account Meta) |
| 3 | Approvazione manuale/automatica, disdette e spostamenti | — |
| 4 | Lista d'attesa (automatica e manuale) | — |
| 5 | PWA installabile, notifiche push, promemoria | — |
| 6 | Deploy e guida per la SIM su Meta Business | — |

## Struttura

```
supabase/migrations/   schema, funzioni, regole di accesso (RLS)
supabase/tests/        test SQL su un Postgres usa e getta (npm run test:db)
shared/                codice comune: fuso Europe/Rome, telefoni, orari liberi, messaggi WhatsApp,
                       motore del bot, tipi del database, Supabase finto della demo
web/                   pannello Next.js esportato come file statici (+ demo in un solo file)
worker/                Worker Cloudflare: webhook WhatsApp, bot, file statici del pannello
strumenti/             prove nel browser, Supabase finto in locale, simulatore di messaggi WhatsApp
docs/                  piano e guide
```

## Comandi

```bash
npm install
npm run dev         # pannello su http://localhost:3000 (serve web/.env.local)
npm test            # test del codice condiviso e del Worker
npm run dev -w worker   # Worker + pannello su http://localhost:8787 (serve worker/.dev.vars)
npm run typecheck
npm run build       # web/out: file statici pronti per Cloudflare
```

Nessuna chiave va nel codice: vedi [`.env.example`](.env.example).

## Versione dimostrativa

Per far vedere il pannello senza Supabase né WhatsApp: stessi componenti, dati di esempio
(servizi, orari, clienti e appuntamenti della settimana in corso) che restano nel browser.

```bash
npm run demo -w web    # crea web/demo/dist/prenotazioni-ilenia-demo.html (un solo file)
```

Il file si apre con un qualsiasi server statico (es. `npx serve web/demo/dist`). In alternativa
`NEXT_PUBLIC_DEMO=1 npm run build` produce la stessa demo come sito statico in `web/out`.
