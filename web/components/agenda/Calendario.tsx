'use client'

/**
 * Agenda giorno/settimana basata su FullCalendar v7 (licenza MIT).
 * Caricato solo nel browser (next/dynamic con ssr: false).
 */
import FullCalendar, { type CalendarRef, type EventInput } from '@fullcalendar/react'
import interactionPlugin from '@fullcalendar/react/interaction'
import itLocale from '@fullcalendar/react/locales/it'
import classicTheme from '@fullcalendar/react/themes/classic'
import timeGridPlugin from '@fullcalendar/react/timegrid'
import type { Fascia } from '@ilenia/shared/orari'
import { daIso, FUSO } from '@ilenia/shared/tempo'
import type { DateTime } from 'luxon'
import { useMemo, useRef, useState } from 'react'
import { cx, Pulsante } from '../ui'
import '@fullcalendar/react/skeleton.css'
import '@fullcalendar/react/themes/classic/theme.css'
import '@fullcalendar/react/themes/classic/palette.css'

export type Vista = 'timeGridDay' | 'timeGridWeek'

export type PropsCalendario = {
  vistaIniziale: Vista
  eventi: EventInput[]
  orari: readonly Fascia[]
  oraMinima: string
  oraMassima: string
  onIntervallo: (inizio: DateTime, fine: DateTime, vista: Vista) => void
  /** clic su uno spazio vuoto (o trascinamento per scegliere la durata) */
  onNuovo: (inizio: DateTime, fine: DateTime | null) => void
  onApri: (id: string) => void
  /** trascinamento o ridimensionamento di un appuntamento */
  onSposta: (id: string, inizio: DateTime, fine: DateTime, annulla: () => void) => void
}

const MINUTI_SLOT = 15

export default function Calendario(props: PropsCalendario) {
  const ref = useRef<CalendarRef>(null)
  const [titolo, setTitolo] = useState('')
  const [vista, setVista] = useState<Vista>(props.vistaIniziale)

  const businessHours = useMemo(
    () =>
      props.orari.map((f) => ({
        daysOfWeek: [f.giorno % 7], // FullCalendar: 0 = domenica
        startTime: f.ora_inizio.slice(0, 5),
        endTime: f.ora_fine.slice(0, 5),
      })),
    [props.orari],
  )

  const api = () => ref.current?.getApi()

  function cambiaVista(v: Vista) {
    setVista(v)
    api()?.changeView(v)
  }

  return (
    <div className="calendario">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Pulsante piccolo variante="secondario" aria-label="Periodo precedente" onClick={() => api()?.prev()}>
            ‹
          </Pulsante>
          <Pulsante piccolo variante="secondario" onClick={() => api()?.today()}>
            Oggi
          </Pulsante>
          <Pulsante piccolo variante="secondario" aria-label="Periodo successivo" onClick={() => api()?.next()}>
            ›
          </Pulsante>
        </div>
        <h2 className="order-first w-full truncate text-base font-semibold text-stone-800 first-letter:uppercase sm:order-none sm:w-auto sm:min-w-0 sm:flex-1 sm:text-lg">
          {titolo}
        </h2>
        <div className="ml-auto flex rounded-xl bg-stone-100 p-1 sm:ml-0" role="group" aria-label="Vista">
          {(
            [
              ['timeGridDay', 'Giorno'],
              ['timeGridWeek', 'Settimana'],
            ] as const
          ).map(([v, etichetta]) => (
            <button
              key={v}
              type="button"
              aria-pressed={vista === v}
              onClick={() => cambiaVista(v)}
              className={cx(
                'rounded-lg px-3 py-1 text-sm font-medium',
                vista === v ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600',
              )}
            >
              {etichetta}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-1 ring-1 ring-stone-200 sm:p-2">
        <FullCalendar
          ref={ref}
          plugins={[timeGridPlugin, interactionPlugin, classicTheme]}
          initialView={props.vistaIniziale}
          timeZone={FUSO}
          locale={itLocale}
          firstDay={1}
          headerToolbar={false}
          height="auto"
          allDaySlot={false}
          nowIndicator
          slotDuration={`00:${MINUTI_SLOT}:00`}
          snapDuration="00:05:00"
          slotMinTime={props.oraMinima}
          slotMaxTime={props.oraMassima}
          slotHeaderFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          dayHeaderFormat={vista === 'timeGridWeek' ? { weekday: 'short', day: 'numeric' } : { weekday: 'long', day: 'numeric', month: 'long' }}
          businessHours={businessHours}
          editable
          selectable
          selectMirror
          longPressDelay={350}
          eventLongPressDelay={350}
          selectLongPressDelay={350}
          events={props.eventi}
          datesSet={(info) => {
            const inizio = daIso(info.startStr)
            const fine = daIso(info.endStr)
            const v = info.view.type as Vista
            setVista(v)
            setTitolo(
              v === 'timeGridDay'
                ? inizio.toFormat('cccc d LLLL yyyy')
                : inizio.hasSame(fine.minus({ days: 1 }), 'month')
                  ? `${inizio.toFormat('d')}–${fine.minus({ days: 1 }).toFormat('d LLLL yyyy')}`
                  : `${inizio.toFormat('d LLL')} – ${fine.minus({ days: 1 }).toFormat('d LLL yyyy')}`,
            )
            props.onIntervallo(inizio, fine, v)
          }}
          dateClick={(info) => props.onNuovo(daIso(info.dateStr), null)}
          select={(info) => {
            const inizio = daIso(info.startStr)
            const fine = daIso(info.endStr)
            // un solo slot = semplice clic, già gestito da dateClick
            if (fine.diff(inizio, 'minutes').minutes > MINUTI_SLOT) props.onNuovo(inizio, fine)
            api()?.unselect()
          }}
          eventClick={(info) => {
            if (info.event.display !== 'background') props.onApri(info.event.id)
          }}
          eventDrop={(info) => props.onSposta(info.event.id, daIso(info.event.startStr), daIso(info.event.endStr), info.revert)}
          eventResize={(info) => props.onSposta(info.event.id, daIso(info.event.startStr), daIso(info.event.endStr), info.revert)}
        />
      </div>
    </div>
  )
}
