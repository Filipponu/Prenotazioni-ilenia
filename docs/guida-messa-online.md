# Messa online — guida passo passo

Per chi non è del mestiere. Si fa una volta sola e richiede circa mezz'ora. Il collegamento di
WhatsApp è nella guida a parte, [guida-whatsapp.md](guida-whatsapp.md), da fare dopo questa.

## Cosa crei e quanto costa

| Servizio | A cosa serve | Costo |
|---|---|---|
| **Gmail** del salone | un indirizzo unico per tutti gli account | gratis |
| **Supabase** | l'archivio: clienti, appuntamenti, servizi, orari | gratis (500 MB) |
| **Cloudflare** | il sito del pannello e il bot che risponde su WhatsApp | gratis (100.000 richieste al giorno) |
| **Resend** (facoltativo) | email di riserva e promemoria via email | gratis (3.000 email al mese) |

Le chiavi d'accesso non vanno **mai** scritte in chat né in un messaggio. Quando servono, Claude
apre un **modulo sicuro**: le incolli lì e nessuno le vede, nemmeno Claude.

---

## 1. Un Gmail per il salone

Crea un indirizzo nuovo su <https://accounts.google.com/signup>, ad esempio
`prenotazioni.salone.ilenia@gmail.com`. Usalo per **tutti** gli account di questa guida e come
email di accesso di Ilenia al pannello.

Perché lo stesso indirizzo anche per l'accesso di Ilenia: Supabase, senza altre configurazioni,
manda l'email «password dimenticata» solo agli indirizzi del proprio account.

## 2. Supabase (l'archivio)

