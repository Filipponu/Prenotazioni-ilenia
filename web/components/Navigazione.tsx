'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { modalitaDemo } from '@/lib/supabase'
import { cx } from './ui'

type Voce = { href: string; etichetta: string; icona: React.ReactNode }

const icona = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-6" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
)

export const VOCI: Voce[] = [
  {
    href: '/agenda/',
    etichetta: 'Agenda',
    icona: icona(
      'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5',
    ),
  },
  {
    href: '/clienti/',
    etichetta: 'Clienti',
    icona: icona(
      'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z',
    ),
  },
  {
    href: '/servizi/',
    etichetta: 'Servizi',
    icona: icona(
      'M7.848 8.25l1.536.887M7.848 8.25a3 3 0 1 1-5.196-3 3 3 0 0 1 5.196 3Zm1.536.887a2.165 2.165 0 0 1 1.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 1 1-5.196 3 3 3 0 0 1 5.196-3Zm1.536-.887a2.165 2.165 0 0 0 1.083-1.838c.005-.352.054-.695.14-1.025m-1.223 2.863 2.077-1.199m0-3.328a4.323 4.323 0 0 1 2.068-1.379l5.325-1.628a4.5 4.5 0 0 1 2.48-.044l.803.215-7.794 4.5m-2.882-1.664A4.33 4.33 0 0 0 10.607 12m3.736 0 7.794 4.5-.802.215a4.5 4.5 0 0 1-2.48-.043l-5.326-1.629a4.324 4.324 0 0 1-2.068-1.379M14.343 12l-2.882 1.664',
    ),
  },
  {
    href: '/orari/',
    etichetta: 'Orari',
    icona: icona('M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'),
  },
  {
    href: '/impostazioni/',
    etichetta: 'Impostazioni',
    icona: icona(
      'M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    ),
  },
]

/** Solo nella demo: il simulatore del bot WhatsApp. */
const VOCE_WHATSAPP: Voce = {
  href: '/whatsapp/',
  etichetta: 'WhatsApp',
  icona: icona(
    'M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z',
  ),
}

export function Navigazione({ nomeOperatrice }: { nomeOperatrice: string }) {
  const percorso = usePathname()
  const voci = modalitaDemo ? [VOCI[0]!, VOCE_WHATSAPP, ...VOCI.slice(1)] : VOCI
  const attiva = (href: string) => percorso === href || percorso === href.slice(0, -1)

  return (
    <>
      {/* computer: barra laterale */}
      <nav className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-stone-200 bg-white px-3 py-5 md:flex">
        <div className="mb-6 px-3">
          <p className="text-xs font-medium tracking-wide text-brand-600 uppercase">Prenotazioni</p>
          <p className="text-lg font-semibold text-stone-900">{nomeOperatrice}</p>
        </div>
        <ul className="flex flex-col gap-1">
          {voci.map((v) => (
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
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* telefono: barra in basso */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className={cx('grid', voci.length > 5 ? 'grid-cols-6' : 'grid-cols-5')}>
          {voci.map((v) => (
            <li key={v.href}>
              <Link
                href={v.href}
                aria-current={attiva(v.href) ? 'page' : undefined}
                className={cx(
                  'flex flex-col items-center gap-0.5 py-2 font-medium',
                  voci.length > 5 ? 'text-[10px] tracking-tight' : 'text-[11px]',
                  attiva(v.href) ? 'text-brand-700' : 'text-stone-500',
                )}
              >
                {v.icona}
                {v.etichetta}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
