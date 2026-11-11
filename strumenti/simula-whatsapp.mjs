/**
 * Manda al Worker un messaggio WhatsApp finto, firmato come farebbe Meta.
 * Serve per provare il bot senza un numero WhatsApp.
 *
 *   node strumenti/simula-whatsapp.mjs --url http://localhost:8787 --segreto <WHATSAPP_APP_SECRET> \
 *        --da 393331234567 "ciao"
 *   node strumenti/simula-whatsapp.mjs ... --scelta menu:prenota
 *
 * Le risposte del bot si leggono nei log del Worker (modalità simulata)
 * o nella tabella log_messaggi.
 */
import { createHmac, randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: 'string', default: 'http://localhost:8787' },
    segreto: { type: 'string', default: process.env.WHATSAPP_APP_SECRET ?? '' },
    da: { type: 'string', default: '393331234567' },
    nome: { type: 'string', default: 'Cliente di prova' },
    scelta: { type: 'string' },
  },
})
if (!values.segreto) {
  console.error('Serve --segreto (lo stesso WHATSAPP_APP_SECRET del Worker)')
  process.exit(1)
}

const messaggio = values.scelta
  ? {
      type: 'interactive',
      interactive: { type: 'list_reply', list_reply: { id: values.scelta, title: values.scelta } },
    }
  : { type: 'text', text: { body: positionals.join(' ') || 'ciao' } }

const corpo = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'SIMULAZIONE',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '000', phone_number_id: 'SIMULAZIONE' },
            contacts: [{ wa_id: values.da, profile: { name: values.nome } }],
            messages: [
              { from: values.da, id: `wamid.sim.${randomUUID()}`, timestamp: String(Math.floor(Date.now() / 1000)), ...messaggio },
            ],
          },
        },
      ],
    },
  ],
})
const firma = `sha256=${createHmac('sha256', values.segreto).update(corpo).digest('hex')}`
const r = await fetch(`${values.url.replace(/\/$/, '')}/api/whatsapp/webhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-hub-signature-256': firma },
  body: corpo,
})
console.log(`${r.status} ${await r.text()}`)
