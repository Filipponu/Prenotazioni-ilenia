'use client'

import { formattaTelefono } from '@ilenia/shared/telefono'
import { adesso, dataOraLunga, daIso, durataLeggibile } from '@ilenia/shared/tempo'
import type { Cliente } from '@ilenia/shared/tipi-db'
import { statoFinestra, type StatoFinestra } from '@ilenia/shared/whatsapp/finestra'
import { useCallback, useEffect, useState } from 'react'
import { useAvvisi } from '@/components/Avvisi'
import { nomeCliente } from '@/components/clienti'
import { AzioniRichiesta, EtichettaFinestra } from '@/components/richieste/AzioniRichiesta'
import { Caricamento, Etichetta, Scheda, TitoloPagina, Vuoto } from '@/components/ui'
import { EVENTO_AGGIORNA_CONTATORI } from '@/lib/api'
import { messaggioErrore } from '@/lib/errori'
import { supabase } from '@/lib/supabase'

type Richiesta = {
  id: string
  inizio: string
  fine: string
  origine: string
  creato_il: string
  cliente_id: string
  clienti: Cliente | null
  servizi: { nome: string; durata_minuti: number } | null
}

export default function PaginaRichieste() {
  const avvisi = useAvvisi()
  const [richieste, setRichieste] = useState<Richiesta[] | null>(null)
  const [finestre, setFinestre] = useState<Record<string, StatoFinestra>>({})

  const carica = useCallback(async () => {
    const sb = supabase()
    const { data, error } = await sb
      .from('appuntamenti')
      .select('id, inizio, fine, origine, creato_il, cliente_id, clienti(*), servizi(nome, durata_minuti)')
      .eq('stato', 'in_attesa')
      .order('inizio')
    if (error) {
      avvisi.errore(messaggioErrore(error))
      return
    }
    const lista = data as Richiesta[]
    const ids = [...new Set(lista.map((r) => r.cliente_id))]
    const ora = adesso()
    const mappa: Record<string, StatoFinestra> = {}
    if (ids.length > 0) {
      const { data: conv } = await sb.from('conversazioni').select('cliente_id, ultimo_messaggio_cliente_il').in('cliente_id', ids)
      for (const id of ids) {
        mappa[id] = statoFinestra(conv?.find((c) => c.cliente_id === id)?.ultimo_messaggio_cliente_il, ora)
      }
    }
    setFinestre(mappa)
    setRichieste(lista)
  }, [avvisi])

  useEffect(() => {
    void carica()
    // nuove richieste dal bot: ricarico ogni minuto e dopo ogni azione
    const intervallo = setInterval(() => void carica(), 60_000)
    window.addEventListener(EVENTO_AGGIORNA_CONTATORI, carica)
    return () => {
      clearInterval(intervallo)
      window.removeEventListener(EVENTO_AGGIORNA_CONTATORI, carica)
    }
  }, [carica])

  const ora = adesso().toMillis()

  return (
    <>
      <TitoloPagina
        titolo="Richieste"
        sottotitolo="Prenotazioni arrivate su WhatsApp che aspettano la tua conferma."
      />
      {richieste === null ? (
        <Caricamento />
      ) : richieste.length === 0 ? (
        <Vuoto
          titolo="Nessuna richiesta da approvare"
          testo="Quando una cliente prenota su WhatsApp, la richiesta compare qui. Con l'approvazione automatica (Impostazioni) si conferma da sola."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {richieste.map((r) => {
            const inizio = daIso(r.inizio)
            const passata = inizio.toMillis() < ora
            const telefono = r.clienti?.telefono ?? null
            return (
              <li key={r.id}>
                <Scheda>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold text-stone-900">{nomeCliente(r.clienti)}</p>
                      <p className="text-sm text-stone-500">{formattaTelefono(telefono)}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {passata ? <Etichetta colore="rosso">Orario già passato</Etichetta> : null}
                      <EtichettaFinestra finestra={finestre[r.cliente_id] ?? null} telefono={telefono} />
                    </div>
                  </div>
                  <p className="mt-3 font-medium text-stone-800 first-letter:uppercase">{dataOraLunga(inizio)}</p>
                  <p className="text-sm text-stone-600">
                    {r.servizi ? `${r.servizi.nome} · ${durataLeggibile(r.servizi.durata_minuti)}` : 'Senza servizio'}
                    {' · '}
                    {r.origine === 'whatsapp' ? 'chiesta su WhatsApp' : 'inserita dal pannello'}
                  </p>
                  {r.clienti?.note ? <p className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">{r.clienti.note}</p> : null}
                  <div className="mt-4">
                    <AzioniRichiesta
                      appuntamentoId={r.id}
                      cliente={nomeCliente(r.clienti)}
                      telefono={telefono}
                      finestra={finestre[r.cliente_id] ?? null}
                      onFatto={() => void carica()}
                    />
                  </div>
                </Scheda>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
