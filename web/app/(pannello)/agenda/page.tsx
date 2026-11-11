'use client'

import type { EventInput } from '@fullcalendar/react'
import { limitiSettimana, verificaOrario, type Fascia } from '@ilenia/shared/orari'
import { adesso, daIso, minutiDaOra, oraBreve, oraDaMinuti, versoIso } from '@ilenia/shared/tempo'
import type { ChiusuraDb, Servizio, StatoAppuntamento } from '@ilenia/shared/tipi-db'
import type { DateTime } from 'luxon'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PropsCalendario, Vista } from '@/components/agenda/Calendario'
import { ModuloAppuntamento, type AperturaModulo, type AppuntamentoCompleto } from '@/components/agenda/ModuloAppuntamento'
import { useAvvisi } from '@/components/Avvisi'
import { nomeCliente } from '@/components/clienti'
import { Caricamento, Interruttore, Pulsante, TitoloPagina } from '@/components/ui'
import { messaggioErrore } from '@/lib/errori'
import { STATI } from '@/lib/stati'
import { supabase } from '@/lib/supabase'

const Calendario = dynamic<PropsCalendario>(() => import('@/components/agenda/Calendario'), {
  ssr: false,
  loading: () => <Caricamento testo="Carico l'agenda…" />,
})

const STATI_VISIBILI: StatoAppuntamento[] = ['in_attesa', 'confermato', 'completato']
const STATI_TUTTI: StatoAppuntamento[] = [...STATI_VISIBILI, 'disdetto', 'rifiutato']

