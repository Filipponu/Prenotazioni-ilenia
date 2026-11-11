'use client'

import { ripristinaDemo } from '@/lib/demo/backend'
import { useAvvisi } from './Avvisi'
import { useConferma } from './Conferma'

export const EVENTO_RIPRISTINO = 'ilenia-demo-ripristinata'

/** Fascia in cima al pannello nella versione dimostrativa. */
export function BannerDemo() {
  const conferma = useConferma()
  const avvisi = useAvvisi()

  async function ripristina() {
    const ok = await conferma({
      titolo: 'Ripristinare i dati di esempio?',
      messaggio: 'Le modifiche fatte durante la prova verranno cancellate e torneranno gli appuntamenti di esempio.',
      conferma: 'Ripristina',
    })
    if (!ok) return
    ripristinaDemo()
    window.dispatchEvent(new Event(EVENTO_RIPRISTINO))
    avvisi.successo('Dati di esempio ripristinati')
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
      <p>
        <strong>Versione dimostrativa.</strong> Clienti e appuntamenti sono esempi inventati e restano solo in questo
        browser.
      </p>
      <button type="button" onClick={() => void ripristina()} className="font-medium underline underline-offset-2">
        Ripristina dati di esempio
      </button>
    </div>
  )
}
