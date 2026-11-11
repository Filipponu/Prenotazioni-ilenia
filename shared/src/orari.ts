/**
 * Orari di apertura e chiusure: conversione delle fasce settimanali in
 * istanti reali e verifica che un appuntamento cada dentro l'orario.
 */
import type { DateTime } from 'luxon'
import { FUSO, daIso, minutiDaOra } from './tempo'

export interface Fascia {
  giorno: number // 1 = lunedì … 7 = domenica
  ora_inizio: string // "09:00:00"
  ora_fine: string
}

export interface Chiusura {
  inizio: string // ISO
  fine: string
  motivo?: string | null
}

export interface Intervallo {
  inizio: DateTime
  fine: DateTime
}

/** Imposta l'ora locale (minuti dalla mezzanotte) su un giorno, rispettando l'ora legale. */
export function alleOre(giorno: DateTime, minuti: number): DateTime {
  const d = giorno.setZone(FUSO).startOf('day')
  if (minuti >= 24 * 60) return d.plus({ days: 1 })
  return d.set({ hour: Math.floor(minuti / 60), minute: minuti % 60 })
}

/** Le fasce di apertura di una data, come istanti assoluti, in ordine di inizio. */
export function fasceDelGiorno(giorno: DateTime, orari: readonly Fascia[]): Intervallo[] {
  const n = giorno.setZone(FUSO).weekday
  return orari
    .filter((f) => f.giorno === n)
    .map((f) => ({
      inizio: alleOre(giorno, minutiDaOra(f.ora_inizio)),
      fine: alleOre(giorno, minutiDaOra(f.ora_fine)),
    }))
    .sort((a, b) => a.inizio.toMillis() - b.inizio.toMillis())
}

/** Due intervalli semiaperti [inizio, fine) si sovrappongono? */
export function siSovrappongono(
  a: { inizio: DateTime; fine: DateTime },
  b: { inizio: DateTime; fine: DateTime },
): boolean {
  return a.inizio < b.fine && b.inizio < a.fine
}

export interface EsitoVerificaOrario {
  /** true se l'appuntamento non sta interamente dentro una fascia di apertura */
  fuoriOrario: boolean
  /** la chiusura (ferie, festività…) che si sovrappone, se c'è */
  chiusura: Chiusura | null
}

/**
 * Controlla un appuntamento rispetto a orario settimanale e chiusure.
 * Nel pannello serve per avvisare Ilenia (che può comunque forzare);
 * il bot non proporrà mai slot fuori orario.
 */
export function verificaOrario(
  inizio: DateTime,
  fine: DateTime,
  orari: readonly Fascia[],
  chiusure: readonly Chiusura[],
): EsitoVerificaOrario {
  const dentro = fasceDelGiorno(inizio, orari).some((f) => inizio >= f.inizio && fine <= f.fine)
  const chiusura =
    chiusure.find((c) => siSovrappongono({ inizio, fine }, { inizio: daIso(c.inizio), fine: daIso(c.fine) })) ??
    null
  return { fuoriOrario: !dentro, chiusura }
}

/**
 * Orario minimo e massimo su tutta la settimana, per dimensionare
 * l'agenda (es. { min: "08:30", max: "19:30" }). Senza orari: 08:00–20:00.
 */
export function limitiSettimana(orari: readonly Fascia[]): { min: string; max: string } {
  if (orari.length === 0) return { min: '08:00', max: '20:00' }
  const min = Math.min(...orari.map((f) => minutiDaOra(f.ora_inizio)))
  const max = Math.max(...orari.map((f) => minutiDaOra(f.ora_fine)))
  const pad = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return { min: pad(min), max: pad(max) }
}
