'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { Finestra } from './Finestra'
import { Pulsante } from './ui'

type Richiesta = {
  titolo: string
  messaggio: string
  conferma?: string
  annulla?: string
  pericolo?: boolean
}

type ChiediConferma = (r: Richiesta) => Promise<boolean>

const ContestoConferma = createContext<ChiediConferma | null>(null)

/**
 * Finestra di conferma dell'app (al posto di window.confirm, che su
 * telefono è brutta e in alcuni contesti incorporati non funziona).
 */
export function FornitoreConferma({ children }: { children: React.ReactNode }) {
  const [richiesta, setRichiesta] = useState<Richiesta | null>(null)
  const risolvi = useRef<((v: boolean) => void) | null>(null)

  const chiedi = useCallback<ChiediConferma>((r) => {
    risolvi.current?.(false)
    setRichiesta(r)
    return new Promise<boolean>((ok) => {
      risolvi.current = ok
    })
  }, [])

  function chiudi(esito: boolean) {
    risolvi.current?.(esito)
    risolvi.current = null
    setRichiesta(null)
  }

  return (
    <ContestoConferma.Provider value={chiedi}>
      {children}
      <Finestra
        aperta={richiesta !== null}
        onChiudi={() => chiudi(false)}
        titolo={richiesta?.titolo ?? ''}
        piede={
          <>
            <Pulsante variante="secondario" onClick={() => chiudi(false)}>
              {richiesta?.annulla ?? 'Annulla'}
            </Pulsante>
            <Pulsante variante={richiesta?.pericolo ? 'pericolo' : 'primario'} onClick={() => chiudi(true)}>
              {richiesta?.conferma ?? 'Conferma'}
            </Pulsante>
          </>
        }
      >
        <p className="text-sm text-stone-700">{richiesta?.messaggio}</p>
      </Finestra>
    </ContestoConferma.Provider>
  )
}

export function useConferma(): ChiediConferma {
  const v = useContext(ContestoConferma)
  if (!v) throw new Error('useConferma fuori da FornitoreConferma')
  return v
}
