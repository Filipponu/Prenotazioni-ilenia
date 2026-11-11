import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { firmaValida } from './firma'
import { tronca, versoMeta } from './messaggi'
import { leggiWebhook } from './webhook'

describe('versoMeta', () => {
  it('pulsanti: massimo 3, titoli di 20 caratteri', () => {
    const corpo = versoMeta('393331234567', {
      tipo: 'pulsanti',
      testo: 'Cosa vuoi fare?',
      pulsanti: [
        { id: 'a', titolo: 'Prenota' },
        { id: 'b', titolo: 'Un titolo decisamente troppo lungo' },
        { id: 'c', titolo: 'Disdici' },
        { id: 'd', titolo: 'Quarto' },
      ],
    }) as { interactive: { action: { buttons: Array<{ reply: { title: string } }> } } }
    const titoli = corpo.interactive.action.buttons.map((b) => b.reply.title)
    expect(titoli).toHaveLength(3)
    expect(titoli[1]).toBe('Un titolo decisamen…')
    expect(Array.from(titoli[1]!)).toHaveLength(20)
  })

  it('lista: righe e descrizioni nei limiti', () => {
    const righe = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, titolo: `Riga ${i}`, descrizione: 'x'.repeat(100) }))
    const corpo = versoMeta('39', { tipo: 'lista', testo: 'Scegli', pulsante: 'Scegli il servizio', righe }) as {
      interactive: { action: { button: string; sections: Array<{ rows: Array<{ description: string }> }> } }
    }
    expect(corpo.interactive.action.sections[0]!.rows).toHaveLength(10)
    expect(corpo.interactive.action.sections[0]!.rows[0]!.description).toHaveLength(72)
    expect(corpo.interactive.action.button.length).toBeLessThanOrEqual(20)
  })

  it('template con parametri e risposte rapide', () => {
    const corpo = versoMeta('39', {
      tipo: 'template',
      nome: 'conferma_appuntamento',
      lingua: 'it',
      parametri: ['Maria', 'giovedì 13 novembre alle 10:30'],
      risposte: ['ok'],
      anteprima: '…',
    }) as { template: { language: { code: string }; components: unknown[] } }
    expect(corpo.template.language.code).toBe('it')
    expect(corpo.template.components).toHaveLength(2)
  })

  it('tronca conta le emoji come un carattere', () => {
    expect(tronca('💇💇💇', 3)).toBe('💇💇💇')
    expect(tronca('abcdef', 4)).toBe('abc…')
  })
})

describe('leggiWebhook', () => {
  const corpo = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: '123' },
              contacts: [{ wa_id: '393331234567', profile: { name: 'Maria' } }],
              messages: [
                { from: '393331234567', id: 'wamid.1', timestamp: '1763200000', type: 'text', text: { body: 'ciao Ilenia' } },
                {
                  from: '393331234567',
                  id: 'wamid.2',
                  timestamp: '1763200010',
                  type: 'interactive',
                  interactive: { type: 'button_reply', button_reply: { id: 'menu:prenota', title: 'Prenota' } },
                },
                {
                  from: '393331234567',
                  id: 'wamid.3',
                  timestamp: '1763200020',
                  type: 'interactive',
                  interactive: { type: 'list_reply', list_reply: { id: 'srv:1', title: 'Piega', description: '45 min' } },
                },
                { from: '393331234567', id: 'wamid.4', timestamp: '1763200030', type: 'button', button: { payload: 'anticipo:si', text: 'Accetto' } },
                { from: '393331234567', id: 'wamid.5', timestamp: '1763200040', type: 'audio', audio: { id: 'x' } },
              ],
              statuses: [
                {
                  id: 'wamid.out',
                  status: 'delivered',
                  timestamp: '1763200050',
                  recipient_id: '393331234567',
                  pricing: { billable: false, category: 'service', type: 'free_customer_service' },
                },
              ],
            },
          },
        ],
      },
    ],
  }

  it('messaggi di testo, pulsanti, liste, risposte a template e altro', () => {
    const eventi = leggiWebhook(corpo)
    expect(eventi).toHaveLength(6)
    expect(eventi[0]).toMatchObject({ tipo: 'messaggio', da: '393331234567', nomeProfilo: 'Maria', contenuto: { tipo: 'testo', testo: 'ciao Ilenia' } })
    expect(eventi[1]).toMatchObject({ contenuto: { tipo: 'scelta', id: 'menu:prenota', titolo: 'Prenota' } })
    expect(eventi[2]).toMatchObject({ contenuto: { tipo: 'scelta', id: 'srv:1' } })
    expect(eventi[3]).toMatchObject({ contenuto: { tipo: 'scelta', id: 'anticipo:si', titolo: 'Accetto' } })
    expect(eventi[4]).toMatchObject({ contenuto: { tipo: 'altro', descrizione: 'audio' } })
    expect(eventi[5]).toMatchObject({
      tipo: 'stato',
      stato: 'delivered',
      fatturazione: { fatturabile: false, categoria: 'service', tipo: 'free_customer_service' },
    })
  })

  it('corpo vuoto o malformato: nessun evento, nessun errore', () => {
    expect(leggiWebhook(null)).toEqual([])
    expect(leggiWebhook({ entry: 'x' })).toEqual([])
  })
})

describe('firmaValida', () => {
  const segreto = 'app-secret-di-prova'
  const grezzo = '{"object":"whatsapp_business_account","entry":[]}'
  const giusta = `sha256=${createHmac('sha256', segreto).update(grezzo).digest('hex')}`

  it('accetta la firma corretta', async () => {
    expect(await firmaValida(grezzo, giusta, segreto)).toBe(true)
  })
  it('rifiuta firma sbagliata, mancante o corpo modificato', async () => {
    expect(await firmaValida(grezzo, giusta.replace(/.$/, '0'), segreto)).toBe(false)
    expect(await firmaValida(grezzo, null, segreto)).toBe(false)
    expect(await firmaValida(grezzo + ' ', giusta, segreto)).toBe(false)
    expect(await firmaValida(grezzo, giusta, '')).toBe(false)
  })
})
