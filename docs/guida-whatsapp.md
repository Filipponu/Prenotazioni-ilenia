# Collegare il numero WhatsApp (SIM nuova) — guida passo passo

Si fa dopo la [messa online](guida-messa-online.md), una volta sola. Ci vuole circa un'ora, più
l'attesa delle approvazioni di Meta: da qualche minuto a 1–2 giorni per il nome visualizzato.

Si usa solo l'**API Cloud ufficiale di Meta**: nessun rischio di blocco del numero come con le app
non ufficiali.

## Prima di iniziare

- **La SIM nuova** in un telefono qualsiasi, anche vecchio, che riceva **SMS o chiamate**: serve
  solo per il codice di verifica.
- **Su quel numero WhatsApp non deve essere attivo.** Né WhatsApp né WhatsApp Business, altrimenti
  Meta rifiuta il numero. Se l'hai già attivato: nell'app **Impostazioni → Account → Elimina
  account**, poi aspetta qualche minuto.
- **Un profilo Facebook personale** (di Ilenia o tuo) per entrare negli strumenti di Meta. Le
  clienti non lo vedono.
- **L'indirizzo del pannello**, l'**indirizzo del webhook** e la **parola di verifica** che Claude ti
  ha dato alla fine della messa online.

Come nell'altra guida, token e chiavi vanno incollati **solo** nel modulo sicuro o su Cloudflare,
mai in chat.

---

## 1. Portfolio aziendale Meta

1. Vai su <https://business.facebook.com> ed entra con il profilo Facebook.
2. Crea il **portfolio aziendale**:
   - nome dell'attività come la conoscono le clienti, es. «Salone Ilenia»;
   - nome e cognome;
   - email: il Gmail del salone.

## 2. App per sviluppatori

1. Vai su <https://developers.facebook.com/apps>. Se è la prima volta, registrati come sviluppatore:
   ti chiede di confermare telefono ed email.
2. Premi **Create App**:
   - nome: `Prenotazioni Ilenia`; email: il Gmail del salone;
   - caso d'uso: **Connect with customers through WhatsApp** → **Next**;
   - portfolio: quello del punto 1 → **Next** → **Create app**.
