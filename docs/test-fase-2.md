# Fase 2 — Come provarla

Cosa c'è in questa fase:

- **Worker Cloudflare** (`worker/`): riceve i webhook di WhatsApp, controlla la firma di Meta, risponde
  subito 200 e lavora in background; serve anche il pannello (file statici).
- **Bot di prenotazione** guidato da pulsanti e liste:
  menu (Prenota / Sposta / Disdici) → servizio → giorno → orario → nome (se cliente nuova) → riepilogo →
  conferma → «Se si libera un posto prima, vuoi essere avvisata?».
  - approvazione **manuale**: «Richiesta ricevuta, Ilenia ti confermerà a breve» (appuntamento *in attesa*);
  - approvazione **automatica**: conferma immediata;
  - parola **«operatore»**: avvisa Ilenia e il bot tace per le ore impostate;
  - qualunque messaggio non capito: ripropone il menu;
  - conversazione lasciata a metà per più di 30 minuti: si riparte dal menu;
  - orari calcolati su durata del servizio, fasce di apertura, chiusure, appuntamenti, preavviso minimo,
    giorni prenotabili e passo (ogni 30 minuti, modificabile);
  - se due clienti scelgono lo stesso orario, vince la prima: il vincolo del database blocca la seconda,
    a cui il bot propone altri orari.
- Tutte le risposte sono **messaggi liberi o interattivi** (gratuiti fino a 1.000/mese), mai template:
  il bot risponde sempre dentro la finestra di 24 ore aperta dalla cliente. Ogni messaggio finisce nel
  registro e nel contatore delle Impostazioni.

**Sposta**, **Disdici** e l'approvazione delle richieste dal pannello sono arrivati nella Fase 3
(vedi [test-fase-3.md](test-fase-3.md)).

---

## A. Subito, senza nulla da configurare: il simulatore nella demo

Apri la demo (<https://claude.ai/artifact/Mb7uoih4oiRCEXW8DjH72w>), premi **Accedi** e vai su
**WhatsApp**. Scrivi «ciao Ilenia» e prenota come farebbe una cliente; poi apri **Agenda**: la richiesta
è lì, in arancione. Il simulatore usa lo stesso motore del bot vero.

## B. Il Worker vero sul tuo computer, con il tuo Supabase, senza Meta

Serve il progetto Supabase della Fase 1.

1. In Supabase, **Project Settings → API Keys**, copia la chiave **Secret** (`sb_secret_…`, nei progetti
   più vecchi *service_role*). Resta solo sul tuo computer e poi nei segreti di Cloudflare: mai nel browser.
2. Copia `worker/.dev.vars.example` in `worker/.dev.vars` e compila `SUPABASE_URL` e
   `SUPABASE_SECRET_KEY`. Lascia `WHATSAPP_MODALITA=simulata`: le risposte del bot compaiono nel
   terminale invece di partire su WhatsApp.
3. Avvia:

   ```bash
   npm install
   npm run build          # compila il pannello (servito dal Worker)
   npm run dev -w worker  # Worker su http://localhost:8787
   ```

4. In un secondo terminale, scrivi al bot come se fossi una cliente
   (`--segreto` = il valore di `WHATSAPP_APP_SECRET` in `.dev.vars`):

   ```bash
   node strumenti/simula-whatsapp.mjs --segreto una-stringa-di-prova "ciao Ilenia"
   node strumenti/simula-whatsapp.mjs --segreto una-stringa-di-prova --scelta menu:prenota
   ```

   Nel terminale del Worker ogni risposta mostra pulsanti e righe con il relativo `--scelta …` da copiare
   per il passo successivo (servizio, giorno, orario, conferma). Per il nome: `… "Maria Rossi"`.
5. Apri <http://localhost:8787>, accedi: la richiesta è in **Agenda**; in Supabase la trovi nelle
   tabelle `appuntamenti`, `conversazioni` e `log_messaggi`.

## C. Con il numero di test di Meta (quando avrai l'account)

1. Su <https://developers.facebook.com> crea un'app di tipo **Business** e aggiungi il prodotto
   **WhatsApp**. In **WhatsApp → API Setup** trovi: numero di test, **Phone number ID** e un **token
   temporaneo** (dura 24 ore; quello permanente lo creiamo nella Fase 6).
2. Sempre in API Setup, aggiungi il **tuo cellulare** tra i destinatari (massimo 5 numeri di prova).
3. In **App settings → Basic** copia l'**App Secret**.
4. Pubblica il Worker su Cloudflare (account gratuito):

   ```bash
   cd worker
   npx wrangler login
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_SECRET_KEY
   npx wrangler secret put WHATSAPP_APP_SECRET       # l'App Secret di Meta
   npx wrangler secret put WHATSAPP_VERIFY_TOKEN     # una parola a scelta
   npx wrangler secret put WHATSAPP_TOKEN            # il token di API Setup
   npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID  # il Phone number ID
   cd .. && npm run build && npm run deploy -w worker
   ```

   Wrangler stampa l'indirizzo, es. `https://prenotazioni-ilenia.<tuo-account>.workers.dev`.
5. In Meta, **WhatsApp → Configuration → Webhook → Edit**:
   - *Callback URL*: `https://prenotazioni-ilenia.<tuo-account>.workers.dev/api/whatsapp/webhook`
   - *Verify token*: la stessa parola di `WHATSAPP_VERIFY_TOKEN` → **Verify and save**
   - in *Webhook fields* attiva **messages**.
6. Dal tuo cellulare scrivi «ciao» al numero di test: il bot risponde con i pulsanti.
7. In Supabase **Authentication → URL Configuration** aggiungi anche l'indirizzo `workers.dev` tra i
   Redirect URLs (per il recupero password dal pannello pubblicato).

Se il bot non risponde: `npx wrangler tail` (dalla cartella `worker/`) mostra i log in tempo reale.
Gli errori più comuni sono token scaduto (24 ore) o numero non aggiunto tra i destinatari di prova.

## Test automatici

```bash
npm test          # 79 test del codice condiviso (orari liberi, messaggi, firma, conversazioni del bot)
                  # + 10 test del Worker (verifica webhook, firma, risposte, duplicati)
npm run typecheck
npm run build && npm run verifica-build -w worker   # pacchetto del Worker (limite gratuito: 3 MiB)
```
