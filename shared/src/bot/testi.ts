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

  // --- in arrivo (Fase 3)
  funzioneInArrivo: (azione: string, operatrice: string, parola: string) =>
    `Per ${azione} un appuntamento, per ora scrivi «${parola}» e ti risponde ${operatrice}.`,

  // --- operatore
  operatoreAvvisata: (operatrice: string) => `Ok, ho avvisato ${operatrice}: ti risponderà lei appena possibile.`,
} as const
