'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

type Avviso = { id: number; tipo: 'successo' | 'errore'; testo: string }

type ValoreAvvisi = {
  successo: (testo: string) => void
  errore: (testo: string) => void
}

const ContestoAvvisi = createContext<ValoreAvvisi | null>(null)

let prossimoId = 1

/** Piccoli messaggi a comparsa ("Salvato", "Errore: …"). */
export function FornitoreAvvisi({ children }: { children: React.ReactNode }) {
  const [avvisi, setAvvisi] = useState<Avviso[]>([])

  const aggiungi = useCallback((tipo: Avviso['tipo'], testo: string) => {
    const id = prossimoId++
    setAvvisi((a) => [...a, { id, tipo, testo }])
    setTimeout(() => setAvvisi((a) => a.filter((x) => x.id !== id)), tipo === 'errore' ? 6000 : 2500)
  }, [])

  const valore = useMemo<ValoreAvvisi>(
    () => ({
      successo: (t) => aggiungi('successo', t),
      errore: (t) => aggiungi('errore', t),
    }),
    [aggiungi],
  )

  return (
    <ContestoAvvisi.Provider value={valore}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4"
      >
        {avvisi.map((a) => (
          <div
            key={a.id}
            role={a.tipo === 'errore' ? 'alert' : 'status'}
            className={`max-w-md rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${
              a.tipo === 'errore' ? 'bg-red-600 text-white' : 'bg-stone-900 text-white'
            }`}
          >
            {a.testo}
          </div>
        ))}
      </div>
    </ContestoAvvisi.Provider>
  )
}

export function useAvvisi(): ValoreAvvisi {
  const v = useContext(ContestoAvvisi)
  if (!v) throw new Error('useAvvisi fuori da FornitoreAvvisi')
  return v
}
