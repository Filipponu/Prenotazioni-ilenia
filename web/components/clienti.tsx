'use client'

import type { Cliente } from '@ilenia/shared/tipi-db'
import { formattaTelefono, normalizzaTelefono } from '@ilenia/shared/telefono'
import { useEffect, useState } from 'react'
import { messaggioErrore } from '@/lib/errori'
import { pulisciRicerca } from '@/lib/stati'
import { supabase } from '@/lib/supabase'
import { AreaTesto, Campo, Pulsante, Voce } from './ui'

export function nomeCliente(c: Pick<Cliente, 'nome' | 'telefono'> | null | undefined): string {
  if (!c) return 'Cliente'
  return c.nome?.trim() || formattaTelefono(c.telefono) || 'Cliente'
}

/** Cerca clienti per nome o numero. */
export async function cercaClienti(testo: string, limite = 30): Promise<Cliente[]> {
  const q = pulisciRicerca(testo)
  let query = supabase().from('clienti').select('*').order('nome', { nullsFirst: false }).limit(limite)
  if (q) {
    const cifre = q.replace(/\D/g, '')
    const filtri = [`nome.ilike.%${q}%`]
    if (cifre.length >= 3) filtri.push(`telefono.ilike.%${cifre}%`)
    query = query.or(filtri.join(','))
  }
  const { data, error } = await query
  if (error) throw error
  return data
}

export type DatiCliente = { nome: string; telefono: string; email: string; note: string }

export function datiDaCliente(c: Cliente | null): DatiCliente {
  return {
    nome: c?.nome ?? '',
    telefono: c?.telefono ? formattaTelefono(c.telefono) : '',
    email: c?.email ?? '',
    note: c?.note ?? '',
  }
}

/** Valida e converte il modulo cliente nei valori per il database. */
export function validaCliente(d: DatiCliente):
  | { ok: true; valori: { nome: string | null; telefono: string | null; email: string | null; note: string | null } }
  | { ok: false; errori: Partial<Record<keyof DatiCliente, string>> } {
  const errori: Partial<Record<keyof DatiCliente, string>> = {}
  const nome = d.nome.trim() || null
  let telefono: string | null = null
  if (d.telefono.trim()) {
    telefono = normalizzaTelefono(d.telefono)
    if (!telefono) errori.telefono = 'Numero non valido (es. 333 123 4567 o +39 333 123 4567).'
  }
  const email = d.email.trim() || null
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errori.email = 'Email non valida.'
  if (!nome && !telefono && !errori.telefono) errori.nome = 'Serve almeno il nome o il numero.'
  if (Object.keys(errori).length > 0) return { ok: false, errori }
  return { ok: true, valori: { nome, telefono, email, note: d.note.trim() || null } }
}

/** Campi del modulo cliente (nome, WhatsApp, email, note). */
export function CampiCliente({
  dati,
  onCambia,
  errori,
  compatto,
}: {
  dati: DatiCliente
  onCambia: (d: DatiCliente) => void
  errori: Partial<Record<keyof DatiCliente, string>>
  compatto?: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      <Voce etichetta="Nome" errore={errori.nome}>
        {(id) => (
          <Campo id={id} autoComplete="off" maxLength={80} value={dati.nome} onChange={(e) => onCambia({ ...dati, nome: e.target.value })} />
        )}
      </Voce>
      <Voce etichetta="Numero WhatsApp" errore={errori.telefono} aiuto="Senza prefisso si assume +39.">
        {(id) => (
          <Campo
            id={id}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={dati.telefono}
            onChange={(e) => onCambia({ ...dati, telefono: e.target.value })}
          />
        )}
      </Voce>
      {!compatto ? (
        <>
          <Voce etichetta="Email (facoltativa)" errore={errori.email} aiuto="Serve solo per i promemoria via email.">
            {(id) => (
              <Campo id={id} type="email" inputMode="email" value={dati.email} onChange={(e) => onCambia({ ...dati, email: e.target.value })} />
            )}
          </Voce>
          <Voce etichetta="Note" aiuto="Visibili solo a te (es. allergie, preferenze).">
            {(id) => (
              <AreaTesto id={id} maxLength={2000} value={dati.note} onChange={(e) => onCambia({ ...dati, note: e.target.value })} />
            )}
          </Voce>
        </>
      ) : null}
    </div>
  )
}

