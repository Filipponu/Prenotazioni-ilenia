'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BannerDemo, EVENTO_RIPRISTINO } from '@/components/BannerDemo'
import { Navigazione } from '@/components/Navigazione'
import { Caricamento, Pulsante, Scheda } from '@/components/ui'
import { scadenzeDemo } from '@/lib/api'
import { useSessione } from '@/lib/sessione'
import { modalitaDemo } from '@/lib/supabase'

/** Tutte le pagine del pannello: accessibili solo dopo il login. */
export default function LayoutPannello({ children }: { children: React.ReactNode }) {
  const { sessione, esci } = useSessione()
  const router = useRouter()
  // demo: dopo "Ripristina dati" le pagine si ricaricano da capo
  const [versione, setVersione] = useState(0)

  useEffect(() => {
    if (sessione.stato === 'anonimo') router.replace('/login/')
  }, [sessione.stato, router])

  // demo: nel sito vero le scadenze della lista d'attesa le gestisce il Worker ogni minuto
  useEffect(() => {
    if (!modalitaDemo || sessione.stato !== 'pronta') return
    const intervallo = setInterval(() => void scadenzeDemo(), 20_000)
    return () => clearInterval(intervallo)
  }, [sessione.stato])

  useEffect(() => {
    if (!modalitaDemo) return
    const ricarica = () => setVersione((v) => v + 1)
    window.addEventListener(EVENTO_RIPRISTINO, ricarica)
    return () => window.removeEventListener(EVENTO_RIPRISTINO, ricarica)
  }, [])

  if (sessione.stato === 'configurazione_mancante') {
    return (
      <Centrato>
        <Scheda>
          <h1 className="text-lg font-semibold">Configurazione mancante</h1>
          <p className="mt-2 text-sm text-stone-600">
            Il pannello non trova l&apos;indirizzo del database: sul Worker mancano <code>SUPABASE_URL</code> o{' '}
            <code>SUPABASE_PUBLISHABLE_KEY</code>. Vedi <code>docs/guida-messa-online.md</code>.
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
        <div className="mx-auto max-w-6xl">
          {modalitaDemo ? <BannerDemo /> : null}
          <div key={versione}>{children}</div>
        </div>
      </main>
    </div>
  )
}

function Centrato({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-dvh max-w-md items-center px-4">{children}</div>
}
