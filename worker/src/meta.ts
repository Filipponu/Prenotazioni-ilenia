/**
 * Invio dei messaggi tramite l'API Cloud ufficiale di Meta (Graph API),
 * oppure "simulato" (risposte solo nei log) finché non c'è un numero.
 */
import type { Canale } from '@ilenia/shared/bot/motore'
import { lettoVersoMeta, testoDi, versoMeta, type MessaggioUscita } from '@ilenia/shared/whatsapp/messaggi'
import type { Ambiente } from './ambiente'

export interface CanaleWorker extends Canale {
  /** spunte blu sul messaggio della cliente (gratuito) */
  segnaLetto(idMessaggio: string): Promise<void>
}

export function canaleMeta(env: Ambiente): CanaleWorker {
  const versione = env.WHATSAPP_GRAPH_VERSION || 'v24.0'
  const indirizzo = `https://graph.facebook.com/${versione}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`

  async function chiama(corpo: unknown): Promise<{ messages?: Array<{ id?: string }> }> {
    const r = await fetch(indirizzo, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    })
    const testo = await r.text()
    if (!r.ok) throw new Error(`API WhatsApp ${r.status}: ${testo.slice(0, 500)}`)
    return testo ? (JSON.parse(testo) as { messages?: Array<{ id?: string }> }) : {}
  }

  return {
    async invia(telefono, messaggio) {
      const risposta = await chiama(versoMeta(telefono, messaggio))
      return { id: risposta.messages?.[0]?.id ?? null }
    },
    async segnaLetto(idMessaggio) {
      try {
        await chiama(lettoVersoMeta(idMessaggio))
      } catch (e) {
        console.warn('Impossibile segnare come letto', e)
      }
    },
  }
}

/** Testo del messaggio con gli ID da usare in strumenti/simula-whatsapp.mjs --scelta <id>. */
export function testoConScelte(m: MessaggioUscita): string {
  if (m.tipo === 'pulsanti') return `${m.testo}\n${m.pulsanti.map((p) => `  [${p.titolo}]  --scelta ${p.id}`).join('\n')}`
  if (m.tipo === 'lista') {
    const righe = m.righe.map((r) => `  • ${r.titolo}${r.descrizione ? ` (${r.descrizione})` : ''}  --scelta ${r.id}`)
    return `${m.testo}\n${righe.join('\n')}`
  }
  return testoDi(m)
}

export function canaleSimulato(): CanaleWorker {
  return {
    async invia(telefono, messaggio) {
      console.log(`[WhatsApp simulato] → ${telefono}\n${testoConScelte(messaggio)}\n`)
      return { id: `sim.${crypto.randomUUID()}` }
    },
    async segnaLetto() {},
  }
}

export function creaCanale(env: Ambiente): CanaleWorker {
  const reale = env.WHATSAPP_MODALITA !== 'simulata' && env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID
  return reale ? canaleMeta(env) : canaleSimulato()
}
