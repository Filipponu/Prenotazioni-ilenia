'use client'

import { useEffect, useRef } from 'react'

/**
 * Finestra di dialogo modale (elemento <dialog> nativo): su telefono si
 * apre dal basso a tutta larghezza, su computer al centro.
 */
export function Finestra({
  aperta,
  onChiudi,
  titolo,
  children,
  piede,
}: {
  aperta: boolean
  onChiudi: () => void
  titolo: string
  children: React.ReactNode
  piede?: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (aperta && !d.open) d.showModal()
    if (!aperta && d.open) d.close()
  }, [aperta])

  return (
    <dialog
      ref={ref}
      onClose={onChiudi}
      onClick={(e) => {
        // clic sullo sfondo: chiude
        if (e.target === ref.current) onChiudi()
      }}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-3xl bg-white p-0 shadow-2xl sm:m-auto sm:max-w-lg sm:rounded-3xl"
    >
      {aperta ? (
        <div className="flex max-h-[92dvh] flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-stone-100 px-5 py-4">
            <h2 className="text-lg font-semibold text-stone-900">{titolo}</h2>
            <button
              type="button"
              onClick={onChiudi}
              aria-label="Chiudi"
              className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100"
            >
              <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden>
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {piede ? (
            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {piede}
            </footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  )
}
