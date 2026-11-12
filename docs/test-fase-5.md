# Fase 5 — Come provarla

Cosa c'è in questa fase:

1. **App installabile (PWA).** Il pannello si installa come un'app normale: icona con le forbici sulla
   schermata Home, si apre a tutto schermo e funziona su telefono e computer. Senza rete si apre
   comunque, ma i dati arrivano solo con internet.
2. **Notifiche push a Ilenia** su ogni dispositivo dove le attiva (Impostazioni → **App e notifiche**):
   - nuova richiesta (o prenotazione confermata, con l'approvazione automatica);
   - cliente che scrive «operatore» e messaggi durante la pausa del bot;
   - disdette e spostamenti;
   - lista d'attesa: posto da proporre (manuale), proposta inviata o accettata (automatica).

   Toccando la notifica si apre la pagina giusta (Richieste, Messaggi, Lista d'attesa, Agenda).
3. **Email di riserva.** Se nessun dispositivo riceve la notifica, Ilenia riceve un'email all'indirizzo
   «Email per le notifiche di riserva». Vale solo per ciò che richiede un'azione: nuove richieste,
   «operatore», posti da proporre. Le email partono con **Resend** (gratis fino a 3.000 al mese).
4. **Promemoria del giorno prima** alle clienti con un appuntamento confermato. Si sceglie in
   Impostazioni:
   - **Disattivato** (predefinito).
   - **Email** (gratis): solo alle clienti con l'email in anagrafica. Con questa scelta il bot chiede
     l'email quando una cliente prenota (si può saltare).
   - **WhatsApp**: gratis se la cliente ha scritto nelle ultime 24 ore; altrimenti template
     `promemoria_appuntamento`, a pagamento.

   Parte all'**orario scelto** (18:00 di serie) e una sola volta per appuntamento. Non lo riceve chi ha
   prenotato da meno di 2 ore. Se l'appuntamento viene spostato, il promemoria si azzera e parte quello
   con il nuovo orario. Aprendo un appuntamento in Agenda si vede com'è andato (inviato su WhatsApp,
   con template, via email, manca il contatto, non riuscito).

---

## A. Subito: nella demo

Apri la demo (<https://claude.ai/artifact/Mb7uoih4oiRCEXW8DjH72w>) e premi **Accedi**.

1. **Impostazioni → Promemoria del giorno prima**: scegli **WhatsApp**, premi **Salva**, poi
   **Invia ora i promemoria**. Nella demo partono subito, senza aspettare le 18:00, per il primo giorno
   con appuntamenti confermati.
2. **Prova il bot** → «Scrivi come» una delle clienti indicate nell'avviso: in chat c'è il promemoria.
3. **Agenda** → apri quell'appuntamento: l'etichetta dice «Promemoria inviato…».
4. Scegli **Email**, salva, poi in **Prova il bot** prenota come «Nuova cliente»: dopo il nome il bot
   chiede l'email.

Nella demo app installabile e notifiche push non funzionano: la scheda «App e notifiche» lo spiega.

## B. Sul telefono e sul computer, con il sito vero

Serve il pannello pubblicato su un indirizzo `https://` (Fase 6). In locale funziona anche
`http://localhost:8787`.

### 1. Chiavi delle notifiche (una volta sola)

```bash
node strumenti/genera-chiavi-vapid.mjs
```

Stampa tre righe:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` va in `web/.env.local` e serve alla compilazione del pannello;
- `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` vanno nel Worker. La privata **solo** lì:
  `npx wrangler secret put VAPID_PRIVATE_KEY`; in locale in `worker/.dev.vars`.

Nel Worker servono anche:

- `VAPID_SUBJECT`: `mailto:` seguito dalla tua email;
- `APP_URL`: l'indirizzo del pannello, per aprire la pagina giusta dalla notifica.

Se rigeneri le chiavi, le notifiche vanno riattivate su ogni dispositivo.

### 2. Installare l'app

- **Android (Chrome)**: Impostazioni → **Installa l'app**, oppure menu ⋮ → «Installa app».
- **iPhone/iPad** (iOS 16.4 o più recente):
  1. apri il sito con **Safari**;
  2. tocca **Condividi**, poi **Aggiungi alla schermata Home**;
  3. apri l'app **dall'icona**.

  Su iPhone le notifiche funzionano **solo** nell'app aggiunta alla schermata Home, non in Safari.
- **Computer (Chrome/Edge)**: icona di installazione nella barra degli indirizzi, oppure
  Impostazioni → **Installa l'app**.

### 3. Attivare le notifiche

Impostazioni → **App e notifiche** → **Attiva le notifiche** → consenti. Poi **Manda una prova**:
deve arrivare «Notifiche attive». Ripeti su ogni dispositivo: telefono, computer del salone, tablet.

Per provare un avviso vero, crea una richiesta col simulatore (guida Fase 2, parte B): arriva «Nuova
richiesta da approvare». Toccandola si apre **Richieste**.

### 4. Email (Resend)

1. Crea un account gratuito su <https://resend.com> e una **API key**.
2. Mettila nel Worker: `npx wrangler secret put RESEND_API_KEY`.
3. **Senza dominio** il mittente è `onboarding@resend.dev`, che può scrivere **solo all'email con cui
   ti sei registrata su Resend**. Basta per le email di riserva a Ilenia, non per i promemoria alle
   clienti.
4. **Per scrivere alle clienti** serve un dominio (es. `salone-ilenia.it`, circa 10 € l'anno).
   Verificalo su Resend (Domains → Add domain, poi i record DNS indicati), quindi imposta
   `RESEND_FROM`, ad esempio `Salone Ilenia <prenotazioni@salone-ilenia.it>`.

### 5. Promemoria via WhatsApp: il template

In **WhatsApp Manager → Modelli di messaggio** crea:

- categoria **Utility**, lingua **Italiano**, nome `promemoria_appuntamento`;
- testo: `Ciao {{1}}, ti ricordo l'appuntamento per {{2}}: {{3}}. Ti aspettiamo!`
  (esempi: `Maria`, `Piega`, `martedì 17 novembre alle 10:00`).

Finché il template non è approvato, i promemoria alle clienti fuori dalle 24 ore non partono:
l'appuntamento resta segnato «Promemoria non riuscito».

### 6. Controllo dei promemoria senza aspettare

Imposta l'orario di invio a qualche minuto da adesso e crea un appuntamento confermato per domani
con una cliente che ha l'email (o il numero). Entro un minuto dall'orario scelto il Worker lo invia:
lo vedi nei log (`npx wrangler tail`) e nell'etichetta dell'appuntamento.

## Test automatici

```bash
npm test                # 130 test del codice condiviso (+ cifratura push sugli esempi ufficiali
                        #   RFC 8291/8292, promemoria, email chiesta dal bot)
                        # 30 test del Worker (+ notifiche push, email di riserva, prova, promemoria nel cron)
npm run typecheck
npm run test:db         # + esito del promemoria e azzeramento quando l'appuntamento si sposta
bash strumenti/prova-pannello/esegui.sh
                        # + manifest e icone, service worker, attiva/prova/disattiva notifiche,
                        #   una push consegnata al service worker e mostrata, istruzioni iPhone
```

Le icone si rigenerano con `node strumenti/genera-icone.mjs`.
