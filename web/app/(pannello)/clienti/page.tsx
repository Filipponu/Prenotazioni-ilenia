'use client'

import type { Cliente, StatoAppuntamento } from '@ilenia/shared/tipi-db'
import { formattaTelefono, linkWhatsApp } from '@ilenia/shared/telefono'
import { dataBreve, daIso, oraBreve } from '@ilenia/shared/tempo'
import { useCallback, useEffect, useState } from 'react'
import { useAvvisi } from '@/components/Avvisi'
import {
  CampiCliente,
  cercaClienti,
  datiDaCliente,
  nomeCliente,
  validaCliente,
  type DatiCliente,
} from '@/components/clienti'
import { Finestra } from '@/components/Finestra'
import { Caricamento, Campo, Etichetta, Pulsante, Scheda, TitoloPagina, Vuoto } from '@/components/ui'
import { messaggioErrore } from '@/lib/errori'
import { STATI } from '@/lib/stati'
import { supabase } from '@/lib/supabase'

type VoceStorico = {
  id: string
  inizio: string
  stato: StatoAppuntamento
  servizio: string | null
}

export default function PaginaClienti() {
  const avvisi = useAvvisi()
  const [ricerca, setRicerca] = useState('')
  const [clienti, setClienti] = useState<Cliente[] | null>(null)
  const [aperta, setAperta] = useState<{ cliente: Cliente | null } | null>(null)

  const carica = useCallback(
    async (testo: string) => {
      try {
        setClienti(await cercaClienti(testo, 100))
      } catch (e) {
        avvisi.errore(messaggioErrore(e))
      }
    },
    [avvisi],
  )

  useEffect(() => {
    const t = setTimeout(() => void carica(ricerca), 200)
    return () => clearTimeout(t)
  }, [ricerca, carica])

  return (
    <>
      <TitoloPagina
        titolo="Clienti"
        sottotitolo="Anagrafica, storico appuntamenti e note."
        azioni={<Pulsante onClick={() => setAperta({ cliente: null })}>+ Nuova cliente</Pulsante>}
      />

      <Campo
        type="search"
        placeholder="Cerca per nome o numero…"
        aria-label="Cerca cliente"
        value={ricerca}
        onChange={(e) => setRicerca(e.target.value)}
        className="mb-4"
      />

      {clienti === null ? (
        <Caricamento />
      ) : clienti.length === 0 ? (
        <Vuoto
          titolo={ricerca ? 'Nessuna cliente trovata' : 'Nessuna cliente'}
          testo={ricerca ? undefined : 'Le clienti che scrivono su WhatsApp compariranno qui da sole. Puoi anche aggiungerle a mano.'}
        />
      ) : (
        <Scheda senzaMargini>
          <ul className="divide-y divide-stone-100">
            {clienti.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setAperta({ cliente: c })}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-stone-50 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-stone-900">{nomeCliente(c)}</p>
                    {c.note ? <p className="truncate text-sm text-stone-500">{c.note}</p> : null}
                  </div>
                  <span className="shrink-0 text-sm text-stone-500">{c.nome ? formattaTelefono(c.telefono) : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </Scheda>
      )}

      {aperta ? (
        <SchedaCliente
          cliente={aperta.cliente}
          onChiudi={() => setAperta(null)}
          onSalvata={() => {
            setAperta(null)
            void carica(ricerca)
          }}
        />
      ) : null}
    </>
  )
}

function SchedaCliente({
  cliente,
  onChiudi,
  onSalvata,
}: {
  cliente: Cliente | null
  onChiudi: () => void
  onSalvata: () => void
}) {
  const avvisi = useAvvisi()
  const [dati, setDati] = useState<DatiCliente>(() => datiDaCliente(cliente))
  const [errori, setErrori] = useState<Partial<Record<keyof DatiCliente, string>>>({})
  const [inCorso, setInCorso] = useState(false)
  const [storico, setStorico] = useState<VoceStorico[] | null>(null)

  useEffect(() => {
    if (!cliente) return
    let attivo = true
    void supabase()
      .from('appuntamenti')
      .select('id, inizio, stato, servizi(nome)')
      .eq('cliente_id', cliente.id)
      .order('inizio', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!attivo) return
        if (error) avvisi.errore(messaggioErrore(error))
        else setStorico(data.map((a) => ({ id: a.id, inizio: a.inizio, stato: a.stato, servizio: a.servizi?.nome ?? null })))
      })
    return () => {
      attivo = false
    }
  }, [cliente, avvisi])

  async function salva(e: React.FormEvent) {
    e.preventDefault()
    const v = validaCliente(dati)
    if (!v.ok) {
      setErrori(v.errori)
      return
    }
    setErrori({})
    setInCorso(true)
    const sb = supabase()
    const { error } = cliente
      ? await sb.from('clienti').update(v.valori).eq('id', cliente.id)
      : await sb.from('clienti').insert(v.valori)
    setInCorso(false)
    if (error) {
      avvisi.errore(messaggioErrore(error))
      return
    }
    avvisi.successo(cliente ? 'Cliente aggiornata' : 'Cliente aggiunta')
    onSalvata()
  }

  async function elimina() {
    if (!cliente) return
    if (
      !window.confirm(
        `Eliminare ${nomeCliente(cliente)}? Verranno cancellati anche tutti i suoi appuntamenti e la conversazione col bot.`,
      )
    )
      return
    const { error } = await supabase().from('clienti').delete().eq('id', cliente.id)
    if (error) {
      avvisi.errore(messaggioErrore(error))
      return
    }
    avvisi.successo('Cliente eliminata')
    onSalvata()
  }

  const adesso = Date.now()
  const futuri = storico?.filter((a) => daIso(a.inizio).toMillis() >= adesso).reverse() ?? []
  const passati = storico?.filter((a) => daIso(a.inizio).toMillis() < adesso) ?? []

  return (
    <Finestra
      aperta
      onChiudi={onChiudi}
      titolo={cliente ? nomeCliente(cliente) : 'Nuova cliente'}
      piede={
        <>
          {cliente ? (
            <Pulsante variante="pericolo" className="mr-auto" onClick={() => void elimina()}>
              Elimina
            </Pulsante>
          ) : null}
          <Pulsante variante="secondario" onClick={onChiudi}>
            Annulla
          </Pulsante>
          <Pulsante type="submit" form="modulo-cliente" inCorso={inCorso}>
            Salva
          </Pulsante>
        </>
      }
    >
      <form id="modulo-cliente" onSubmit={salva}>
        <CampiCliente dati={dati} onCambia={setDati} errori={errori} />
      </form>

      {cliente?.telefono ? (
        <a
          href={linkWhatsApp(cliente.telefono)}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex text-sm font-medium text-brand-700 hover:underline"
        >
          Apri chat WhatsApp ↗
        </a>
      ) : null}

      {cliente ? (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-stone-800">Appuntamenti</h3>
          {storico === null ? (
            <Caricamento />
          ) : storico.length === 0 ? (
            <p className="text-sm text-stone-500">Nessun appuntamento.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {futuri.length > 0 ? <ListaStorico titolo="In programma" voci={futuri} /> : null}
              {passati.length > 0 ? <ListaStorico titolo="Passati" voci={passati} /> : null}
            </div>
          )}
        </div>
      ) : null}
    </Finestra>
  )
}

function ListaStorico({ titolo, voci }: { titolo: string; voci: VoceStorico[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium tracking-wide text-stone-500 uppercase">{titolo}</p>
      <ul className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-200">
        {voci.map((a) => {
          const dt = daIso(a.inizio)
          return (
            <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="text-stone-800">
                {dataBreve(dt)} {oraBreve(dt)}
                {a.servizio ? <span className="text-stone-500"> · {a.servizio}</span> : null}
              </span>
              <Etichetta colore={STATI[a.stato].colore}>{STATI[a.stato].testo}</Etichetta>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
