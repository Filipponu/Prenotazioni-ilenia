/**
 * Calcolo degli orari liberi per un servizio di una certa durata.
 *
 * Un orario d'inizio è libero se:
 * - cade dentro una fascia di apertura e il servizio finisce entro la fascia;
 * - è allineato al passo (es. ogni 30 minuti dall'inizio della fascia);
 * - rispetta il preavviso minimo (es. non prima di 2 ore da adesso);
 * - è entro i giorni prenotabili;
 * - non si sovrappone a nulla di occupato (appuntamenti attivi, chiusure,
 *   posti già proposti alla lista d'attesa).
 *
 * I confronti si fanno in millisecondi (veloce: il Worker ha 10 ms di CPU).
 */
import { DateTime } from 'luxon'
import { fasceDelGiorno, type Fascia } from './orari'
import { FUSO, LOCALE } from './tempo'

export interface Occupato {
  inizio: number // epoch ms
  fine: number
}

export interface ParametriDisponibilita {
  ora: DateTime
  durataMinuti: number
  passoMinuti: number
  preavvisoMinimoMinuti: number
  giorniPrenotabili: number
  orari: readonly Fascia[]
  occupati: readonly Occupato[]
}

const MINUTO = 60_000

/** Da righe con inizio/fine ISO a intervalli in millisecondi. */
export function inOccupati(righe: ReadonlyArray<{ inizio: string; fine: string }>): Occupato[] {
  return righe.map((r) => ({ inizio: Date.parse(r.inizio), fine: Date.parse(r.fine) }))
}

/** Primo e ultimo giorno prenotabili (inizio giornata, ora italiana). */
export function finestraPrenotabile(p: ParametriDisponibilita): { primo: DateTime; ultimo: DateTime } {
  const primo = p.ora.setZone(FUSO).startOf('day')
  return { primo, ultimo: primo.plus({ days: Math.max(1, p.giorniPrenotabili) - 1 }) }
}

/** Orari d'inizio liberi in un giorno, in ordine. */
export function slotDelGiorno(giorno: DateTime, p: ParametriDisponibilita): DateTime[] {
  const { primo, ultimo } = finestraPrenotabile(p)
  const g = giorno.setZone(FUSO).startOf('day')
  if (g < primo || g > ultimo) return []

  const minimo = p.ora.toMillis() + p.preavvisoMinimoMinuti * MINUTO
  const durata = p.durataMinuti * MINUTO
  const passo = Math.max(5, p.passoMinuti) * MINUTO
  const inizioGiorno = g.toMillis()
  const fineGiorno = g.plus({ days: 1 }).toMillis()
  const occupatiDelGiorno = p.occupati.filter((o) => o.inizio < fineGiorno && o.fine > inizioGiorno)

  const risultato: DateTime[] = []
  for (const fascia of fasceDelGiorno(g, p.orari)) {
    const fineFascia = fascia.fine.toMillis()
    for (let t = fascia.inizio.toMillis(); t + durata <= fineFascia; t += passo) {
      if (t < minimo) continue
      const fine = t + durata
      if (occupatiDelGiorno.some((o) => o.inizio < fine && t < o.fine)) continue
      risultato.push(DateTime.fromMillis(t, { zone: FUSO }).setLocale(LOCALE))
    }
  }
  return risultato
}

export interface GiornoLibero {
  giorno: DateTime
  slot: number
}

/**
 * Giorni con almeno un orario libero, a partire da `dal` (incluso).
 * Restituisce al massimo `quanti` giorni e se ce ne sono altri dopo.
 */
export function giorniLiberi(
  p: ParametriDisponibilita,
  quanti: number,
  dal?: DateTime,
): { giorni: GiornoLibero[]; altri: boolean } {
  const { primo, ultimo } = finestraPrenotabile(p)
  let g = dal ? DateTime.max(dal.setZone(FUSO).startOf('day'), primo) : primo
  const giorni: GiornoLibero[] = []
  while (g <= ultimo) {
    const n = slotDelGiorno(g, p).length
    if (n > 0) {
      if (giorni.length === quanti) return { giorni, altri: true }
      giorni.push({ giorno: g, slot: n })
    }
    g = g.plus({ days: 1 })
  }
  return { giorni, altri: false }
}

/** L'orario è (ancora) libero e prenotabile? */
export function slotLibero(inizio: DateTime, p: ParametriDisponibilita): boolean {
  const t = inizio.toMillis()
  return slotDelGiorno(inizio, p).some((s) => s.toMillis() === t)
}
