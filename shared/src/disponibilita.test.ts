import { describe, expect, it } from 'vitest'
import { giorniLiberi, slotDelGiorno, slotLibero, type ParametriDisponibilita } from './disponibilita'
import type { Fascia } from './orari'
import { daDataOra, oraBreve } from './tempo'

const orari: Fascia[] = [
  { giorno: 2, ora_inizio: '09:00:00', ora_fine: '13:00:00' }, // martedì
  { giorno: 2, ora_inizio: '14:30:00', ora_fine: '19:00:00' },
  { giorno: 4, ora_inizio: '09:00:00', ora_fine: '12:00:00' }, // giovedì
]

// lunedì 16 novembre 2026, ore 8:00
const base: ParametriDisponibilita = {
  ora: daDataOra('2026-11-16', '08:00'),
  durataMinuti: 45,
  passoMinuti: 30,
  preavvisoMinimoMinuti: 120,
  giorniPrenotabili: 30,
  orari,
  occupati: [],
}

const ore = (p: ParametriDisponibilita, data: string) => slotDelGiorno(daDataOra(data, '00:00'), p).map(oraBreve)
const ms = (data: string, ora: string) => daDataOra(data, ora).toMillis()

describe('slotDelGiorno', () => {
  it('martedì: tutte le partenze che finiscono dentro la fascia', () => {
    expect(ore(base, '2026-11-17')).toEqual([
      '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00',
      '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00',
    ])
  })

  it('lunedì chiuso: nessun orario', () => {
    expect(ore(base, '2026-11-16')).toEqual([])
  })

  it('un appuntamento toglie gli orari che si sovrappongono', () => {
    const p = { ...base, occupati: [{ inizio: ms('2026-11-17', '10:00'), fine: ms('2026-11-17', '10:45') }] }
    expect(ore(p, '2026-11-17').slice(0, 4)).toEqual(['09:00', '11:00', '11:30', '12:00'])
  })

  it('servizio lungo: deve stare tutto nella fascia', () => {
    expect(ore({ ...base, durataMinuti: 150 }, '2026-11-19')).toEqual(['09:00', '09:30'])
  })

  it('preavviso minimo: martedì alle 10:10 il primo orario è dopo le 12:10', () => {
    const p = { ...base, ora: daDataOra('2026-11-17', '10:10') }
    expect(ore(p, '2026-11-17')).toEqual(['14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00'])
  })

  it('una chiusura blocca il pomeriggio', () => {
    const p = { ...base, occupati: [{ inizio: ms('2026-11-17', '14:00'), fine: ms('2026-11-17', '20:00') }] }
    expect(ore(p, '2026-11-17').at(-1)).toBe('12:00')
  })

  it('oltre i giorni prenotabili: niente', () => {
    expect(ore({ ...base, giorniPrenotabili: 2 }, '2026-11-19')).toEqual([])
  })

  it('passo di 15 minuti', () => {
    expect(ore({ ...base, passoMinuti: 15 }, '2026-11-19').slice(0, 3)).toEqual(['09:00', '09:15', '09:30'])
  })
})

describe('giorniLiberi', () => {
  it('salta i giorni chiusi e conta gli orari', () => {
    const { giorni, altri } = giorniLiberi(base, 3)
    expect(giorni.map((g) => [g.giorno.toISODate(), g.slot])).toEqual([
      ['2026-11-17', 15],
      ['2026-11-19', 5],
      ['2026-11-24', 15],
    ])
    expect(altri).toBe(true)
  })

  it('pagina successiva a partire da un giorno', () => {
    const { giorni } = giorniLiberi(base, 2, daDataOra('2026-11-20', '00:00'))
    expect(giorni.map((g) => g.giorno.toISODate())).toEqual(['2026-11-24', '2026-11-26'])
  })

  it('fine della finestra prenotabile: niente "altri"', () => {
    const { giorni, altri } = giorniLiberi({ ...base, giorniPrenotabili: 5 }, 9)
    expect(giorni).toHaveLength(2)
    expect(altri).toBe(false)
  })
})

describe('slotLibero', () => {
  it('riconosce un orario valido e uno disallineato', () => {
    expect(slotLibero(daDataOra('2026-11-17', '10:30'), base)).toBe(true)
    expect(slotLibero(daDataOra('2026-11-17', '10:40'), base)).toBe(false)
    expect(slotLibero(daDataOra('2026-11-17', '13:00'), base)).toBe(false)
  })
})
