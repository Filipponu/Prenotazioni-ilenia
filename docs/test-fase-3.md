# Fase 3 — Come provarla

Cosa c'è in questa fase:

- **Richieste** (nuova pagina del pannello): le prenotazioni arrivate su WhatsApp in attesa, con
  **Approva** e **Rifiuta**. Il numero accanto alla voce di menu dice quante sono.
  - Approva → appuntamento confermato e messaggio alla cliente:
    - gratuito se la cliente ha scritto nelle ultime 24 ore (l'etichetta verde dice quanto tempo resta);
    - altrimenti con il **template** `conferma_appuntamento` (a pagamento): il pulsante diventa
      «Approva (template)» e l'appuntamento resta segnato «Conferma inviata con template».
  - Rifiuta (con motivo facoltativo) → messaggio gratuito con il pulsante «Scegli altro orario» se la
    finestra è aperta; se è chiusa **nessun template**: il pannello apre WhatsApp sul tuo telefono con il
    messaggio già scritto (link wa.me).
  - Gli stessi pulsanti compaiono aprendo una richiesta (in arancione) dall'**Agenda**.
- **Messaggi** (nuova pagina): tutte le chat con le clienti. In cima chi ha scritto «operatore»
  («Vuole parlare con te»); rispondi da qui gratis entro 24 ore dal suo ultimo messaggio, poi premi
  **Riattiva il bot**. Oltre le 24 ore il pannello offre «Scrivile da WhatsApp».
- **Bot: Sposta e Disdici**
  - mostra gli appuntamenti futuri della cliente (se ne ha uno solo lo propone direttamente);
  - se mancano meno ore del limite (24, da Impostazioni) rimanda al telefono del salone;
  - **Sposta**: nuovo giorno e orario (il posto attuale conta come libero), riepilogo «Da… A…»,
    conferma. Una richiesta ancora in attesa resta in attesa.
  - **Disdici**: «Confermi la disdetta…?» → disdetto, e la cliente esce dalla lista d'attesa per
    quell'appuntamento.
  - Ilenia riceve un avviso per ogni disdetta e spostamento (notifiche push nella Fase 5).
- **Telefono**: la barra in basso ha Agenda, Richieste, Messaggi, Clienti e **Altro** (Servizi, Orari,
  Impostazioni).

Il posto lasciato libero da una disdetta o da uno spostamento sarà proposto alla lista d'attesa
nella Fase 4.

---

## A. Subito: nella demo

Apri la demo (<https://claude.ai/artifact/Mb7uoih4oiRCEXW8DjH72w>) e premi **Accedi**. I dati di
esempio contengono già tre richieste e una cliente che ha chiesto di parlare con te.

1. **Richieste**:
   - Elena ha scritto 2 ore fa: «Conferma gratuita». Premi **Approva**.
   - Martina ha scritto ieri: premi **Approva (template)**.
   - Valentina: **Rifiuta** con un motivo; si apre «Avvisa la cliente» con il link a WhatsApp.
2. **Messaggi** → Giulia («Vuole parlare con te») → scrivi una risposta → **Riattiva il bot**.
3. **Altro → Prova il bot** → «Scrivi come: Elena Marino». In chat vedi la conferma di Ilenia; poi
   scrivi «ciao» e prova **Sposta** e **Disdici**. Le modifiche compaiono in Agenda.

«Ripristina dati di esempio», nella fascia gialla in alto, rimette tutto com'era.

## B. Con il tuo Supabase e il Worker in locale (senza Meta)

Come nella guida della Fase 2 (parte B), con in più:

1. Pannello e Worker sullo stesso indirizzo:

   ```bash
   npm run build
   npm run dev -w worker      # http://localhost:8787 (pannello + API)
   ```

   Se preferisci `npm run dev` sul pannello (porta 3000) mentre il Worker gira sulla 8787, aggiungi
   a `web/.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:8787`.
2. Crea una richiesta con lo script (Fase 2), poi approvala da **Richieste**. Nel terminale del
   Worker compare il messaggio che partirebbe alla cliente (testo libero o template).
3. Per Sposta e Disdici:

   ```bash
   node strumenti/simula-whatsapp.mjs --segreto <segreto> --scelta menu:sposta
   node strumenti/simula-whatsapp.mjs --segreto <segreto> --scelta menu:disdici
   ```

## C. Con il numero di test di Meta

Come nella guida della Fase 2 (parte C). Il template `conferma_appuntamento` va creato e approvato in
**WhatsApp Manager → Modelli di messaggio**:

- categoria **Utility**, lingua **Italiano**, nome `conferma_appuntamento`;
- testo: `Ciao {{1}}, il tuo appuntamento per {{2}} è confermato per {{3}}. Ti aspettiamo!`
  (esempi: `Maria`, `Piega`, `giovedì 13 novembre alle 10:30`).

Finché il template non è approvato, le conferme a finestra chiusa non partono: l'errore compare
nei log del Worker (`npx wrangler tail`). La guida completa ai template è nella Fase 6.

## Test automatici

```bash
npm test     # 99 test del codice condiviso (+ approvazione, rifiuto, finestra 24 h, sposta e disdici)
             # 19 test del Worker (+ accesso alle API del pannello, CORS, errori)
npm run typecheck
bash strumenti/prova-pannello/esegui.sh   # prova completa del pannello nel browser
```
