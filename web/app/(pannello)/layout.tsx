'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Navigazione } from '@/components/Navigazione'
import { Caricamento, Pulsante, Scheda } from '@/components/ui'
import { useSessione } from '@/lib/sessione'

/** Tutte le pagine del pannello: accessibili solo dopo il login. */
export default function LayoutPannello({ children }: { children: React.ReactNode }) {
  const { sessione, esci } = useSessione()
  const router = useRouter()

  useEffect(() => {
    if (sessione.stato === 'anonimo') router.replace('/login/')
  }, [sessione.stato, router])

  if (sessione.stato === 'configurazione_mancante') {
    return (
      <Centrato>
        <Scheda>
          <h1 className="text-lg font-semibold">Configurazione mancante</h1>
          <p className="mt-2 text-sm text-stone-600">
            Mancano le variabili <code>NEXT_PUBLIC_SUPABASE_URL</code> e{' '}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>. Vedi <code>docs/test-fase-1.md</code>.
          </p>
        </Scheda>
      </Centrato>
    )
  }

  if (sessione.stato === 'non_abilitata') {
    return (
      <Centrato>
        <Scheda>
          <h1 className="text-lg font-semibold">Account non ancora abilitato</h1>
          <p className="mt-2 text-sm text-stone-600">
            Hai effettuato l&apos;accesso come <strong>{sessione.session.user.email}</strong>, ma questo account
            non è un&apos;operatrice attiva del salone.
          </p>
          <Pulsante className="mt-4" variante="secondario" onClick={() => void esci()}>
            Esci
          </Pulsante>
        </Scheda>
      </Centrato>
    )
  }

  if (sessione.stato !== 'pronta') return <Caricamento />

  return (
    <div className="min-h-dvh">
      <Navigazione nomeOperatrice={sessione.operatrice.nome} />
      <main className="px-4 pt-5 pb-28 md:ml-56 md:px-8 md:pt-8 md:pb-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  )
}

function Centrato({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-dvh max-w-md items-center px-4">{children}</div>
}
