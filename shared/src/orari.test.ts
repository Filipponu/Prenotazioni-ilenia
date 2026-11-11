import { describe, expect, it } from 'vitest'
import { fasceDelGiorno, limitiSettimana, verificaOrario, type Fascia } from './orari'
import { daDataOra, versoIso } from './tempo'

const orari: Fascia[] = [
  { giorno: 1, ora_inizio: '14:30:00', ora_fine: '19:00:00' },
  { giorno: 1, ora_inizio: '09:00:00', ora_fine: '13:00:00' },
  { giorno: 7, ora_inizio: '09:00:00', ora_fine: '12:00:00' },
]

describe('fasceDelGiorno', () => {
  it('lunedì: due fasce in ordine', () => {
    const fasce = fasceDelGiorno(daDataOra('2026-11-16', '00:00'), orari)
    expect(fasce.map((f) => [versoIso(f.inizio), versoIso(f.fine)])).toEqual([
      ['2026-11-16T09:00:00+01:00', '2026-11-16T13:00:00+01:00'],
      ['2026-11-16T14:30:00+01:00', '2026-11-16T19:00:00+01:00'],
    ])
  })

  it('martedì: chiuso', () => {
    expect(fasceDelGiorno(daDataOra('2026-11-17', '00:00'), orari)).toEqual([])
  })

  it('domenica del cambio d\'ora: le 9:00 restano le 9:00 locali', () => {
    const [f] = fasceDelGiorno(daDataOra('2026-03-29', '00:00'), orari)
    expect(versoIso(f!.inizio)).toBe('2026-03-29T09:00:00+02:00')
  })
})

describe('verificaOrario', () => {
  const chiusure = [{ inizio: '2026-12-24T00:00:00+01:00', fine: '2026-12-27T00:00:00+01:00', motivo: 'Natale' }]

  it('dentro una fascia', () => {
    const r = verificaOrario(daDataOra('2026-11-16', '10:00'), daDataOra('2026-11-16', '10:45'), orari, chiusure)
    expect(r).toEqual({ fuoriOrario: false, chiusura: null })
  })

  it('a cavallo della pausa pranzo → fuori orario', () => {
    const r = verificaOrario(daDataOra('2026-11-16', '12:30'), daDataOra('2026-11-16', '13:30'), orari, chiusure)
    expect(r.fuoriOrario).toBe(true)
  })

  it('finisce esattamente a fine fascia → ok', () => {
    const r = verificaOrario(daDataOra('2026-11-16', '18:00'), daDataOra('2026-11-16', '19:00'), orari, chiusure)
    expect(r.fuoriOrario).toBe(false)
  })

  it('giorno di chiusura straordinaria', () => {
    const r = verificaOrario(daDataOra('2026-12-24', '10:00'), daDataOra('2026-12-24', '11:00'), orari, chiusure)
    expect(r.chiusura?.motivo).toBe('Natale')
  })
})

describe('limitiSettimana', () => {
  it('min e max su tutta la settimana', () => {
    expect(limitiSettimana(orari)).toEqual({ min: '09:00', max: '19:00' })
  })
  it('senza orari: 8–20', () => {
    expect(limitiSettimana([])).toEqual({ min: '08:00', max: '20:00' })
  })
})
