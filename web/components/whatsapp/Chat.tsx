'use client'

import { daIso, oraBreve } from '@ilenia/shared/tempo'
import type { MessaggioUscita, RigaLista } from '@ilenia/shared/whatsapp/messaggi'
import type { ContenutoIngresso } from '@ilenia/shared/whatsapp/webhook'
import { useEffect, useRef, useState } from 'react'
import { Finestra } from '../Finestra'
import { cx } from '../ui'

export type VoceChat =
  | { id: string | number; direzione: 'in'; contenuto: ContenutoIngresso; ora: string }
  | { id: string | number; direzione: 'out'; contenuto: MessaggioUscita; ora: string }

/**
 * Conversazione in stile WhatsApp: messaggi della cliente a destra, del bot
 * a sinistra, con pulsanti e liste toccabili (se onScelta è presente).
 */
export function Chat({
  voci,
  staScrivendo,
  onScelta,
}: {
  voci: VoceChat[]
  staScrivendo?: boolean
  onScelta?: (id: string, titolo: string) => void
}) {
  const fondo = useRef<HTMLDivElement>(null)
  const [lista, setLista] = useState<{ titolo: string; righe: RigaLista[] } | null>(null)

  useEffect(() => {
    fondo.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [voci.length, staScrivendo])

  return (
    <div className="flex flex-col gap-2 px-3 py-4" style={{ background: '#efeae2' }}>
      {voci.length === 0 ? (
        <p className="mx-auto my-6 max-w-xs rounded-lg bg-white/80 px-3 py-2 text-center text-xs text-stone-600">
          Scrivi un messaggio qualsiasi, per esempio «ciao Ilenia».
        </p>
      ) : null}
      {voci.map((v) => (
        <Fumetto key={`${v.direzione}-${v.id}`} voce={v} onScelta={onScelta} onApriLista={setLista} />
      ))}
      {staScrivendo ? (
        <div className="self-start rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm text-stone-500 shadow-sm">
          sta scrivendo…
        </div>
      ) : null}
      <div ref={fondo} />

      <Finestra aperta={lista !== null} onChiudi={() => setLista(null)} titolo={lista?.titolo ?? ''}>
        <ul className="-mx-2 divide-y divide-stone-100">
          {lista?.righe.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full rounded-lg px-2 py-3 text-left hover:bg-stone-50"
                onClick={() => {
                  setLista(null)
                  onScelta?.(r.id, r.titolo)
                }}
              >
                <span className="block font-medium text-stone-900">{r.titolo}</span>
                {r.descrizione ? <span className="block text-sm text-stone-500">{r.descrizione}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </Finestra>
    </div>
  )
}

function Fumetto({
  voce,
  onScelta,
  onApriLista,
}: {
  voce: VoceChat
  onScelta?: (id: string, titolo: string) => void
  onApriLista: (l: { titolo: string; righe: RigaLista[] }) => void
}) {
  const ora = (() => {
    try {
      return oraBreve(daIso(voce.ora))
    } catch {
      return ''
    }
  })()

  if (voce.direzione === 'in') {
    const c = voce.contenuto
    const testo = c.tipo === 'testo' ? c.testo : c.tipo === 'scelta' ? c.titolo : `(${c.descrizione})`
    return (
      <div className="max-w-[85%] self-end rounded-lg rounded-tr-none px-3 py-1.5 text-sm text-stone-900 shadow-sm" style={{ background: '#d9fdd3' }}>
        <p className="whitespace-pre-wrap">{testo}</p>
        <p className="text-right text-[10px] text-stone-500">{ora}</p>
      </div>
    )
  }

  const m = voce.contenuto
  const corpo = m.tipo === 'template' ? m.anteprima : m.testo
  return (
    <div className="flex max-w-[85%] flex-col gap-0.5 self-start">
      <div className="rounded-lg rounded-tl-none bg-white px-3 py-1.5 text-sm text-stone-900 shadow-sm">
        <p className="whitespace-pre-wrap">{corpo}</p>
        {'piede' in m && m.piede ? <p className="mt-1 text-xs text-stone-500">{m.piede}</p> : null}
        <p className="text-right text-[10px] text-stone-500">{ora}</p>
      </div>
      {m.tipo === 'pulsanti'
        ? m.pulsanti.map((p) => (
            <BottoneWa key={p.id} disabilitato={!onScelta} onClick={() => onScelta?.(p.id, p.titolo)}>
              {p.titolo}
            </BottoneWa>
          ))
        : null}
      {m.tipo === 'lista' ? (
        <BottoneWa disabilitato={!onScelta} onClick={() => onApriLista({ titolo: m.pulsante, righe: m.righe })}>
          ☰ {m.pulsante}
        </BottoneWa>
      ) : null}
    </div>
  )
}

function BottoneWa({
  children,
  onClick,
  disabilitato,
}: {
  children: React.ReactNode
  onClick: () => void
  disabilitato: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabilitato}
      className={cx(
        'rounded-lg bg-white px-3 py-2 text-center text-sm font-medium shadow-sm',
        disabilitato ? 'text-stone-400' : 'text-sky-700 hover:bg-sky-50',
      )}
    >
      {children}
    </button>
  )
}