3. Si apre **Quickstart**: premi **Start using the API**. Nella pagina **API Setup** scegli
   **Create a WhatsApp Business account** (o quello che c'è già).
4. **Manda a Claude** l'**ID dell'account WhatsApp** (WhatsApp Business Account ID) che compare
   in API Setup. Non è segreto.

Facoltativo: in API Setup c'è già un **numero di prova** di Meta, per provare il bot dal tuo
telefono prima di usare la SIM (guida Fase 2, parte C).

## 3. Aggiungere il numero della SIM

1. In **API Setup** premi **Add phone number**. Puoi farlo anche da WhatsApp Manager → **Phone
   numbers** → **Add phone number**.
2. **Nome visualizzato**: quello che le clienti vedono in chat, es. «Salone Ilenia». Meta lo approva
   solo se corrisponde all'attività: niente nomi generici come «Prenotazioni».
3. **Categoria**: **Beauty, spa and salon**.
4. Inserisci il numero (+39…) e scegli **SMS** o **chiamata**. Inserisci il codice ricevuto.
5. **Manda a Claude** l'**ID del numero** (Phone number ID), visibile in API Setup scegliendo il
   numero nel menu «From».

## 4. Token permanente (utente di sistema)

Il token di prova di API Setup scade dopo 24 ore. Per il bot serve uno permanente.

1. Apri <https://business.facebook.com/settings/system-users> e premi **Add**: nome
   `bot-prenotazioni`, ruolo **Admin**.
2. Seleziona l'utente → **Assign assets**:
   - **App** → `Prenotazioni Ilenia` → **Full control** (Manage app);
   - **WhatsApp accounts** → il tuo account → **Full control**.

   Poi premi **Assign assets**.
3. Premi **Generate token**:
   - app: `Prenotazioni Ilenia`;
   - scadenza: **Never**;
   - permessi: `whatsapp_business_messaging`, `whatsapp_business_management`, `business_management`.
4. Copia il token: compare **una volta sola**. Ti serve in due posti:
   - su **Cloudflare**, come variabile segreta `WHATSAPP_TOKEN` (vedi «Aggiungere una variabile
     su Cloudflare» nella guida alla messa online);
   - nel **modulo sicuro** che Claude ti apre, per i passi 6 e 7.

## 5. Chiave segreta dell'app e informativa privacy

1. Nell'app: **App settings → Basic**.
2. **App secret** → **Show** → copiala su Cloudflare come variabile segreta `WHATSAPP_APP_SECRET`.
   Il bot la usa per riconoscere i messaggi che arrivano davvero da Meta.
3. Nella stessa pagina compila e salva (**Save changes**):
   - **Privacy Policy URL**: `https://<indirizzo del pannello>/privacy/`. La pagina c'è già e prende
     nome e contatti dalle Impostazioni del pannello; falla rileggere a chi conosce l'attività;
   - **App icon**: l'icona del pannello, `https://<indirizzo del pannello>/icone/icona-512.png`
     (scaricala e caricala);
   - **Category**: Business and pages.
4. Su Cloudflare aggiungi anche `WHATSAPP_PHONE_NUMBER_ID` con l'ID del punto 3.

## 6. Registrazione del numero e modelli di messaggio (li fa Claude)

Con il token del punto 4 Claude lancia `strumenti/messa-online/whatsapp.mjs`, che fa tre cose.

1. **Registra il numero** sull'API Cloud. È obbligatorio e si fa solo da qui.
   - La registrazione imposta un **PIN di 6 cifre** per la verifica in due passaggi.
   - Dopo, Ilenia può sceglierne uno suo: WhatsApp Manager → **Phone numbers** → il numero →
     **Settings** → **Two-step verification** → **Change PIN**.
   - Conservalo: serve se un giorno il numero va spostato.
2. **Collega l'app all'account WhatsApp**, così i messaggi delle clienti arrivano al bot.
3. **Crea i tre modelli di messaggio**, usati solo fuori dalla finestra gratuita di 24 ore:

   | Nome | Testo |
   |---|---|
   | `conferma_appuntamento` | Ciao {{1}}, il tuo appuntamento per {{2}} è confermato per {{3}}. Ti aspettiamo! |
   | `promemoria_appuntamento` | Ciao {{1}}, ti ricordo l'appuntamento per {{2}}: {{3}}. Ti aspettiamo! |
   | `proposta_anticipo` | Ciao {{1}}, si è liberato un posto prima per {{2}}: {{3}} (ora hai {{4}}). Ti interessa? Hai {{5}} minuti per rispondere. Pulsanti: **Accetto**, **No grazie** |

   Meta li approva di solito in pochi minuti. Se ne rifiuta uno, Claude ti dice il motivo e lo
   corregge.

## 7. Webhook: l'indirizzo dove arrivano i messaggi

1. Nell'app: **WhatsApp → Configuration**. In alcune versioni: **Use cases → Connect on WhatsApp →
   Customize → Configuration**.
2. In **Webhook** premi **Edit**:
   - **Callback URL**: l'indirizzo del webhook, `https://<indirizzo del pannello>/api/whatsapp/webhook`;
   - **Verify token**: la parola di verifica che ti ha dato Claude;
   - premi **Verify and save**. Se dà errore, controlla che le due voci siano identiche, senza spazi.
3. In **Webhook fields** premi **Manage** e attiva (**Subscribe**) il campo **messages**.

## 8. Pubblicare l'app

Finché l'app è in modalità sviluppo, Meta non manda al bot i messaggi delle clienti vere.

1. In alto nella pagina dell'app (o nel menu **Publish**) passa da **Development** a **Live**.
2. Se Meta segnala qualcosa che manca (di solito informativa privacy, icona o categoria), torna al
   punto 5.

## 9. Pagamento (consigliato)

- **Gratis, senza carta**: rispondere alle clienti entro 24 ore dal loro ultimo messaggio. È quasi
  tutto il lavoro del bot.
- **A pagamento**: i **modelli** (punto 6) mandati fuori da quelle 24 ore, cioè conferme tardive,
  promemoria via WhatsApp e lista d'attesa automatica. Costano pochi centesimi l'uno, secondo il
  [listino di Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing#rate-cards-and-volume-tiers).
- Per i modelli serve una carta: WhatsApp Manager → **Settings** (Impostazioni) → **Payment
  methods** → aggiungi la carta.
- Senza carta il bot funziona lo stesso. I modelli però non partono: il pannello lo segnala e
  propone il link per scrivere dal tuo telefono. Puoi anche scegliere opzioni che non li usano:
  - promemoria **via email** o **disattivati**;
  - lista d'attesa **manuale**.
- Il conteggio del mese è in **Impostazioni → Messaggi WhatsApp del mese**.

## 10. Ultimi ritocchi nel pannello

In **Impostazioni → Lista d'attesa** scrivi il **numero WhatsApp del salone**, cioè quello della SIM.
Serve per i link «ACCETTO» della lista d'attesa manuale.

## 11. Prova finale

Dal **tuo** telefono personale:

1. scrivi «ciao» al numero del salone → arriva il menu con **Prenota / Sposta / Disdici**;
2. prenota un servizio → la richiesta compare in **Richieste** e sul telefono di Ilenia arriva la
   notifica;
3. approvala → in chat arriva la conferma;
4. scrivi «operatore» → la chat compare in **Messaggi**.

Il nome visualizzato può comparire come numero di telefono finché Meta non lo approva (1–2 giorni).

## Se qualcosa non va

| Problema | Cosa fare |
|---|---|
| Il bot non risponde | Claude controlla con `whatsapp.mjs stato`: numero registrato? app collegata? Poi verifica il webhook (campo **messages** attivo) e che l'app sia **Live** |
| «Verify and save» dà errore | Indirizzo o parola di verifica diversi da quelli di Claude; il sito deve essere già online |
| Le conferme fuori dalle 24 ore non partono | Modello non ancora approvato o carta mancante (punti 6 e 9) |
| Il numero viene rifiutato | È ancora attivo su WhatsApp: elimina l'account dall'app e riprova dopo qualche minuto |
| Limite di messaggi | Un numero nuovo può avviare conversazioni con 250 persone al giorno: per un salone basta. Le risposte a chi scrive per prima non hanno limiti |

---

## Per chi lo fa da sé (tecnico)

```bash
export WHATSAPP_TOKEN=…   # token permanente dell'utente di sistema
npm run online:whatsapp -- numeri   --account <WABA_ID>
npm run online:whatsapp -- registra --numero <PHONE_NUMBER_ID> --pin <6 cifre>
npm run online:whatsapp -- iscrivi  --account <WABA_ID>
npm run online:whatsapp -- template --account <WABA_ID>
npm run online:whatsapp -- stato    --numero <PHONE_NUMBER_ID> --account <WABA_ID>
```
