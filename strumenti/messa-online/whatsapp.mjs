#!/usr/bin/env node
/**
 * Operazioni una tantum sul numero WhatsApp, con l'API ufficiale di Meta
 * (Graph API). Servono il token permanente (utente di sistema) e gli ID che
 * si leggono in App Dashboard → WhatsApp → API Setup.
 *
 *   export WHATSAPP_TOKEN=…        # token dell'utente di sistema
 *   node strumenti/messa-online/whatsapp.mjs numeri    --account <ID account WhatsApp>
 *   node strumenti/messa-online/whatsapp.mjs registra  --numero <ID numero> --pin <6 cifre>
 *   node strumenti/messa-online/whatsapp.mjs iscrivi   --account <ID account WhatsApp>
 *   node strumenti/messa-online/whatsapp.mjs template  --account <ID account WhatsApp>
 *   node strumenti/messa-online/whatsapp.mjs stato     --numero <ID numero> [--account <ID>]
 *
 * - numeri:   elenco dei numeri dell'account con il loro ID e lo stato;
 * - registra: attiva il numero sull'API Cloud (obbligatorio, si fa solo via API);
 *             il PIN di 6 cifre diventa la verifica in due passaggi del numero: conservalo;
 * - iscrivi:  collega l'app all'account WhatsApp, così i messaggi arrivano al webhook;
 * - template: crea i tre modelli di messaggio usati dal bot (se mancano) e ne mostra lo stato;
 * - stato:    riepilogo per capire se è tutto pronto.
 */
import { argomenti, chiama, Errore, info, ok, principale, richiesto, titolo } from './comune.mjs'

const GRAPH = `${process.env.GRAPH_URL ?? 'https://graph.facebook.com'}/${process.env.WHATSAPP_GRAPH_VERSION ?? 'v24.0'}`

/** I modelli che il bot usa fuori dalle 24 ore (stessi nomi di shared/src/bot/testi.ts). */
export const TEMPLATE = [
  {
    name: 'conferma_appuntamento',
    language: 'it',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: 'Ciao {{1}}, il tuo appuntamento per {{2}} è confermato per {{3}}. Ti aspettiamo!',
        example: { body_text: [['Maria', 'Piega', 'giovedì 13 novembre alle 10:30']] },
      },
    ],
  },
  {
    name: 'promemoria_appuntamento',
    language: 'it',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: "Ciao {{1}}, ti ricordo l'appuntamento per {{2}}: {{3}}. Ti aspettiamo!",
        example: { body_text: [['Maria', 'Piega', 'martedì 17 novembre alle 10:00']] },
      },
    ],
  },
  {
    name: 'proposta_anticipo',
    language: 'it',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: 'Ciao {{1}}, si è liberato un posto prima per {{2}}: {{3}} (ora hai {{4}}). Ti interessa? Hai {{5}} minuti per rispondere.',
        example: { body_text: [['Maria', 'Piega', 'domani alle 15:00', 'venerdì 21 novembre alle 11:00', '15']] },
      },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Accetto' }, { type: 'QUICK_REPLY', text: 'No grazie' }] },
    ],
  },
]

const STATI_TEMPLATE = { APPROVED: 'approvato', PENDING: 'in revisione', REJECTED: 'rifiutato', PAUSED: 'in pausa', DISABLED: 'disattivato' }

export function graph(token = process.env.WHATSAPP_TOKEN) {
  richiesto(token, 'Manca WHATSAPP_TOKEN (token permanente dell\'utente di sistema, vedi docs/guida-whatsapp.md)')
  return {
    leggi: (percorso, parametri = {}) => chiama(`${GRAPH}/${percorso}?${new URLSearchParams(parametri)}`, { token }),
    scrivi: (percorso, corpo) => chiama(`${GRAPH}/${percorso}`, { metodo: 'POST', token, corpo }),
  }
}

const id = (v, cosa) => {
  richiesto(v, `Manca --${cosa}`)
  if (!/^\d{5,25}$/.test(String(v))) throw new Errore(`--${cosa} deve essere un numero (lo trovi in API Setup)`)
  return String(v)
}

