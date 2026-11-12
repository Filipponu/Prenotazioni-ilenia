/**
 * Finestra di servizio di 24 ore: dopo l'ultimo messaggio della cliente
 * si possono inviare messaggi liberi (gratuiti fino a 1.000 al mese).
 * Fuori dalla finestra si può scrivere solo con un template a pagamento.
 */
import type { DateTime } from 'luxon'
import { daIso } from '../tempo'

export const ORE_FINESTRA = 24

export interface StatoFinestra {
  aperta: boolean
  /** quando si chiude (null se la cliente non ha mai scritto) */
  chiude: DateTime | null
  /** minuti che restano (0 se chiusa) */
  minutiRestanti: number
}

export function statoFinestra(ultimoMessaggioCliente: string | null | undefined, ora: DateTime): StatoFinestra {
  if (!ultimoMessaggioCliente) return { aperta: false, chiude: null, minutiRestanti: 0 }
  const chiude = daIso(ultimoMessaggioCliente).plus({ hours: ORE_FINESTRA })
  const minuti = Math.floor(chiude.diff(ora, 'minutes').minutes)
  return { aperta: minuti > 0, chiude, minutiRestanti: Math.max(0, minuti) }
}

/** "ancora 5 h 20 min" / "ancora 40 min" */
export function tempoRestante(minuti: number): string {
  const h = Math.floor(minuti / 60)
  const m = minuti % 60
  if (h === 0) return `ancora ${m} min`
  return m === 0 ? `ancora ${h} h` : `ancora ${h} h ${m} min`
}