1. Vai su <https://supabase.com/dashboard> e registrati con il Gmail del salone.
2. Se te lo chiede, crea un'**organizzazione**: nome «Salone Ilenia», piano **Free**.
3. **New project**:
   - **Name**: `prenotazioni-ilenia`;
   - **Database Password**: premi **Generate a password** e salvala in un posto sicuro (non serve
     per l'app, ma è meglio averla);
   - **Region**: scegli **Central EU (Frankfurt)** o comunque una voce in **Europa**, così i dati
     delle clienti restano in UE;
   - lascia il resto com'è e premi **Create new project**. Aspetta un paio di minuti.
4. **Manda a Claude il link della pagina** che vedi ora, tipo
   `https://supabase.com/dashboard/project/abcdefghijklmnop`. Non è segreto.
5. **Chiave temporanea per Claude**:
   - apri <https://supabase.com/dashboard/account/tokens> e premi **Generate new token**;
   - nome: `messa online`; durata: la più breve proposta;
   - copia il token (inizia con `sbp_`) e **incollalo solo nel modulo sicuro** quando Claude te lo
     chiede.

   Serve a creare le tabelle e a leggere le chiavi del progetto. Finita la messa online cancellalo
   dalla stessa pagina.

## 3. Cloudflare (il sito e il bot)

1. Registrati su <https://dash.cloudflare.com/sign-up> con il Gmail del salone e conferma l'email.
2. Nel menu a sinistra apri **Workers & Pages** (in alcune versioni sta sotto **Compute**). Se ti
   chiede un **sottodominio** `workers.dev`, scegli un nome corto, ad esempio `salone-ilenia`.
   L'indirizzo del pannello sarà `https://prenotazioni-ilenia.salone-ilenia.workers.dev`.
3. **Chiave per Claude**:
   - apri <https://dash.cloudflare.com/profile/api-tokens>;
   - premi **Create Token**, poi accanto a **Edit Cloudflare Workers** premi **Use template**;
   - **Account Resources**: Include → il tuo account;
   - **Zone Resources**: Include → All zones;
   - premi **Continue to summary**, poi **Create Token**;
   - copia il token e **incollalo solo nel modulo sicuro**.

   Serve a pubblicare il sito e anche gli aggiornamenti futuri. Puoi cancellarlo quando vuoi
   dalla stessa pagina, e crearne uno nuovo quando servirà.

## 4. La messa online (la fa Claude)

Con i due token Claude lancia due comandi.

1. `database.mjs` prepara l'archivio:
   - crea tabelle, regole di accesso e funzioni;
   - **chiude le iscrizioni libere**: nessuno può crearsi un account da solo;
   - collega l'indirizzo del pannello per i link «password dimenticata».
2. `pubblica.mjs` mette online il pannello e il bot e imposta da solo le variabili:
   - indirizzo e chiavi di Supabase;
   - chiavi delle notifiche push;
   - indirizzo del pannello;
   - parola di verifica per Meta.

Alla fine ricevi:

- l'**indirizzo del pannello**;
- l'**indirizzo del webhook** e la **parola di verifica** per collegare WhatsApp.

## 5. L'accesso di Ilenia

Da fare **dopo** il punto 4.

1. Su Supabase: **Authentication → Users → Add user → Create new user**.
2. Email: il Gmail del salone. Password: una password robusta, solo di Ilenia.
3. Spunta **Auto Confirm User** e premi **Create user**.

Il primo utente creato diventa l'operatrice principale. Poi Ilenia:

1. apre l'indirizzo del pannello e accede;
2. in **Impostazioni** compila:
   - il nome;
   - il telefono del salone;
   - l'email per le notifiche di riserva;
   - le scelte su approvazione, promemoria e lista d'attesa;
3. inserisce **Servizi** (con le durate) e **Orari**;
4. installa l'app e attiva le notifiche: guida della Fase 5, parte B, punti 2 e 3
   ([test-fase-5.md](test-fase-5.md)).

## 6. Email con Resend (facoltativo)

Serve per:

- le email di riserva a Ilenia, se le notifiche non arrivano;
- i promemoria via email alle clienti.

Passi:

1. Registrati su <https://resend.com> con il Gmail del salone.
2. **API Keys → Create API Key**, permesso **Sending access**. Copia la chiave.
3. Inseriscila su Cloudflare (vedi «Aggiungere una variabile» qui sotto) con nome `RESEND_API_KEY`,
   tipo **Secret**.
4. Senza un dominio proprio le email partono da `onboarding@resend.dev` e arrivano **solo** al
   Gmail del salone. Per le email di riserva basta.
5. Per i promemoria alle clienti serve un dominio, ad esempio `salone-ilenia.it`, circa 10 € l'anno:
   - aggiungilo su Resend in **Domains → Add domain** e segui le istruzioni;
   - poi aggiungi su Cloudflare la variabile `RESEND_FROM` con il mittente, ad esempio
     `Salone Ilenia <prenotazioni@salone-ilenia.it>`.

## Aggiungere una variabile su Cloudflare

1. Apri <https://dash.cloudflare.com>, poi **Workers & Pages** → `prenotazioni-ilenia`.
2. Vai in **Settings → Variables and Secrets** e premi **Add**.
3. **Type**: **Secret**; **Variable name**: il nome esatto (es. `RESEND_API_KEY`); **Value**: il valore.
4. Premi **Deploy**.

Le variabili inserite così restano anche quando Claude pubblica un aggiornamento.

## Aggiungere una collega

1. Su Supabase crea il suo utente: **Authentication → Users → Add user**.
2. All'inizio è **disattivata**. Per attivarla: **Table Editor** → tabella `operatrici` → riga della
   collega → colonna `attiva` = `true` → **Save**.
3. Ha la sua agenda, i suoi servizi e i suoi orari. Il bot WhatsApp prenota per l'operatrice
   principale. Per scegliere un'altra operatrice, imposta su Cloudflare la variabile
   `BOT_OPERATRICE_ID` con l'`id` della riga in `operatrici`.

## Quanto resta gratis

- **Cloudflare**: 100.000 richieste al giorno. Il salone ne usa circa 1.500: il controllo di ogni
  minuto più messaggi e pannello.
- **Supabase**: 500 MB, che bastano per anni. I progetti gratuiti si «addormentano» dopo una
  settimana senza uso: qui non succede, perché il bot lo consulta ogni minuto.
- **WhatsApp**: vedi [guida-whatsapp.md](guida-whatsapp.md).

## Se qualcosa non va

| Problema | Cosa fare |
|---|---|
| Il pannello dice «Configurazione mancante» | Rilanciare `pubblica.mjs`, oppure controllare su Cloudflare `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` |
| «Account non ancora abilitato» | L'utente non è un'operatrice attiva: vedi «Aggiungere una collega», punto 2 |
| «Password dimenticata» non manda l'email | L'email di Ilenia deve essere quella dell'account Supabase (punto 1) |
| Controllare cosa fa il bot | Cloudflare → `prenotazioni-ilenia` → **Logs**, oppure `npx wrangler tail` |

---

## Per chi lo fa da sé (tecnico)

```bash
npm ci
export SUPABASE_ACCESS_TOKEN=sbp_…        # supabase.com → Account → Access Tokens
export CLOUDFLARE_API_TOKEN=…             # modello «Edit Cloudflare Workers»
npm run online:database -- --progetto <rif>                  # tabelle, iscrizioni chiuse
npm run online:pubblica -- --progetto <rif> --email <tua email>   # build + deploy + variabili
npm run online:database -- --progetto <rif> --app-url <indirizzo stampato sopra>
```

Per gli aggiornamenti successivi basta `npm run online:pubblica -- --progetto <rif>`: le chiavi
delle notifiche e la parola di verifica di Meta si generano solo la prima volta.

Prova degli script senza account, contro servizi finti:

```bash
TEST_DATABASE_URL=postgres://… npm run test:messa-online [-- --con-build]
```
