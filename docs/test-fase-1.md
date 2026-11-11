# Fase 1 — Come provarla

Cosa c'è in questa fase: database su Supabase con tutte le tabelle, login di Ilenia e pannello con
**Agenda** (giorno/settimana: crea, sposta, disdici), **Servizi**, **Orari** (settimana tipo + chiusure
e ferie), **Clienti** e **Impostazioni**. Il bot WhatsApp arriva nella Fase 2.

Tempo richiesto: circa 20 minuti.

---

## 1. Crea il progetto Supabase (gratuito)

1. Vai su <https://supabase.com>, accedi e premi **New project**.
2. Nome a piacere (es. `prenotazioni-ilenia`), una password del database (salvala in un posto sicuro)
   e una **regione europea** (es. Frankfurt). Piano **Free**.
3. Attendi un paio di minuti che il progetto sia pronto.

## 2. Crea le tabelle

1. Nel progetto apri **SQL Editor** → **New query**.
2. Copia e incolla il contenuto di questi file, **uno alla volta e in quest'ordine**, premendo **Run**
   dopo ciascuno:
   1. `supabase/migrations/20261111120000_schema.sql`
   2. `supabase/migrations/20261111120100_funzioni.sql`
   3. `supabase/migrations/20261111120200_rls.sql`
3. Ogni esecuzione deve finire con "Success. No rows returned".

## 3. Configura il login

1. **Authentication → Sign In / Providers**: lascia attivo **Email** e **disattiva "Allow new users to
   sign up"**. Così nessun estraneo può registrarsi.
2. **Authentication → URL Configuration**:
   - *Site URL*: `http://localhost:3000`
   - *Redirect URLs*: aggiungi `http://localhost:3000/login/`
   (servono per il link "Password dimenticata?"; dopo il deploy aggiungeremo l'indirizzo definitivo).

## 4. Crea l'utente di Ilenia

1. **Authentication → Users → Add user → Create new user**.
2. Email e password di Ilenia, spunta **Auto Confirm User**, premi **Create user**.
3. Controlla in **Table Editor → operatrici**: deve esserci una riga con `attiva = true`.
   Il **primo** utente creato diventa automaticamente l'operatrice attiva; gli utenti successivi
   (le future colleghe) vengono creati *non attivi* e si abilitano con:

   ```sql
   update public.operatrici set attiva = true where email = 'email.della.collega@esempio.it';
   ```

   Se per qualche motivo la riga di Ilenia non comparisse (es. utente creato prima delle tabelle),
   eseguila a mano nel SQL Editor:

   ```sql
   insert into public.operatrici (user_id, nome, email)
   select id, 'Ilenia', email from auth.users where email = 'EMAIL_DI_ILENIA';
   ```

## 5. Avvia il pannello sul tuo computer

Serve **Node.js 20 o superiore** (<https://nodejs.org>).

1. In Supabase apri **Project Settings → API Keys** (o **API**) e copia:
   - il **Project URL** (es. `https://abcd1234.supabase.co`)
   - la chiave **Publishable** (`sb_publishable_…`) oppure, nei progetti più vecchi, la chiave **anon**.
   > La chiave *secret* / *service_role* **non** va mai messa qui.
2. Nella cartella `web/` crea il file `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://abcd1234.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

3. Dalla cartella principale del progetto:

   ```bash
   npm install
   npm run dev
   ```

4. Apri <http://localhost:3000> e accedi con l'utente di Ilenia.

**Dal telefono** (stessa rete Wi-Fi): avvia con `npm run dev -- -H 0.0.0.0` e apri
`http://<indirizzo-IP-del-computer>:3000`.

## 6. Cosa provare

| # | Prova | Risultato atteso |
|---|---|---|
| 1 | Login con password sbagliata | «Email o password non corretti.» |
| 2 | **Servizi** → aggiungi Piega 45 min 25 €, Taglio 30 min, Colore + piega 120 min | Compaiono in lista; frecce ▲▼ per l'ordine; interruttore "prenotabile" |
| 3 | **Orari** → martedì 9:00–13:00 e 14:30–19:00, poi «Come martedì» sugli altri giorni → **Salva orario** | «Orario salvato»; in Agenda le ore chiuse sono grigie |
| 4 | **Orari** → due fasce sovrapposte nello stesso giorno → Salva | Messaggio d'errore, nulla viene salvato |
| 5 | **Orari** → **Aggiungi chiusura** 24–26 dicembre "Ferie" | Compare in lista; se ci sono appuntamenti in quei giorni appare un avviso |
| 6 | **Clienti** → nuova cliente con numero `333 123 4567` | Salvato come +39 333 123 4567 |
| 7 | **Clienti** → un'altra cliente con lo stesso numero | «Esiste già una cliente con questo numero» |
| 8 | **Agenda** → **+ Nuovo** (o clic su uno spazio libero) → cliente, servizio, giorno, ora | L'appuntamento compare nell'agenda |
| 9 | **Agenda** → un secondo appuntamento sovrapposto al primo | «Quell'orario si sovrappone a un altro appuntamento.» (blocco nel database) |
| 10 | **Agenda** → appuntamento di domenica o in un giorno di chiusura | Avviso «fuori orario» / «risulti chiusa» con **Salva comunque** |
| 11 | **Agenda** → trascina un appuntamento a un altro orario (su telefono: tieni premuto, poi trascina) | «Spostato alle …» |
| 12 | **Agenda** → clic su un appuntamento → **Disdici** | Sparisce; riappare barrato con «Mostra disdetti e rifiutati» |
| 13 | **Clienti** → apri una cliente | Storico appuntamenti "In programma" / "Passati" e link "Apri chat WhatsApp" |
| 14 | **Servizi** → elimina un servizio già usato | Propone di disattivarlo invece di eliminarlo |
| 15 | **Impostazioni** → cambia approvazione, telefono salone → **Salva** | «Impostazioni salvate», valori mantenuti ricaricando la pagina |

Le impostazioni del bot, della lista d'attesa e dei promemoria si possono già scegliere, ma avranno
effetto dalle fasi 2–5. Il contatore dei messaggi WhatsApp resterà a zero fino alla Fase 2.

## 7. Test automatici (facoltativi)

```bash
npm test               # date/fuso Europe/Rome, numeri di telefono, orari (33 test)
npm run typecheck      # controllo dei tipi TypeScript
npm run build          # compila il pannello come file statici in web/out

# 52 test del database (vincolo anti-sovrapposizione, regole di accesso, ecc.)
# su un Postgres USA E GETTA, ad esempio sul NAS con Docker:
#   docker run -d --name pg-test -e POSTGRES_HOST_AUTH_METHOD=trust -p 5433:5432 postgres:16
TEST_DATABASE_URL=postgres://postgres@IP-DEL-NAS:5433/postgres npm run test:db

# prova completa nel browser con un finto Supabase (serve Playwright)
bash strumenti/prova-pannello/esegui.sh
```
