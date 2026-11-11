'use client'

import type { ChiusuraDb } from '@ilenia/shared/tipi-db'
import { dataBreve, dataLunga, daDataOra, daIso, minutiDaOra, nomeGiorno, oraBreve, versoIso, adesso } from '@ilenia/shared/tempo'
import { useCallback, useEffect, useState } from 'react'
import { useAvvisi } from '@/components/Avvisi'
import { useConferma } from '@/components/Conferma'
import { Finestra } from '@/components/Finestra'
import { Caricamento, Campo, Interruttore, Pulsante, Scheda, TitoloPagina, Voce, Vuoto } from '@/components/ui'
import { messaggioErrore } from '@/lib/errori'
import { useOperatrice } from '@/lib/sessione'
import { supabase } from '@/lib/supabase'

type FasciaModulo = { inizio: string; fine: string }
type Settimana = Record<number, FasciaModulo[]>

const GIORNI = [1, 2, 3, 4, 5, 6, 7] as const

function settimanaVuota(): Settimana {
  return { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }
}

/** Controlla le fasce di un giorno; restituisce il problema o null. */
function problemaGiorno(fasce: FasciaModulo[]): string | null {
  const ordinate = fasce
    .map((f) => ({ i: minutiDaOraSicuro(f.inizio), f: minutiDaOraSicuro(f.fine) }))
    .sort((a, b) => a.i - b.i)
  for (const x of ordinate) {
    if (Number.isNaN(x.i) || Number.isNaN(x.f)) return 'Orario non valido'
    if (x.f <= x.i) return 'La fine deve essere dopo l\'inizio'
  }
  for (let k = 1; k < ordinate.length; k++) {
    if (ordinate[k]!.i < ordinate[k - 1]!.f) return 'Due fasce si sovrappongono'
  }
  return null
}

function minutiDaOraSicuro(ora: string): number {
  try {
    return minutiDaOra(ora)
  } catch {
    return Number.NaN
  }
}

export default function PaginaOrari() {
  return (
    <>
      <TitoloPagina titolo="Orari" sottotitolo="Quando lavori: il bot proporrà solo orari dentro queste fasce." />
      <div className="flex flex-col gap-6">
        <OrarioSettimanale />
        <Chiusure />
      </div>
    </>
  )
}