export async function numeri(g, account) {
  const r = await g.leggi(`${account}/phone_numbers`, {
    fields: 'id,display_phone_number,verified_name,name_status,code_verification_status,platform_type,status,quality_rating',
  })
  return r.data ?? []
}

export async function creaTemplate(g, account) {
  const esistenti = (await g.leggi(`${account}/message_templates`, { fields: 'name,language,status,rejected_reason', limit: '200' })).data ?? []
  const esiti = []
  for (const t of TEMPLATE) {
    const c = esistenti.find((e) => e.name === t.name && e.language === t.language)
    if (c) {
      esiti.push({ nome: t.name, stato: c.status, motivo: c.rejected_reason, creato: false })
      continue
    }
    const r = await g.scrivi(`${account}/message_templates`, t)
    esiti.push({ nome: t.name, stato: r.status ?? 'PENDING', creato: true })
  }
  return esiti
}

async function main() {
  const a = argomenti()
  const comando = a._[0]
  const g = graph()

  switch (comando) {
    case 'numeri': {
      titolo('Numeri dell\'account WhatsApp')
      for (const n of await numeri(g, id(a.account, 'account'))) {
        info(`${n.display_phone_number}  ID: ${n.id}  nome: ${n.verified_name} (${n.name_status})  stato: ${n.status ?? '?'}  piattaforma: ${n.platform_type ?? '?'}`)
      }
      return
    }
    case 'registra': {
      const pin = String(richiesto(a.pin, 'Manca --pin (6 cifre a tua scelta: conservale)'))
      if (!/^\d{6}$/.test(pin)) throw new Errore('Il PIN deve essere di 6 cifre')
      await g.scrivi(`${id(a.numero, 'numero')}/register`, { messaging_product: 'whatsapp', pin })
      ok('numero registrato sull\'API Cloud. Conserva il PIN: serve se il numero va spostato o ri-registrato.')
      return
    }
    case 'iscrivi': {
      const account = id(a.account, 'account')
      await g.scrivi(`${account}/subscribed_apps`, {})
      const app = (await g.leggi(`${account}/subscribed_apps`)).data ?? []
      ok(`app collegata all'account (${app.map((x) => x.whatsapp_business_api_data?.name ?? x.name ?? '?').join(', ')})`)
      return
    }
    case 'template': {
      titolo('Modelli di messaggio')
      for (const e of await creaTemplate(g, id(a.account, 'account'))) {
        info(`${e.nome}: ${e.creato ? 'creato, ' : ''}${STATI_TEMPLATE[e.stato] ?? e.stato}${e.motivo && e.motivo !== 'NONE' ? ` (${e.motivo})` : ''}`)
      }
      info('L\'approvazione di Meta di solito arriva in pochi minuti, a volte in qualche ora.')
      return
    }
    case 'stato': {
      const n = await g.leggi(id(a.numero, 'numero'), {
        fields: 'display_phone_number,verified_name,name_status,code_verification_status,platform_type,status,quality_rating',
      })
      titolo('Numero')
      info(`${n.display_phone_number} — nome visualizzato «${n.verified_name}»: ${n.name_status}`)
      info(`verifica: ${n.code_verification_status ?? '?'} · stato: ${n.status ?? '?'} · piattaforma: ${n.platform_type ?? '?'} · qualità: ${n.quality_rating ?? '?'}`)
      if (n.platform_type !== 'CLOUD_API') info('→ non ancora registrato: usa «registra».')
      if (a.account) {
        const app = (await g.leggi(`${id(a.account, 'account')}/subscribed_apps`)).data ?? []
        info(app.length ? '→ app collegata all\'account: i messaggi arrivano al webhook' : '→ app NON collegata: usa «iscrivi»')
        const t = await g.leggi(`${a.account}/message_templates`, { fields: 'name,status', limit: '200' })
        for (const m of TEMPLATE) {
          const c = (t.data ?? []).find((x) => x.name === m.name)
          info(`modello ${m.name}: ${c ? STATI_TEMPLATE[c.status] ?? c.status : 'manca (usa «template»)'}`)
        }
      }
      return
    }
    default:
      throw new Errore('Comandi: numeri, registra, iscrivi, template, stato (vedi l\'inizio del file)')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) principale(main)
