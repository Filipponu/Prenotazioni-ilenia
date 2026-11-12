# Fase 4 — Come provarla

Cosa c'è in questa fase: la **lista d'attesa per anticipare**.

1. **Un posto si libera** quando:
   - una cliente disdice o sposta dal bot;
   - Ilenia rifiuta una richiesta;
   - Ilenia disdice dall'Agenda: c'è l'interruttore «Proponi il posto alla lista d'attesa», attivo di
     serie.
2. **Lo spazio libero** è il posto liberato più l'eventuale tempo libero vicino, dentro l'orario di
   apertura. Così può entrarci anche un servizio più lungo.
3. **Le candidate** sono le clienti iscritte (hanno risposto «Sì» a «vuoi essere avvisata?») con:
   - un appuntamento confermato più avanti;
   - un servizio che entra nello spazio.

   Si parte da chi ha l'appuntamento **più lontano**, una proposta alla volta.
4. **Niente proposte** per posti che iniziano tra meno del preavviso minimo (2 ore, da Impostazioni).
5. **Tempo per rispondere**: 15 minuti, da Impostazioni. Senza risposta, o con un «No grazie», si
   passa alla successiva. Il controllo gira **ogni minuto** nel Worker.
6. **Se accetta**, l'appuntamento si sposta subito. Il suo vecchio posto si libera e viene proposto alle
   altre, **a catena**.
7. **Il posto in proposta resta bloccato**: il bot non lo offre ad altre clienti finché la proposta è
   aperta.

## Le due modalità (Impostazioni → Lista d'attesa)

| | Manuale (gratis, predefinita) | Automatica |
|---|---|---|
| Chi scrive alla cliente | Ilenia, dal suo telefono | il bot |
| Costo | zero | gratis se la cliente ha scritto nelle ultime 24 ore, altrimenti template `proposta_anticipo` a pagamento |
| Come risponde la cliente | tocca il link nel messaggio: si apre la chat col bot con «ACCETTO K7P2Q» già scritto, lo invia e l'appuntamento si sposta da solo | pulsanti **Accetto** / **No grazie** |
| Pannello | **Lista d'attesa**: «Apri WhatsApp e invia» (fa partire i 15 minuti), poi «Ha accettato» / «Non le interessa» se ti risponde a voce o sul tuo numero | solo da guardare |

Per il link «ACCETTO» serve, in **Impostazioni → Lista d'attesa**, il **numero WhatsApp del salone**
(la SIM del bot). Senza numero il messaggio dice «rispondimi entro 15 minuti» e segni tu la risposta.

La voce di menu **Lista d'attesa** (su telefono sotto **Altro**) mostra:
- le proposte in corso;
- le clienti iscritte, con «Togli»;
- com'è andata per gli ultimi posti liberati.

Il numero sul badge indica le proposte che aspettano di essere inviate da te.

## Contatore dei messaggi

Il contatore in **Impostazioni** ora mostra anche **«Fatturati da Meta»**: è il conteggio ufficiale
che Meta invia con ogni conferma di consegna (campo `billable` del webhook). Regole dal listino di Meta:
- le prime 1.000 risposte **consegnate** ogni mese sono gratuite, per ogni numero;
- oltre quella soglia le risposte si pagano, e senza un metodo di pagamento sull'account Meta non le
  consegna;
- i template utility si pagano sempre, anche dentro le 24 ore (dal 1° ottobre 2026);
- gli sconti a scaglioni valgono solo per utility e autenticazione, contati su tutto il portfolio
  aziendale.

I prezzi per l'Italia sono nel
[listino di Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing#rate-cards-and-volume-tiers),
che si aggiorna ogni trimestre. Per questo non sono scritti nel codice.

---

## A. Subito: nella demo

Apri la demo (<https://claude.ai/artifact/Mb7uoih4oiRCEXW8DjH72w>) e premi **Accedi**. Se l'avevi già
usata, premi «Ripristina dati di esempio». Ci sono tre iscritte: Maria, Chiara e Francesca, con
appuntamenti la settimana prossima.

1. **Manuale**:
   1. **Altro → Prova il bot** → «Scrivi come: Sara Ricci» → scrivi «disdici» → **Sì, disdici**.
      Compare l'avviso «Si è liberato un posto: proponilo a Francesca Romano».
   2. **Lista d'attesa**: premi **Apri WhatsApp e invia**. Si apre WhatsApp col messaggio pronto e
      parte il tempo.
   3. **Prova il bot** → «Scrivi come: Francesca Romano» → scrivi `ACCETTO` seguito dal codice (lo
      trovi nel messaggio). Risposta: «Fatto! Il tuo appuntamento per Piega è anticipato…».
   4. In **Agenda** Francesca è spostata. In **Lista d'attesa** il posto risulta «Assegnato a
      Francesca Romano».
2. **Automatica**:
   1. **Impostazioni** → Lista d'attesa → **Automatica** → Salva.
   2. **Prova il bot** come Maria Rossi → disdici.
   3. Poi «Scrivi come: Chiara Colombo»: trovi la proposta con **Accetto** / **No grazie**.
3. **Agenda**: apri un appuntamento della settimana prossima → **Disdici** → l'interruttore «Proponi il
   posto alla lista d'attesa» è attivo.

## B. Con il tuo Supabase e il Worker in locale

1. Applica la nuova migrazione `supabase/migrations/20261112120000_lista_attesa.sql` (SQL Editor →
   incolla → Run).
2. Avvia come nella Fase 3 (`npm run build` e `npm run dev -w worker`).
   - Il controllo delle scadenze in locale si lancia con
     `curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"`. Wrangler lo espone in sviluppo
     con `npx wrangler dev --test-scheduled`.
   - Una volta pubblicato, gira da solo ogni minuto.
3. Con lo script di simulazione:
   1. crea una prenotazione e rispondi «Sì» alla lista d'attesa;
   2. disdici da un altro numero (`--da`) un appuntamento che viene prima;
   3. la proposta compare in **Lista d'attesa** (manuale) o nel terminale del Worker (automatica).

## C. Con il numero di Meta

Serve un secondo template da far approvare in **WhatsApp Manager → Modelli di messaggio**, usato
solo in modalità automatica a finestra chiusa:

- nome `proposta_anticipo`, categoria **Utility**, lingua **Italiano**;
- testo: `Ciao {{1}}, si è liberato un posto prima per {{2}}: {{3}} (ora hai {{4}}). Ti interessa? Hai {{5}} minuti per rispondere.`
- due pulsanti **risposta rapida**: `Accetto` e `No grazie`.

## Test automatici

```bash
npm test     # 117 test condivisi (+ 18 sulla lista d'attesa: candidate, ordine, spazio, preavviso,
             #   scadenze, rifiuto, accettazione, catena, posto preso nel frattempo, codici)
             # 23 test del Worker (+ link tracciato, API lista d'attesa, lavoro ogni minuto)
npm run test:db                            # 57 controlli SQL (con un Postgres usa e getta)
bash strumenti/prova-pannello/esegui.sh    # prova del pannello nel browser
```
