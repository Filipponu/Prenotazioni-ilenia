import type { StatoAppuntamento } from '@ilenia/shared/tipi-db'

export const STATI: Record<
  StatoAppuntamento,
  { testo: string; colore: 'neutro' | 'brand' | 'ambra' | 'verde' | 'rosso'; calendario: string }
> = {
  in_attesa: { testo: 'In attesa', colore: 'ambra', calendario: '#d97706' },
  confermato: { testo: 'Confermato', colore: 'brand', calendario: '#b3305e' },
  completato: { testo: 'Completato', colore: 'verde', calendario: '#78716c' },
  rifiutato: { testo: 'Rifiutato', colore: 'rosso', calendario: '#a8a29e' },
  disdetto: { testo: 'Disdetto', colore: 'neutro', calendario: '#a8a29e' },
}

/** Stati che occupano l'agenda (gli altri sono solo storico). */
export const STATI_ATTIVI: StatoAppuntamento[] = ['in_attesa', 'confermato']

/** Toglie i caratteri che romperebbero i filtri .or() di PostgREST. */
export function pulisciRicerca(testo: string): string {
  return testo.replace(/[,()%*\\]/g, ' ').trim()
}
