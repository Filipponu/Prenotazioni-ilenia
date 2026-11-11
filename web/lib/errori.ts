import { ERRORI_PG } from '@ilenia/shared/tipi-db'

type ErroreLike = { code?: string; message?: string; constraint?: string } | null | undefined

/** Traduce gli errori di Supabase/Postgres in messaggi comprensibili. */
export function messaggioErrore(errore: unknown, contesto?: string): string {
  const e = errore as ErroreLike
  const codice = e?.code
  const testo = e?.message ?? ''

  if (codice === ERRORI_PG.SOVRAPPOSIZIONE) {
    if (testo.includes('orari_no_sovrapposizioni')) {
      return 'Due fasce dello stesso giorno si sovrappongono.'
    }
    return 'Quell\'orario si sovrappone a un altro appuntamento.'
  }
  if (codice === ERRORI_PG.IN_USO) {
    return contesto === 'servizio'
      ? 'Questo servizio è usato in alcuni appuntamenti: puoi disattivarlo invece di eliminarlo.'
      : 'Questo elemento è ancora collegato ad altri dati.'
  }
  if (codice === ERRORI_PG.DUPLICATO) {
    if (testo.includes('telefono')) return 'Esiste già una cliente con questo numero di telefono.'
    return 'Esiste già un elemento uguale.'
  }
  if (codice === ERRORI_PG.CONTROLLO) {
    if (testo.includes('telefono')) return 'Numero di telefono non valido.'
    if (testo.includes('email')) return 'Indirizzo email non valido.'
    if (testo.includes('fine_dopo_inizio')) return 'La fine deve essere dopo l\'inizio.'
    if (testo.includes('servizio non appartiene')) return 'Servizio non valido per questa operatrice.'
    return 'Alcuni valori non sono validi.'
  }
  if (codice === ERRORI_PG.PERMESSO) {
    return 'Operazione non consentita: prova a uscire e rientrare.'
  }
  if (testo.toLowerCase().includes('failed to fetch') || testo.toLowerCase().includes('network')) {
    return 'Connessione assente: controlla internet e riprova.'
  }
  return testo ? `Errore: ${testo}` : 'Si è verificato un errore imprevisto.'
}
