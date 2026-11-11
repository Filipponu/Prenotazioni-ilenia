'use client'

import { forwardRef, useId } from 'react'

function cx(...classi: Array<string | false | null | undefined>): string {
  return classi.filter(Boolean).join(' ')
}

type Variante = 'primario' | 'secondario' | 'pericolo' | 'fantasma'

const stiliPulsante: Record<Variante, string> = {
  primario: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300',
  secondario: 'bg-white text-stone-800 ring-1 ring-stone-300 hover:bg-stone-50 disabled:text-stone-400',
  pericolo: 'bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:text-red-300',
  fantasma: 'text-stone-700 hover:bg-stone-100 disabled:text-stone-400',
}

export const Pulsante = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; piccolo?: boolean; inCorso?: boolean }
>(function Pulsante({ variante = 'primario', piccolo, inCorso, className, children, disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || inCorso}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed',
        piccolo ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm',
        stiliPulsante[variante],
        className,
      )}
      {...props}
    >
      {inCorso ? <Rotella piccola /> : null}
      {children}
    </button>
  )
})

const stileCampo =
  'w-full rounded-xl border-0 bg-white px-3 py-2.5 text-base text-stone-900 ring-1 ring-stone-300 placeholder:text-stone-400 focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:bg-stone-100 sm:text-sm'

export const Campo = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Campo(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cx(stileCampo, className)} {...props} />
})

export function AreaTesto({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(stileCampo, 'min-h-20', className)} {...props} />
}

export function Scelta({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(stileCampo, 'pr-8', className)} {...props}>
      {children}
    </select>
  )
}

/** Etichetta + campo + suggerimento/errore. Il campo riceve l'id via render prop. */
export function Voce({
  etichetta,
  aiuto,
  errore,
  children,
  className,
}: {
  etichetta: string
  aiuto?: React.ReactNode
  errore?: string | null
  children: (id: string) => React.ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-stone-700">
        {etichetta}
      </label>
      {children(id)}
      {errore ? (
        <p className="text-sm text-red-700">{errore}</p>
      ) : aiuto ? (
        <p className="text-xs text-stone-500">{aiuto}</p>
      ) : null}
    </div>
  )
}

/** Riquadro bianco. senzaMargini: per liste che arrivano fino ai bordi. */
export function Scheda({
  className,
  senzaMargini,
  children,
}: {
  className?: string
  senzaMargini?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={cx('overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200', !senzaMargini && 'p-4 sm:p-5', className)}
    >
      {children}
    </section>
  )
}

export function TitoloPagina({ titolo, sottotitolo, azioni }: { titolo: string; sottotitolo?: string; azioni?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{titolo}</h1>
        {sottotitolo ? <p className="mt-0.5 text-sm text-stone-500">{sottotitolo}</p> : null}
      </div>
      {azioni ? <div className="flex gap-2">{azioni}</div> : null}
    </div>
  )
}

export function Etichetta({
  colore = 'neutro',
  children,
}: {
  colore?: 'neutro' | 'brand' | 'ambra' | 'verde' | 'rosso'
  children: React.ReactNode
}) {
  const colori = {
    neutro: 'bg-stone-100 text-stone-700',
    brand: 'bg-brand-100 text-brand-800',
    ambra: 'bg-amber-100 text-amber-800',
    verde: 'bg-emerald-100 text-emerald-800',
    rosso: 'bg-red-100 text-red-800',
  }
  return (
    <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', colori[colore])}>
      {children}
    </span>
  )
}

export function Vuoto({ titolo, testo, azione }: { titolo: string; testo?: string; azione?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-stone-300 px-6 py-10 text-center">
      <p className="font-medium text-stone-800">{titolo}</p>
      {testo ? <p className="max-w-sm text-sm text-stone-500">{testo}</p> : null}
      {azione ? <div className="mt-2">{azione}</div> : null}
    </div>
  )
}

export function Rotella({ piccola }: { piccola?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        'inline-block animate-spin rounded-full border-2 border-current border-r-transparent',
        piccola ? 'size-4' : 'size-6',
      )}
    />
  )
}

export function Caricamento({ testo = 'Caricamento…' }: { testo?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-stone-500" role="status">
      <Rotella />
      <span>{testo}</span>
    </div>
  )
}

export function Interruttore({
  attivo,
  onCambia,
  etichetta,
  disabled,
}: {
  attivo: boolean
  onCambia: (v: boolean) => void
  etichetta: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={attivo}
      aria-label={etichetta}
      disabled={disabled}
      onClick={() => onCambia(!attivo)}
      className={cx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        attivo ? 'bg-brand-600' : 'bg-stone-300',
      )}
    >
      <span
        className={cx(
          'inline-block size-5 rounded-full bg-white shadow transition-transform',
          attivo ? 'translate-x-5.5' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

export { cx }
