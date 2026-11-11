import { describe, expect, it } from 'vitest'
import { formattaTelefono, linkWhatsApp, normalizzaTelefono } from './telefono'

describe('normalizzaTelefono', () => {
  it.each([
    ['333 123 4567', '393331234567'],
    ['3331234567', '393331234567'],
    ['+39 333-123.4567', '393331234567'],
    ['0039 333 1234567', '393331234567'],
    ['393331234567', '393331234567'],
    ['(06) 1234567', '39061234567'],
    ['+41 79 123 45 67', '41791234567'],
  ])('%s → %s', (input, atteso) => {
    expect(normalizzaTelefono(input)).toBe(atteso)
  })

  it.each(['', 'ciao', '123', '+39 abc', '0'])('rifiuta %j', (input) => {
    expect(normalizzaTelefono(input)).toBeNull()
  })
})

describe('formattaTelefono', () => {
  it('cellulare italiano leggibile', () => {
    expect(formattaTelefono('393331234567')).toBe('+39 333 123 4567')
  })
  it('estero con +', () => {
    expect(formattaTelefono('41791234567')).toBe('+41791234567')
  })
  it('vuoto', () => {
    expect(formattaTelefono(null)).toBe('')
  })
})

describe('linkWhatsApp', () => {
  it('con testo già scritto', () => {
    expect(linkWhatsApp('393331234567', 'Ciao Maria!')).toBe('https://wa.me/393331234567?text=Ciao%20Maria!')
  })
})
