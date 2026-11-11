/**
 * Date e ore nel fuso del salone (Europe/Rome).
 *
 * Regola d'oro: nel database si salvano istanti assoluti (timestamptz, ISO
 * con offset); qui si convertono da/verso l'ora locale italiana, cambio
 * dell'ora legale compreso.
 */
import { DateTime } from 'luxon'

export const FUSO = 'Europe/Rome'
export const LOCALE = 'it-IT'

/** Adesso, in ora italiana. */
export function adesso(): DateTime {
  return DateTime.now().setZone(FUSO).setLocale(LOCALE)
}

/** Da stringa ISO (anche con offset o "Z") a DateTime in ora italiana. */
export function daIso(iso: string): DateTime {
  const dt = DateTime.fromISO(iso, { setZone: true })
  if (!dt.isValid) throw new Error(`Data non valida: ${iso}`)
  return dt.setZone(FUSO).setLocale(LOCALE)
}

/** Da Date JavaScript a DateTime in ora italiana. */
export function daDate(d: Date): DateTime {
  return DateTime.fromJSDate(d).setZone(FUSO).setLocale(LOCALE)
}

/**
 * Data ("2026-11-13") e ora locale ("10:30" o "10:30:00") → istante.
 * Se l'ora non esiste (salto dell'ora legale, notte tra sabato e
 * domenica) Luxon la sposta in avanti: per un salone non succede mai.
 */
export function daDataOra(data: string, ora: string): DateTime {
  const dt = DateTime.fromISO(`${data}T${ora}`, { zone: FUSO }).setLocale(LOCALE)
  if (!dt.isValid) throw new Error(`Data/ora non valida: ${data} ${ora}`)
  return dt
}

/** Istante → stringa ISO con offset, pronta per il database. */
export function versoIso(dt: DateTime): string {
  const iso = dt.toISO({ suppressMilliseconds: true })
  if (!iso) throw new Error('Data non valida')
  return iso
}

/** "2026-11-13" della data italiana. */
export function dataIso(dt: DateTime): string {
  return dt.setZone(FUSO).toISODate() ?? ''
}

/** "10:30" (HH:mm) dell'ora italiana. */
export function oraBreve(dt: DateTime): string {
  return dt.setZone(FUSO).toFormat('HH:mm')
}

/** "giovedì 13 novembre" */
export function dataLunga(dt: DateTime): string {
  return dt.setZone(FUSO).setLocale(LOCALE).toFormat('cccc d LLLL')
}

/** "gio 13/11" */
export function dataBreve(dt: DateTime): string {
  return dt.setZone(FUSO).setLocale(LOCALE).toFormat('ccc d/LL')
}

/** "giovedì 13 novembre alle 10:30" */
export function dataOraLunga(dt: DateTime): string {
  return `${dataLunga(dt)} alle ${oraBreve(dt)}`
}

/** Giorno della settimana ISO: 1 = lunedì … 7 = domenica (come nel database). */
export function giornoSettimana(dt: DateTime): number {
  return dt.setZone(FUSO).weekday
}

export const NOMI_GIORNI = [
  'lunedì',
  'martedì',
  'mercoledì',
  'giovedì',
  'venerdì',
  'sabato',
  'domenica',
] as const

/** Nome del giorno dato il numero ISO (1 = lunedì). */
export function nomeGiorno(giorno: number): string {
  return NOMI_GIORNI[giorno - 1] ?? '?'
}

/** "09:30:00" o "09:30" → minuti dalla mezzanotte (570). */
export function minutiDaOra(ora: string): number {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(ora.trim())
  if (!m) throw new Error(`Ora non valida: ${ora}`)
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 24 || min > 59 || (h === 24 && min > 0)) throw new Error(`Ora non valida: ${ora}`)
  return h * 60 + min
}

/** 570 → "09:30" */
export function oraDaMinuti(minuti: number): string {
  const h = Math.floor(minuti / 60)
  const m = minuti % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Durata leggibile: 45 → "45 min", 90 → "1 h 30 min", 120 → "2 h". */
export function durataLeggibile(minuti: number): string {
  if (minuti < 60) return `${minuti} min`
  const h = Math.floor(minuti / 60)
  const m = minuti % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Prezzo in euro: 25 → "25 €", 22.5 → "22,50 €". */
export function prezzoLeggibile(prezzo: number): string {
  const intero = Number.isInteger(prezzo)
  return `${prezzo.toLocaleString(LOCALE, {
    minimumFractionDigits: intero ? 0 : 2,
    maximumFractionDigits: 2,
  })} €`
}
