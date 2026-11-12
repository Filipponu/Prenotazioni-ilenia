/**
 * Tutti i testi del bot WhatsApp, in un solo posto.
 * Regola: frasi brevi, tono cordiale, nessuna informazione inutile.
 */

export const TESTI = {
  menu: (cliente: string | null, operatrice: string) =>
    `Ciao${cliente ? ` ${cliente}` : ''}! Sono l'assistente di ${operatrice}, cosa vuoi fare?`,
  piedeMenu: (parola: string, operatrice: string) => `Scrivi «${parola}» per parlare con ${operatrice}`,
  pulsantePrenota: 'Prenota',
  pulsanteSposta: 'Sposta',
  pulsanteDisdici: 'Disdici',

  nonLeggo: 'Posso leggere solo i messaggi scritti e i pulsanti.',

  // --- prenotazione
  sceltaServizio: 'Quale servizio vuoi prenotare?',
  pulsanteServizi: 'Scegli il servizio',
  altriServizi: 'Altri servizi ›',
  nessunServizio: (telefono: string | null) =>
    `Al momento non è possibile prenotare da qui.${telefono ? ` Puoi chiamare il salone al ${telefono}.` : ''}`,
  servizioNonDisponibile: 'Quel servizio non è più prenotabile. Scegline un altro:',

  sceltaGiorno: (servizio: string, durata: string) => `${servizio} (${durata}). Scegli il giorno:`,
  pulsanteGiorni: 'Scegli il giorno',
  altriGiorni: 'Altri giorni ›',
  orariLiberi: (n: number) => (n === 1 ? '1 orario libero' : `${n} orari liberi`),
  nessunGiorno: (giorni: number, operatrice: string, parola: string) =>
    `Mi dispiace, nei prossimi ${giorni} giorni non ci sono orari liberi per questo servizio. Scrivi «${parola}» e ti risponde ${operatrice}.`,

  sceltaOra: (giorno: string) => `Orari liberi ${giorno}:`,
  pulsanteOre: "Scegli l'orario",
  altriOrari: 'Altri orari ›',
  cambiaGiorno: '‹ Cambia giorno',
  finoAlle: (ora: string) => `fino alle ${ora}`,
  giornoPieno: 'Quel giorno nel frattempo si è riempito. Scegli un altro giorno:',
  slotPreso: "Mi dispiace, quell'orario è appena stato preso. Scegline un altro:",

  chiediNome: 'Come ti chiami? Scrivi nome e cognome.',
  nomeNonValido: 'Non ho capito il nome. Scrivi solo nome e cognome, per esempio: Maria Rossi.',

  riepilogo: (servizio: string, durata: string, quando: string, nome: string) =>
    `Ecco il riepilogo:\n\nServizio: ${servizio} (${durata})\nQuando: ${quando}\nNome: ${nome}\n\nConfermi?`,
  pulsanteConferma: 'Conferma',
  pulsanteCambiaOrario: 'Cambia orario',
  pulsanteAnnulla: 'Annulla',
  annullata: 'Va bene, non ho prenotato nulla. Se ti serve altro scrivimi pure.',

  richiestaRicevuta: (operatrice: string, servizio: string, quando: string) =>
    `Richiesta ricevuta, ${operatrice} ti confermerà a breve.\n\n${servizio}, ${quando}.`,
  prenotazioneConfermata: (servizio: string, quando: string) =>
    `Prenotazione confermata! Ti aspettiamo ${quando} per ${servizio}.`,

  domandaAnticipo: 'Se si libera un posto prima, vuoi essere avvisata?',
  pulsanteSi: 'Sì',
  pulsanteNo: 'No',
  anticipoSi: 'Perfetto! Se si libera un posto prima ti scrivo io.',
  anticipoNo: 'Va bene! A presto.',

  // --- sposta e disdici
  nessunAppuntamento: 'Non hai appuntamenti in programma.',
  sceltaAppuntamentoSposta: 'Quale appuntamento vuoi spostare?',
  sceltaAppuntamentoDisdici: 'Quale appuntamento vuoi disdire?',
  pulsanteAppuntamenti: "Scegli l'appuntamento",
  inAttesaDiConferma: 'in attesa di conferma',
  appuntamentoNonDisponibile: 'Quell\'appuntamento non è più modificabile.',
  troppoTardi: (ore: number, telefono: string | null, operatrice: string, parola: string) =>
    `Mancano meno di ${ore} ore all'appuntamento: per spostarlo o disdirlo ` +
    (telefono ? `contatta direttamente il salone al ${telefono}.` : `scrivi «${parola}» e ti risponde ${operatrice}.`),
  introSposta: (servizio: string, quando: string) => `Spostiamo ${servizio}, ora fissato ${quando}.`,
  riepilogoSposta: (servizio: string, da: string, a: string) =>
    `Confermi lo spostamento?\n\nServizio: ${servizio}\nDa: ${da}\nA: ${a}`,
  spostato: (servizio: string, quando: string, inAttesa: boolean, operatrice: string) =>
    `Fatto! Il tuo appuntamento per ${servizio} è spostato a ${quando}.` +
    (inAttesa ? `\nLa richiesta resta in attesa della conferma di ${operatrice}.` : ''),
  spostamentoAnnullato: "Va bene, l'appuntamento resta com'era.",
  domandaDisdetta: (servizio: string, quando: string) => `Confermi la disdetta di ${servizio} di ${quando}?`,
  pulsanteSiDisdici: 'Sì, disdici',
  pulsanteNoTieni: 'No, lo tengo',
  disdetto: 'Appuntamento disdetto. Grazie per avermi avvisato! Quando vuoi, scrivimi per prenotarne un altro.',
  disdettaAnnullata: "Va bene, l'appuntamento resta in programma.",

  // --- operatore
  operatoreAvvisata: (operatrice: string) => `Ok, ho avvisato ${operatrice}: ti risponderà lei appena possibile.`,

  // --- risposte di Ilenia dal pannello
  confermataDaIlenia: (operatrice: string, servizio: string, quando: string) =>
    `Buone notizie! ${operatrice} ha confermato il tuo appuntamento: ${servizio}, ${quando}. Ti aspettiamo!`,
  rifiutataDaIlenia: (operatrice: string, servizio: string, quando: string, motivo: string | null) =>
    `Mi dispiace, ${operatrice} non può confermare l'appuntamento per ${servizio} di ${quando}.` +
    `${motivo ? `\n${motivo}` : ''}\n\nVuoi scegliere un altro orario?`,
  pulsanteAltroOrario: 'Scegli altro orario',

  // --- lista d'attesa
  propostaAnticipo: (servizio: string, nuovo: string, attuale: string, minuti: number) =>
    `Si è liberato un posto prima per ${servizio}: ${nuovo} (ora hai ${attuale}).\n\nTi interessa? Hai ${minuti} minuti per rispondere.`,
  propostaManuale: (nome: string, servizio: string, nuovo: string, attuale: string, minuti: number, link: string | null) =>
    `Ciao${nome ? ` ${nome}` : ''}! Si è liberato un posto prima per ${servizio}: ${nuovo} (ora hai ${attuale}).` +
    (link
      ? `\n\nSe ti interessa, entro ${minuti} minuti tocca qui e invia il messaggio: ${link}`
      : `\n\nSe ti interessa, rispondimi entro ${minuti} minuti.`),
  pulsanteAccetto: 'Accetto',
  pulsanteNoGrazie: 'No grazie',
  anticipoAccettato: (servizio: string, quando: string) =>
    `Fatto! Il tuo appuntamento per ${servizio} è anticipato a ${quando}. A presto!`,
  anticipoRifiutato: (quando: string) => `Va bene, resta tutto com'era: ti aspettiamo ${quando}.`,
  anticipoScaduto: "Mi dispiace, il tempo per accettare è scaduto e il posto è stato proposto a un'altra cliente.",
  anticipoPreso: (quando: string) =>
    `Mi dispiace, quel posto è appena stato preso. Il tuo appuntamento resta ${quando}.`,
  anticipoNonTrovato: 'Non trovo questa proposta: forse è già stata gestita.',

  // --- email (solo se i promemoria sono via email)
  chiediEmail: 'Vuoi il promemoria via email il giorno prima? Scrivi il tuo indirizzo email, oppure tocca «Salta».',
  pulsanteSalta: 'Salta',
  emailNonValida: 'Non sembra un indirizzo email valido. Riprova, oppure tocca «Salta».',

  // --- promemoria del giorno prima
  promemoria: (servizio: string, quando: string, telefono: string | null) =>
    `Ciao! Ti ricordo il tuo appuntamento: ${servizio}, ${quando}. Ti aspettiamo!` +
    (telefono ? `\nPer un imprevisto chiama il salone al ${telefono}.` : ''),
  oggettoEmailPromemoria: (quando: string) => `Promemoria appuntamento: ${quando}`,
  emailPromemoria: (nome: string, operatrice: string, servizio: string, quando: string, telefono: string | null) =>
    `Ciao${nome ? ` ${nome}` : ''},\n\nti ricordo il tuo appuntamento da ${operatrice}: ${servizio}, ${quando}.\n` +
    (telefono ? `Per un imprevisto chiama il salone al ${telefono}.\n` : '') +
    `\nA presto!\n${operatrice}`,
} as const

/** Template da far approvare a Meta (vedi guida Fase 6). */
export const TEMPLATE = {
  /** {{1}} nome, {{2}} servizio, {{3}} giorno e ora */
  conferma: 'conferma_appuntamento',
  /** {{1}} nome, {{2}} servizio, {{3}} nuovo giorno e ora, {{4}} appuntamento attuale, {{5}} minuti; pulsanti Accetto / No grazie */
  anticipo: 'proposta_anticipo',
  /** {{1}} nome, {{2}} servizio, {{3}} giorno e ora */
  promemoria: 'promemoria_appuntamento',
  lingua: 'it',
} as const
