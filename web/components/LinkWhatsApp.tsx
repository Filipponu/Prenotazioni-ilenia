'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { Finestra } from './Finestra'
import { Pulsante } from './ui'

type Richiesta = { titolo: string; testo: string; link: string }

const Contesto = createContext<((r: Richiesta) => void) | null>(null)

/**
 * Finestra «scrivile da WhatsApp» con il messaggio già pronto (link wa.me):
 * vive in cima all'app, così resta aperta anche se la scheda da cui nasce
 * sparisce (es. la richiesta appena rifiutata esce dall'elenco).
 */
export function FornitoreLinkWhatsApp({ children }: { children: React.ReactNode }) {
  const [richiesta, setRichiesta] = useState<Richiesta | null>(null)
  const apri = useCallback((r: Richiesta) => setRichiesta(r), [])

  return (
    <Contesto.Provider value={apri}>
      {children}
      <Finestra
        aperta={richiesta !== null}
        onChiudi={() => setRichiesta(null)}
        titolo={richiesta?.titolo ?? ''}
        piede={
          <Pulsante variante="secondario" onClick={() => setRichiesta(null)}>
            Fatto
          </Pulsante>
        }
      >
        <p className="text-sm text-stone-700">{richiesta?.testo}</p>
        {richiesta ? (
          <a
            href={richiesta.link}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Apri WhatsApp
          </a>
        ) : null}
      </Finestra>
    </Contesto.Provider>
  )
}

export function useLinkWhatsApp() {
  const v = useContext(Contesto)
  if (!v) throw new Error('useLinkWhatsApp fuori da FornitoreLinkWhatsApp')
  return v
}