// ---------------------------------------------------------------------
// Orario settimanale
// ---------------------------------------------------------------------
function OrarioSettimanale() {
  const avvisi = useAvvisi()
  const [settimana, setSettimana] = useState<Settimana | null>(null)
  const [modificato, setModificato] = useState(false)
  const [inCorso, setInCorso] = useState(false)

  const carica = useCallback(async () => {
    const { data, error } = await supabase().from('orari_settimanali').select('*').order('giorno').order('ora_inizio')
    if (error) {
      avvisi.errore(messaggioErrore(error))
      return
    }
    const s = settimanaVuota()
    for (const o of data) s[o.giorno]!.push({ inizio: o.ora_inizio.slice(0, 5), fine: o.ora_fine.slice(0, 5) })
    setSettimana(s)
    setModificato(false)
  }, [avvisi])

  useEffect(() => {
    void carica()
  }, [carica])

  function aggiorna(giorno: number, fasce: FasciaModulo[]) {
    setSettimana((s) => (s ? { ...s, [giorno]: fasce } : s))
    setModificato(true)
  }

  async function salva() {
    if (!settimana) return
    const problemi = GIORNI.map((g) => [g, problemaGiorno(settimana[g]!)] as const).filter(([, p]) => p)
    if (problemi.length > 0) {
      avvisi.errore(`${nomeGiorno(problemi[0]![0])}: ${problemi[0]![1]}`)
      return
    }
    setInCorso(true)
    const fasce = GIORNI.flatMap((g) =>
      settimana[g]!.map((f) => ({ giorno: g, ora_inizio: f.inizio, ora_fine: f.fine })),
    )
    const { error } = await supabase().rpc('salva_orari_settimanali', { fasce })
    setInCorso(false)
    if (error) {
      avvisi.errore(messaggioErrore(error))
      return
    }
    avvisi.successo('Orario salvato')
    void carica()
  }

  if (!settimana) return <Caricamento />

  return (
    <Scheda>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Settimana tipo</h2>
          <p className="text-sm text-stone-500">Puoi avere più fasce nello stesso giorno (es. mattina e pomeriggio).</p>
        </div>
        <Pulsante onClick={() => void salva()} inCorso={inCorso} disabled={!modificato}>
          Salva orario
        </Pulsante>
      </div>

      <ul className="divide-y divide-stone-100">
        {GIORNI.map((g) => {
          const fasce = settimana[g]!
          const problema = problemaGiorno(fasce)
          const precedente = g > 1 ? settimana[g - 1]! : []
          return (
            <li key={g} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
              <p className="w-28 shrink-0 pt-2 font-medium capitalize text-stone-800">{nomeGiorno(g)}</p>
              <div className="flex flex-1 flex-col gap-2">
                {fasce.length === 0 ? <p className="pt-2 text-sm text-stone-400">Chiuso</p> : null}
                {fasce.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-32">
                      <Campo
                        type="time"
                        step={300}
                        aria-label={`${nomeGiorno(g)} fascia ${i + 1} inizio`}
                        value={f.inizio}
                        onChange={(e) => aggiorna(g, fasce.map((x, k) => (k === i ? { ...x, inizio: e.target.value } : x)))}
                      />
                    </div>
                    <span className="text-stone-400">–</span>
                    <div className="w-32">
                      <Campo
                        type="time"
                        step={300}
                        aria-label={`${nomeGiorno(g)} fascia ${i + 1} fine`}
                        value={f.fine}
                        onChange={(e) => aggiorna(g, fasce.map((x, k) => (k === i ? { ...x, fine: e.target.value } : x)))}
                      />
                    </div>
                    <button
                      type="button"
                      aria-label="Rimuovi fascia"
                      onClick={() => aggiorna(g, fasce.filter((_, k) => k !== i))}
                      className="rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {problema ? <p className="text-sm text-red-700">{problema}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Pulsante
                    piccolo
                    variante="fantasma"
                    onClick={() => {
                      const ultima = fasce.at(-1)
                      const nuova = ultima
                        ? { inizio: ultima.fine, fine: ultima.fine < '19:00' ? '19:00' : '20:00' }
                        : { inizio: '09:00', fine: '13:00' }
                      aggiorna(g, [...fasce, nuova])
                    }}
                  >
                    + Aggiungi fascia
                  </Pulsante>
                  {fasce.length === 0 && precedente.length > 0 ? (
                    <Pulsante piccolo variante="fantasma" onClick={() => aggiorna(g, precedente.map((f) => ({ ...f })))}>
                      Come {nomeGiorno(g - 1)}
                    </Pulsante>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </Scheda>
  )
}

// ---------------------------------------------------------------------
// Chiusure straordinarie e ferie
// ---------------------------------------------------------------------
type ModuloChiusura = {
  giornataIntera: boolean
  dal: string
  oraDal: string
  al: string
  oraAl: string
  motivo: string
}

type AppuntamentoCoinvolto = { id: string; inizio: string; cliente: string }

function descriviChiusura(c: ChiusuraDb): string {
  const i = daIso(c.inizio)
  const f = daIso(c.fine)
  const interaInizio = i.hour === 0 && i.minute === 0
  const interaFine = f.hour === 0 && f.minute === 0
  if (interaInizio && interaFine) {
    const ultimo = f.minus({ days: 1 })
    return ultimo.hasSame(i, 'day') ? dataLunga(i) : `dal ${dataBreve(i)} al ${dataBreve(ultimo)}`
  }
  if (i.hasSame(f, 'day')) return `${dataLunga(i)}, ${oraBreve(i)}–${oraBreve(f)}`
  return `dal ${dataBreve(i)} ${oraBreve(i)} al ${dataBreve(f)} ${oraBreve(f)}`
}

function Chiusure() {
  const operatrice = useOperatrice()
  const avvisi = useAvvisi()
  const conferma = useConferma()
  const [chiusure, setChiusure] = useState<ChiusuraDb[] | null>(null)
  const [modulo, setModulo] = useState<ModuloChiusura | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [coinvolti, setCoinvolti] = useState<AppuntamentoCoinvolto[] | null>(null)

  const carica = useCallback(async () => {
    const { data, error } = await supabase()
      .from('chiusure')
      .select('*')
      .gte('fine', versoIso(adesso()))
      .order('inizio')
    if (error) avvisi.errore(messaggioErrore(error))
    else setChiusure(data)
  }, [avvisi])

  useEffect(() => {
    void carica()
  }, [carica])

  function apri() {
    const oggi = adesso().toISODate() ?? ''
    setErrore(null)
    setModulo({ giornataIntera: true, dal: oggi, oraDal: '09:00', al: oggi, oraAl: '13:00', motivo: '' })
  }

  async function salva(e: React.FormEvent) {
    e.preventDefault()
    if (!modulo) return
    let inizio, fine
    try {
      inizio = daDataOra(modulo.dal, modulo.giornataIntera ? '00:00' : modulo.oraDal)
      fine = modulo.giornataIntera ? daDataOra(modulo.al, '00:00').plus({ days: 1 }) : daDataOra(modulo.al, modulo.oraAl)
    } catch {
      setErrore('Date non valide.')
      return
    }
    if (fine <= inizio) {
      setErrore('La fine deve essere dopo l\'inizio.')
      return
    }
    setInCorso(true)
    const sb = supabase()
    const { error } = await sb.from('chiusure').insert({
      operatrice_id: operatrice.id,
      inizio: versoIso(inizio),
      fine: versoIso(fine),
      motivo: modulo.motivo.trim() || null,
    })
    if (error) {
      setInCorso(false)
      setErrore(messaggioErrore(error))
      return
    }
    // ci sono appuntamenti già presi in quel periodo?
    const { data: app } = await sb
      .from('appuntamenti')
      .select('id, inizio, clienti(nome, telefono)')
      .in('stato', ['in_attesa', 'confermato'])
      .lt('inizio', versoIso(fine))
      .gt('fine', versoIso(inizio))
      .order('inizio')
    setInCorso(false)
    setModulo(null)
    avvisi.successo('Chiusura aggiunta')
    if (app && app.length > 0) {
      setCoinvolti(
        app.map((a) => ({
          id: a.id,
          inizio: a.inizio,
          cliente: a.clienti?.nome ?? a.clienti?.telefono ?? 'Cliente',
        })),
      )
    }
    void carica()
  }

  async function elimina(c: ChiusuraDb) {
    if (!(await conferma({ titolo: 'Eliminare la chiusura?', messaggio: descriviChiusura(c), conferma: 'Elimina', pericolo: true })))
      return
    const { error } = await supabase().from('chiusure').delete().eq('id', c.id)
    if (error) avvisi.errore(messaggioErrore(error))
    else {
      avvisi.successo('Chiusura eliminata')
      void carica()
    }
  }

  return (
    <Scheda>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Chiusure e ferie</h2>
          <p className="text-sm text-stone-500">Giorni o ore in cui non lavori, oltre all&apos;orario settimanale.</p>
        </div>
        <Pulsante variante="secondario" onClick={apri}>
          + Aggiungi chiusura
        </Pulsante>
      </div>

      {coinvolti ? (
        <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="font-medium">
            Attenzione: in quel periodo {coinvolti.length === 1 ? 'c\'è già 1 appuntamento' : `ci sono già ${coinvolti.length} appuntamenti`}.
            Ricordati di spostarli o disdirli dall&apos;agenda.
          </p>
          <ul className="mt-1 list-disc pl-5">
            {coinvolti.map((a) => (
              <li key={a.id}>
                {dataBreve(daIso(a.inizio))} {oraBreve(daIso(a.inizio))} – {a.cliente}
              </li>
            ))}
          </ul>
          <button type="button" className="mt-2 text-xs underline" onClick={() => setCoinvolti(null)}>
            Ho capito
          </button>
        </div>
      ) : null}

      {chiusure === null ? (
        <Caricamento />
      ) : chiusure.length === 0 ? (
        <Vuoto titolo="Nessuna chiusura in programma" />
      ) : (
        <ul className="divide-y divide-stone-100">
          {chiusure.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="font-medium text-stone-800 first-letter:uppercase">{descriviChiusura(c)}</p>
                {c.motivo ? <p className="truncate text-sm text-stone-500">{c.motivo}</p> : null}
              </div>
              <Pulsante piccolo variante="pericolo" onClick={() => void elimina(c)}>
                Elimina
              </Pulsante>
            </li>
          ))}
        </ul>
      )}

      <Finestra
        aperta={modulo !== null}
        onChiudi={() => setModulo(null)}
        titolo="Nuova chiusura"
        piede={
          <>
            <Pulsante variante="secondario" onClick={() => setModulo(null)}>
              Annulla
            </Pulsante>
            <Pulsante type="submit" form="modulo-chiusura" inCorso={inCorso}>
              Salva
            </Pulsante>
          </>
        }
      >
        {modulo ? (
          <form id="modulo-chiusura" onSubmit={salva} className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2.5">
              <span className="text-sm font-medium text-stone-800">Giornate intere</span>
              <Interruttore
                attivo={modulo.giornataIntera}
                etichetta="Giornate intere"
                onCambia={(v) => setModulo({ ...modulo, giornataIntera: v })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Voce etichetta="Dal">
                {(id) => (
                  <Campo
                    id={id}
                    type="date"
                    value={modulo.dal}
                    onChange={(e) =>
                      setModulo({
                        ...modulo,
                        dal: e.target.value,
                        al: modulo.al < e.target.value ? e.target.value : modulo.al,
                      })
                    }
                  />
                )}
              </Voce>
              <Voce etichetta={modulo.giornataIntera ? 'Al (compreso)' : 'Al'}>
                {(id) => (
                  <Campo id={id} type="date" min={modulo.dal} value={modulo.al} onChange={(e) => setModulo({ ...modulo, al: e.target.value })} />
                )}
              </Voce>
              {!modulo.giornataIntera ? (
                <>
                  <Voce etichetta="Dalle ore">
                    {(id) => (
                      <Campo id={id} type="time" step={300} value={modulo.oraDal} onChange={(e) => setModulo({ ...modulo, oraDal: e.target.value })} />
                    )}
                  </Voce>
                  <Voce etichetta="Alle ore">
                    {(id) => (
                      <Campo id={id} type="time" step={300} value={modulo.oraAl} onChange={(e) => setModulo({ ...modulo, oraAl: e.target.value })} />
                    )}
                  </Voce>
                </>
              ) : null}
            </div>
            <Voce etichetta="Motivo (facoltativo)" aiuto="Es. Ferie, Corso di aggiornamento. Le clienti non lo vedono.">
              {(id) => (
                <Campo id={id} maxLength={200} value={modulo.motivo} onChange={(e) => setModulo({ ...modulo, motivo: e.target.value })} />
              )}
            </Voce>
            {errore ? <p className="text-sm text-red-700">{errore}</p> : null}
          </form>
        ) : null}
      </Finestra>
    </Scheda>
  )
}
