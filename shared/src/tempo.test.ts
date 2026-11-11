import { describe, expect, it } from 'vitest'
import {
  dataBreve,
  dataIso,
  dataLunga,
  dataOraLunga,
  daDataOra,
  daIso,
  durataLeggibile,
  giornoSettimana,
  minutiDaOra,
  oraBreve,
  oraDaMinuti,
  prezzoLeggibile,
  versoIso,
} from './tempo'

describe('tempo (Europe/Rome)', () => {
  it('ora locale → istante con offset corretto, ora solare e legale', () => {
    expect(versoIso(daDataOra('2026-11-13', '10:30'))).toBe('2026-11-13T10:30:00+01:00')
    expect(versoIso(daDataOra('2026-07-13', '10:30'))).toBe('2026-07-13T10:30:00+02:00')
  })

  it('gestisce il giorno del cambio d\'ora (29 marzo 2026)', () => {
    expect(versoIso(daDataOra('2026-03-28', '09:00'))).toBe('2026-03-28T09:00:00+01:00')
    expect(versoIso(daDataOra('2026-03-29', '09:00'))).toBe('2026-03-29T09:00:00+02:00')
  })

  it('istante UTC dal database → ora italiana', () => {
    const dt = daIso('2026-11-13T09:30:00Z')
    expect(oraBreve(dt)).toBe('10:30')
    expect(dataIso(dt)).toBe('2026-11-13')
  })

  it('a mezzanotte UTC la data italiana è già quella dopo', () => {
    expect(dataIso(daIso('2026-11-13T23:30:00Z'))).toBe('2026-11-14')
  })

  it('formatta in italiano', () => {
    const dt = daDataOra('2026-11-12', '10:30')
    expect(dataLunga(dt)).toBe('giovedì 12 novembre')
    expect(dataBreve(dt)).toBe('gio 12/11')
    expect(dataOraLunga(dt)).toBe('giovedì 12 novembre alle 10:30')
  })

  it('giorno della settimana ISO', () => {
    expect(giornoSettimana(daDataOra('2026-11-16', '10:00'))).toBe(1) // lunedì
    expect(giornoSettimana(daDataOra('2026-11-15', '10:00'))).toBe(7) // domenica
  })

  it('minuti ↔ ora', () => {
    expect(minutiDaOra('09:30:00')).toBe(570)
    expect(minutiDaOra('9:30')).toBe(570)
    expect(minutiDaOra('24:00')).toBe(1440)
    expect(() => minutiDaOra('25:00')).toThrow()
    expect(oraDaMinuti(570)).toBe('09:30')
  })

  it('durate e prezzi leggibili', () => {
    expect(durataLeggibile(45)).toBe('45 min')
    expect(durataLeggibile(90)).toBe('1 h 30 min')
    expect(durataLeggibile(120)).toBe('2 h')
    expect(prezzoLeggibile(25)).toBe('25 €')
    expect(prezzoLeggibile(22.5)).toBe('22,50 €')
  })
})