export default function PaginaAgenda() {
  const avvisi = useAvvisi()
  const [orari, setOrari] = useState<Fascia[] | null>(null)
  const [servizi, setServizi] = useState<Servizio[]>([])
  const [intervallo, setIntervallo] = useState<{ inizio: DateTime; fine: DateTime } | null>(null)
  const [appuntamenti, setAppuntamenti] = useState<AppuntamentoCompleto[]>([])
  const [chiusure, setChiusure] = useState<ChiusuraDb[]>([])
  const [mostraAnnullati, setMostraAnnullati] = useState(false)
  const [apertura, setApertura] = useState<AperturaModulo | null>(null)
  const [vistaIniziale] = useState<Vista>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
  )

  // orari e servizi: una volta sola
  useEffect(() => {
    const sb = supabase()
    void Promise.all([
      sb.from('orari_settimanali').select('giorno, ora_inizio, ora_fine'),
      sb.from('servizi').select('*').order('ordine').order('nome'),
    ]).then(([o, s]) => {
      if (o.error || s.error) avvisi.errore(messaggioErrore(o.error ?? s.error))
      setOrari(o.data ?? [])
      setServizi(s.data ?? [])
    })
  }, [avvisi])

  const caricaPeriodo = useCallback(async () => {
    if (!intervallo) return
    const sb = supabase()
    const da = versoIso(intervallo.inizio)
    const a = versoIso(intervallo.fine)
    const [app, chi] = await Promise.all([
      sb
        .from('appuntamenti')
        .select('*, clienti(*), servizi(nome, durata_minuti)')
        .in('stato', mostraAnnullati ? STATI_TUTTI : STATI_VISIBILI)
        .lt('inizio', a)
        .gt('fine', da)
        .order('inizio'),
      sb.from('chiusure').select('*').lt('inizio', a).gt('fine', da),
    ])
    if (app.error || chi.error) {
      avvisi.errore(messaggioErrore(app.error ?? chi.error))
      return
    }
    setAppuntamenti(app.data as AppuntamentoCompleto[])
    setChiusure(chi.data)
  }, [intervallo, mostraAnnullati, avvisi])

  useEffect(() => {
    void caricaPeriodo()
  }, [caricaPeriodo])

  const eventi = useMemo<EventInput[]>(
    () => [
      ...appuntamenti.map((a) => ({
        id: a.id,
        start: a.inizio,
        end: a.fine,
        title: [nomeCliente(a.clienti), a.servizi?.nome].filter(Boolean).join(' · '),
        color: STATI[a.stato].calendario,
        editable: a.stato === 'in_attesa' || a.stato === 'confermato',
        className:
          a.stato === 'in_attesa' ? 'evento-in-attesa' : a.stato === 'disdetto' || a.stato === 'rifiutato' ? 'evento-annullato' : undefined,
      })),
      ...chiusure.map((c) => ({
        id: `chiusura-${c.id}`,
        start: c.inizio,
        end: c.fine,
        title: c.motivo ?? 'Chiuso',
        display: 'background',
      })),
    ],
    [appuntamenti, chiusure],
  )

  // l'agenda mostra l'orario di lavoro, allargato se ci sono appuntamenti fuori orario
  const { oraMinima, oraMassima } = useMemo(() => {
    const base = limitiSettimana(orari ?? [])
    let min = minutiDaOra(base.min)
    let max = minutiDaOra(base.max)
    for (const a of appuntamenti) {
      const i = daIso(a.inizio)
      const f = daIso(a.fine)
      min = Math.min(min, i.hour * 60 + i.minute)
      max = Math.max(max, f.hasSame(i, 'day') ? f.hour * 60 + f.minute : 24 * 60)
    }
    min = Math.max(0, Math.floor(min / 60) * 60 - 30)
    max = Math.min(24 * 60, Math.ceil(max / 60) * 60 + 30)
    return { oraMinima: oraDaMinuti(min), oraMassima: max >= 24 * 60 ? '24:00' : oraDaMinuti(max) }
  }, [orari, appuntamenti])

  const onSposta = useCallback(
    async (id: string, inizio: DateTime, fine: DateTime, annulla: () => void) => {
      const a = appuntamenti.find((x) => x.id === id)
      if (!a) return annulla()
      const esito = verificaOrario(inizio, fine, orari ?? [], chiusure)
      if (
        (esito.fuoriOrario || esito.chiusura) &&
        !window.confirm(
          `${esito.chiusura ? 'In quel momento risulti chiusa' : 'Il nuovo orario è fuori dal tuo orario di lavoro'}. Spostare comunque?`,
        )
      ) {
        return annulla()
      }
      const { error } = await supabase()
        .from('appuntamenti')
        .update({ inizio: versoIso(inizio), fine: versoIso(fine) })
        .eq('id', id)
      if (error) {
        annulla()
        avvisi.errore(messaggioErrore(error))
        return
      }
      avvisi.successo(`Spostato alle ${oraBreve(inizio)}`)
      void caricaPeriodo()
    },
    [appuntamenti, orari, chiusure, avvisi, caricaPeriodo],
  )

  return (
    <>
      <TitoloPagina
        titolo="Agenda"
        azioni={
          <Pulsante
            onClick={() => {
              const ora = adesso()
              const prossimoQuarto = ora.set({ minute: Math.ceil(ora.minute / 15) * 15, second: 0, millisecond: 0 })
              setApertura({ tipo: 'nuovo', inizio: prossimoQuarto, fine: null })
            }}
          >
            + Nuovo
          </Pulsante>
        }
      />

      {orari === null ? (
        <Caricamento />
      ) : (
        <>
          <Calendario
            vistaIniziale={vistaIniziale}
            eventi={eventi}
            orari={orari}
            oraMinima={oraMinima}
            oraMassima={oraMassima}
            onIntervallo={(inizio, fine) =>
              setIntervallo((p) => (p && p.inizio.equals(inizio) && p.fine.equals(fine) ? p : { inizio, fine }))
            }
            onNuovo={(inizio, fine) => setApertura({ tipo: 'nuovo', inizio, fine })}
            onApri={(id) => {
              const a = appuntamenti.find((x) => x.id === id)
              if (a) setApertura({ tipo: 'modifica', appuntamento: a })
            }}
            onSposta={(id, i, f, annulla) => void onSposta(id, i, f, annulla)}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-stone-600">
            <Legenda />
            <label className="flex items-center gap-2">
              <Interruttore attivo={mostraAnnullati} onCambia={setMostraAnnullati} etichetta="Mostra disdetti e rifiutati" />
              Mostra disdetti e rifiutati
            </label>
          </div>
          {orari.length === 0 ? (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              Non hai ancora impostato l&apos;orario di lavoro: vai in <strong>Orari</strong> per inserirlo.
            </p>
          ) : null}
        </>
      )}

      {apertura ? (
        <ModuloAppuntamento
          apertura={apertura}
          servizi={servizi}
          orari={orari ?? []}
          onChiudi={() => setApertura(null)}
          onSalvato={() => {
            setApertura(null)
            void caricaPeriodo()
          }}
        />
      ) : null}
    </>
  )
}

function Legenda() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {(['confermato', 'in_attesa', 'completato'] as const).map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm" style={{ background: STATI[s].calendario }} />
          {STATI[s].testo}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="inline-block size-3 rounded-sm bg-stone-300" />
        Chiuso
      </li>
    </ul>
  )
}
