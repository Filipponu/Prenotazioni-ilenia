'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { EVENTO_AGGIORNA_CONTATORI } from '@/lib/api'
import { modalitaDemo, supabase } from '@/lib/supabase'
import { Finestra } from './Finestra'
import { cx } from './ui'

type Voce = { href: string; etichetta: string; icona: React.ReactNode; contatore?: 'richieste' | 'messaggi' | 'attesa' }

const icona = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-6" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
)

const ICONA_AGENDA = icona(
      'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5',
    )

const ICONA_CLIENTI = icona(
      'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z',
    )

const ICONA_SERVIZI = icona(
      'M7.848 8.25l1.536.887M7.848 8.25a3 3 0 1 1-5.196-3 3 3 0 0 1 5.196 3Zm1.536.887a2.165 2.165 0 0 1 1.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 1 1-5.196 3 3 3 0 0 1 5.196-3Zm1.536-.887a2.165 2.165 0 0 0 1.083-1.838c.005-.352.054-.695.14-1.025m-1.223 2.863 2.077-1.199m0-3.328a4.323 4.323 0 0 1 2.068-1.379l5.325-1.628a4.5 4.5 0 0 1 2.48-.044l.803.215-7.794 4.5m-2.882-1.664A4.33 4.33 0 0 0 10.607 12m3.736 0 7.794 4.5-.802.215a4.5 4.5 0 0 1-2.48-.043l-5.326-1.629a4.324 4.324 0 0 1-2.068-1.379M14.343 12l-2.882 1.664',
    )

const ICONA_ORARI = icona('M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z')