/**
 * Scelta della cliente in un appuntamento: ricerca per nome/numero oppure
 * creazione al volo di una nuova cliente.
 */
export function SelettoreCliente({
  valore,
  onCambia,
}: {
  valore: Cliente | null
  onCambia: (c: Cliente | null) => void
}) {
  const [testo, setTesto] = useState('')
  const [risultati, setRisultati] = useState<Cliente[]>([])
  const [nuova, setNuova] = useState<DatiCliente | null>(null)
  const [errori, setErrori] = useState<Partial<Record<keyof DatiCliente, string>>>({})
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  useEffect(() => {
    if (valore || nuova) return
    let attivo = true
    const t = setTimeout(() => {
      cercaClienti(testo, 8)
        .then((r) => attivo && setRisultati(r))
        .catch((e: unknown) => attivo && setErrore(messaggioErrore(e)))
    }, 200)
    return () => {
      attivo = false
      clearTimeout(t)
    }
  }, [testo, valore, nuova])

  async function creaNuova() {
    if (!nuova) return
    const v = validaCliente(nuova)
    if (!v.ok) {
      setErrori(v.errori)
      return
    }
    setInCorso(true)
    const { data, error } = await supabase().from('clienti').insert(v.valori).select('*').single()
    setInCorso(false)
    if (error) {
      setErrore(messaggioErrore(error))
      return
    }
    setNuova(null)
    onCambia(data)
  }

  if (valore) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-50 px-3 py-2.5 ring-1 ring-brand-100">
        <div className="min-w-0">
          <p className="truncate font-medium text-stone-900">{nomeCliente(valore)}</p>
          {valore.telefono && valore.nome ? <p className="text-sm text-stone-500">{formattaTelefono(valore.telefono)}</p> : null}
        </div>
        <Pulsante piccolo variante="fantasma" onClick={() => onCambia(null)}>
          Cambia
        </Pulsante>
      </div>
    )
  }

  if (nuova) {
    return (
      <div className="flex flex-col gap-3 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
        <p className="text-sm font-medium text-stone-800">Nuova cliente</p>
        <CampiCliente dati={nuova} onCambia={setNuova} errori={errori} compatto />
        {errore ? <p className="text-sm text-red-700">{errore}</p> : null}
        <div className="flex justify-end gap-2">
          <Pulsante piccolo variante="secondario" onClick={() => setNuova(null)}>
            Annulla
          </Pulsante>
          <Pulsante piccolo onClick={() => void creaNuova()} inCorso={inCorso}>
            Crea cliente
          </Pulsante>
        </div>
      </div>
    )
  }

  const sembraNumero = /^[+\d\s]{6,}$/.test(testo.trim())

  return (
    <div className="flex flex-col gap-2">
      <Campo
        type="search"
        placeholder="Cerca per nome o numero…"
        aria-label="Cerca cliente"
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
        autoComplete="off"
      />
      {errore ? <p className="text-sm text-red-700">{errore}</p> : null}
      <ul className="max-h-56 overflow-y-auto rounded-xl ring-1 ring-stone-200">
        {risultati.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onCambia(c)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-stone-50"
            >
              <span className="truncate font-medium text-stone-800">{nomeCliente(c)}</span>
              <span className="shrink-0 text-sm text-stone-500">{c.nome ? formattaTelefono(c.telefono) : ''}</span>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => {
              setErrori({})
              setErrore(null)
              setNuova({
                nome: sembraNumero ? '' : testo.trim(),
                telefono: sembraNumero ? testo.trim() : '',
                email: '',
                note: '',
              })
            }}
            className="w-full px-3 py-2 text-left text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            + Nuova cliente{testo.trim() ? `: «${testo.trim()}»` : ''}
          </button>
        </li>
      </ul>
    </div>
  )
}
