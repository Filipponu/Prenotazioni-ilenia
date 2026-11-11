# Prenotazioni Ilenia

Gestione delle prenotazioni per Ilenia (parrucchiera): pannello web installabile (PWA) e,
dalle prossime fasi, bot WhatsApp sull'**API Cloud ufficiale di Meta**.
Obiettivo: costo di gestione vicino a zero e nessun rischio di ban del numero.

- Piano approvato: [`docs/PIANO.md`](docs/PIANO.md)
- Come provare la fase attuale: [`docs/test-fase-1.md`](docs/test-fase-1.md)

## Stato

| Fase | Contenuto | Stato |
|---|---|---|
| 1 | Database, login, pannello (agenda, servizi, orari, clienti, impostazioni) | ✅ pronta da provare |
| 2 | Webhook WhatsApp e bot di prenotazione (numero di test Meta) | — |
| 3 | Approvazione manuale/automatica, disdette e spostamenti | — |
| 4 | Lista d'attesa (automatica e manuale) | — |
| 5 | PWA installabile, notifiche push, promemoria | — |
| 6 | Deploy e guida per la SIM su Meta Business | — |

## Struttura

```
supabase/migrations/   schema, funzioni, regole di accesso (RLS)
supabase/tests/        test SQL su un Postgres usa e getta (npm run test:db)
shared/                codice comune: fuso Europe/Rome, telefoni, orari, tipi del database
web/                   pannello Next.js esportato come file statici
strumenti/             prova del pannello nel browser con un finto Supabase
docs/                  piano e guide
```

## Comandi

```bash
npm install
npm run dev         # pannello su http://localhost:3000 (serve web/.env.local)
npm test            # test del codice condiviso
npm run typecheck
npm run build       # web/out: file statici pronti per Cloudflare
```

Nessuna chiave va nel codice: vedi [`.env.example`](.env.example).