const ICONA_IMPOSTAZIONI = icona(
      'M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    )

const AGENDA: Voce = { href: '/agenda/', etichetta: 'Agenda', icona: ICONA_AGENDA }
const RICHIESTE: Voce = {
  href: '/richieste/',
  etichetta: 'Richieste',
  contatore: 'richieste',
  icona: icona(
    'M9 3.75H6.912a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859M12 3v8.25m0 0-3-3m3 3 3-3',
  ),
}
const MESSAGGI: Voce = {
  href: '/messaggi/',
  etichetta: 'Messaggi',
  contatore: 'messaggi',
  icona: icona(
    'M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155',
  ),
}
const CLIENTI: Voce = { href: '/clienti/', etichetta: 'Clienti', icona: ICONA_CLIENTI }
const LISTA_ATTESA: Voce = {
  href: '/lista-attesa/',
  etichetta: "Lista d'attesa",
  contatore: 'attesa',
  icona: icona('M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z'),
}
const SERVIZI: Voce = { href: '/servizi/', etichetta: 'Servizi', icona: ICONA_SERVIZI }
const ORARI: Voce = { href: '/orari/', etichetta: 'Orari', icona: ICONA_ORARI }
const IMPOSTAZIONI: Voce = { href: '/impostazioni/', etichetta: 'Impostazioni', icona: ICONA_IMPOSTAZIONI }
/** Solo nella demo: il simulatore del bot, come se fossi una cliente. */
const PROVA_BOT: Voce = {
  href: '/whatsapp/',
  etichetta: 'Prova il bot',
  icona: icona(
    'M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3',
  ),
}
const ICONA_ALTRO = icona(
  'M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
)

const PRINCIPALI = [AGENDA, RICHIESTE, MESSAGGI, CLIENTI]
const SECONDARIE = modalitaDemo
  ? [LISTA_ATTESA, PROVA_BOT, SERVIZI, ORARI, IMPOSTAZIONI]
  : [LISTA_ATTESA, SERVIZI, ORARI, IMPOSTAZIONI]

/** Richieste da approvare e clienti che hanno chiesto di parlare con te. */
function useContatori() {
  const [contatori, setContatori] = useState({ richieste: 0, messaggi: 0, attesa: 0 })
  useEffect(() => {
    let attivo = true
    async function carica() {
      const sb = supabase()
      const [richieste, messaggi, attesa] = await Promise.all([
        sb.from('appuntamenti').select('id').eq('stato', 'in_attesa'),
        sb.from('conversazioni').select('id').gt('bot_in_pausa_fino_al', new Date().toISOString()),
        // proposte della lista d'attesa che Ilenia deve inviare dal suo telefono
        sb.from('proposte_anticipo').select('id').eq('stato', 'da_inviare'),
      ])
      if (attivo) {
        setContatori({
          richieste: richieste.data?.length ?? 0,
          messaggi: messaggi.data?.length ?? 0,
          attesa: attesa.data?.length ?? 0,
        })
      }
    }
    void carica()
    const intervallo = setInterval(() => void carica(), 60_000)
    window.addEventListener(EVENTO_AGGIORNA_CONTATORI, carica)
    return () => {
      attivo = false
      clearInterval(intervallo)
      window.removeEventListener(EVENTO_AGGIORNA_CONTATORI, carica)
    }
  }, [])
  return contatori
}

function Contatore({ n, piccolo }: { n: number; piccolo?: boolean }) {
  if (n <= 0) return null
  return (
    <span
      className={cx(
        'rounded-full bg-brand-600 font-semibold text-white tabular-nums',
        piccolo ? 'absolute -top-1 -right-2 min-w-4 px-1 text-center text-[10px] leading-4' : 'ml-auto px-2 text-xs leading-5',
      )}
    >
      {n}
    </span>
  )
}

export function Navigazione({ nomeOperatrice }: { nomeOperatrice: string }) {
  const percorso = usePathname()
  const contatori = useContatori()
  const [altroAperto, setAltroAperto] = useState(false)
  const attiva = (href: string) => percorso === href || percorso === href.slice(0, -1)
  const numero = (v: Voce) => (v.contatore ? contatori[v.contatore] : 0)
  const altroAttivo = SECONDARIE.some((v) => attiva(v.href))
  const altroContatore = SECONDARIE.reduce((somma, v) => somma + numero(v), 0)

  return (
    <>
      {/* computer: barra laterale */}
      <nav className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-stone-200 bg-white px-3 py-5 md:flex">
        <div className="mb-6 px-3">
          <p className="text-xs font-medium tracking-wide text-brand-600 uppercase">Prenotazioni</p>
          <p className="text-lg font-semibold text-stone-900">{nomeOperatrice}</p>
        </div>
        <ul className="flex flex-col gap-1">
          {[...PRINCIPALI, ...SECONDARIE].map((v) => (
            <li key={v.href}>
              <Link
                href={v.href}
                aria-current={attiva(v.href) ? 'page' : undefined}
                className={cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium',
                  attiva(v.href) ? 'bg-brand-50 text-brand-700' : 'text-stone-600 hover:bg-stone-100',
                )}
              >
                {v.icona}
                {v.etichetta}
                <Contatore n={numero(v)} />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* telefono: barra in basso con le voci principali + «Altro» */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="grid grid-cols-5">
          {PRINCIPALI.map((v) => (
            <li key={v.href}>
              <Link
                href={v.href}
                aria-current={attiva(v.href) ? 'page' : undefined}
                className={cx(
                  'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
                  attiva(v.href) ? 'text-brand-700' : 'text-stone-500',
                )}
              >
                <span className="relative">
                  {v.icona}
                  <Contatore n={numero(v)} piccolo />
                </span>
                {v.etichetta}
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setAltroAperto(true)}
              aria-haspopup="dialog"
              className={cx(
                'flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
                altroAttivo ? 'text-brand-700' : 'text-stone-500',
              )}
            >
              <span className="relative">
                {ICONA_ALTRO}
                <Contatore n={altroContatore} piccolo />
              </span>
              Altro
            </button>
          </li>
        </ul>
      </nav>

      <Finestra aperta={altroAperto} onChiudi={() => setAltroAperto(false)} titolo="Altro">
        <ul className="-mx-2 flex flex-col gap-1">
          {SECONDARIE.map((v) => (
            <li key={v.href}>
              <Link
                href={v.href}
                onClick={() => setAltroAperto(false)}
                className={cx(
                  'flex items-center gap-3 rounded-xl px-3 py-3 font-medium',
                  attiva(v.href) ? 'bg-brand-50 text-brand-700' : 'text-stone-700 hover:bg-stone-100',
                )}
              >
                {v.icona}
                {v.etichetta}
                <Contatore n={numero(v)} />
              </Link>
            </li>
          ))}
        </ul>
      </Finestra>
    </>
  )
}
