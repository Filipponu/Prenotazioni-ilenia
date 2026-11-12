/** Invio email con Resend (piano gratuito: 3.000 al mese, 100 al giorno). */
import type { Ambiente } from './ambiente'

export async function inviaEmail(env: Ambiente, destinatario: string, oggetto: string, testo: string): Promise<void> {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY mancante')
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM || 'Prenotazioni <onboarding@resend.dev>',
      to: [destinatario],
      subject: oggetto,
      text: testo,
    }),
  })
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`)
}
