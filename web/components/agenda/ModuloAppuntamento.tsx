'use client'

import { verificaOrario, type Fascia } from '@ilenia/shared/orari'
import { dataIso, dataLunga, daDataOra, daIso, durataLeggibile, oraBreve, versoIso } from '@ilenia/shared/tempo'
import type { Appuntamento, Cliente, Servizio, StatoAppuntamento } from '@ilenia/shared/tipi-db'
import type { DateTime } from 'luxon'
import { useState } from 'react'
import { messaggioErrore } from '@/lib/errori'
import { useOperatrice } from '@/lib/sessione'
import { STATI } from '@/lib/stati'
import { supabase } from '@/lib/supabase'
import { useAvvisi } from '../Avvisi'
import { nomeCliente, SelettoreCliente } from '../clienti'
import { Finestra } from '../Finestra'
import { AreaTesto, Campo, Etichetta, Pulsante, Scelta, Voce } from '../ui'

export type AppuntamentoCompleto = Appuntamento & {
  clienti: Cliente | null
  servizi: Pick<Servizio, 'nome' | 'durata_minuti'> | null
}

export type AperturaModulo =
  | { tipo: 'nuovo'; inizio: DateTime; fine: DateTime | null }
  | { tipo: 'modifica'; appuntamento: AppuntamentoCompleto }

type Stato = {
  cliente: Cliente | null
  servizioId: string
  data: string
  ora: string
  durata: string
  stato: StatoAppuntamento
  note: string
}

function statoIniziale(a: AperturaModulo, servizi: Servizio[]): Stato {
  if (a.tipo === 'modifica') {
    const x = a.appuntamento
    const i = daIso(x.inizio)
    return {
      cliente: x.clienti,
      servizioId: x.servizio_id ?? '',
      data: dataIso(i),
      ora: oraBreve(i),
      durata: String(Math.round(daIso(x.fine).diff(i, 'minutes').minutes)),
      stato: x.stato,
      note: x.note ?? '',
    }
  }
  const durata = a.fine ? Math.round(a.fine.diff(a.inizio, 'minutes').minutes) : (servizi.find((s) => s.attivo)?.durata_minuti ?? 30)
  return {
    cliente: null,
    servizioId: '',
    data: dataIso(a.inizio),
    ora: oraBreve(a.inizio),
    durata: String(durata),
    stato: 'confermato',
    note: '',
  }
}

export function ModuloAppuntamento({
  apertura,
  servizi,
  orari,
  onChiudi,
  onSalvato,
}: {
  apertura: AperturaModulo
  servizi: Servizio[]
  orari: readonly Fascia[]
  onChiudi: () => void
  onSalvato: () => void
}) {
  const operatrice = useOperatrice()
  const avvisi = useAvvisi()
  const [s, setS] = useState<Stato>(() => statoIniziale(apertura, servizi))
  const [errore, setErrore] = useState<string | null>(null)
  const [avvertenza, setAvvertenza] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const esistente = apertura.tipo === 'modifica' ? apertura.appuntamento : null
  const serviziScelta = servizi.filter((x) => x.attivo || x.id === s.servizioId)

  function aggiorna(parziale: Partial<Stato>) {
    setS((p) => ({ ...p, ...parziale }))
    setAvvertenza(null)
    setErrore(null)
  }

  async function salva(e: { preventDefault: () => void }, forza = false) {
    e.preventDefault()
    setErrore(null)
    if (!s.cliente) {
      setErrore('Scegli la cliente.')
      return
    }
    const durata = Number(s.durata)
    if (!Number.isInteger(durata) || durata < 5 || durata > 600) {
      setErrore('Durata tra 5 e 600 minuti.')
      return
    }
    let inizio: DateTime
    try {
      inizio = daDataOra(s.data, s.ora)
    } catch {
      setErrore('Data o ora non valida.')
      return
    }
    const fine = inizio.plus({ minutes: durata })
    const sb = supabase()

    // fuori orario o in un giorno di chiusura? Avviso, ma si può forzare
    if (!forza && (s.stato === 'confermato' || s.stato === 'in_attesa')) {
      const { data: chiusure } = await sb
        .from('chiusure')
        .select('inizio, fine, motivo')
        .lt('inizio', versoIso(fine))
        .gt('fine', versoIso(inizio))
      const esito = verificaOrario(inizio, fine, orari, chiusure ?? [])
      if (esito.chiusura || esito.fuoriOrario) {
        setAvvertenza(
          esito.chiusura
            ? `In quel momento risulti chiusa${esito.chiusura.motivo ? ` (${esito.chiusura.motivo})` : ''}.`
            : 'L\'appuntamento è fuori dal tuo orario di lavoro.',
        )
        return
      }
    }

    const valori = {
      cliente_id: s.cliente.id,
      servizio_id: s.servizioId || null,
      inizio: versoIso(inizio),
      fine: versoIso(fine),
      stato: s.stato,
      note: s.note.trim() || null,
    }
    setInCorso(true)
    const { error } = esistente
      ? await sb.from('appuntamenti').update(valori).eq('id', esistente.id)
      : await sb.from('appuntamenti').insert({ ...valori, operatrice_id: operatrice.id, origine: 'pannello' })
    setInCorso(false)
    if (error) {
      setErrore(messaggioErrore(error))
      return
    }
    avvisi.successo(esistente ? 'Appuntamento aggiornato' : 'Appuntamento creato')
    onSalvato()
  }

  async function cambiaStato(nuovo: StatoAppuntamento, domanda: string) {
    if (!esistente || !window.confirm(domanda)) return
    setInCorso(true)
    const { error } = await supabase().from('appuntamenti').update({ stato: nuovo }).eq('id', esistente.id)
    setInCorso(false)
    if (error) {
      setErrore(messaggioErrore(error))
      return
    }
    avvisi.successo(nuovo === 'disdetto' ? 'Appuntamento disdetto' : 'Stato aggiornato')
    onSalvato()
  }

  async function elimina() {
    if (!esistente || !window.confirm('Eliminare definitivamente l\'appuntamento? Non resterà nello storico.')) return
    setInCorso(true)
    const { error } = await supabase().from('appuntamenti').delete().eq('id', esistente.id)
    setInCorso(false)
    if (error) {
      setErrore(messaggioErrore(error))
      return
    }
    avvisi.successo('Appuntamento eliminato')
    onSalvato()
  }

  const attivo = s.stato === 'confermato' || s.stato === 'in_attesa'
  const statiScelta: StatoAppuntamento[] =
    esistente && !['confermato', 'in_attesa', 'completato'].includes(esistente.stato)
      ? ['confermato', 'in_attesa', 'completato', esistente.stato]
      : ['confermato', 'in_attesa', 'completato']

  return (
    <Finestra
      aperta
      onChiudi={onChiudi}
      titolo={esistente ? 'Appuntamento' : 'Nuovo appuntamento'}
      piede={
        <>
          {esistente && attivo ? (
            <Pulsante
              variante="pericolo"
              className="mr-auto"
              onClick={() => void cambiaStato('disdetto', `Disdire l'appuntamento di ${nomeCliente(esistente.clienti)}?`)}
            >
              Disdici
            </Pulsante>
          ) : esistente ? (
            <Pulsante variante="pericolo" className="mr-auto" onClick={() => void elimina()}>
              Elimina
            </Pulsante>
          ) : null}
          <Pulsante variante="secondario" onClick={onChiudi}>
            Annulla
          </Pulsante>
          {avvertenza ? (
            <Pulsante onClick={(e) => void salva(e, true)} inCorso={inCorso}>
              Salva comunque
            </Pulsante>
          ) : (
            <Pulsante type="submit" form="modulo-appuntamento" inCorso={inCorso}>
              Salva
            </Pulsante>
          )}
        </>
      }
    >
      <form id="modulo-appuntamento" onSubmit={(e) => void salva(e)} className="flex flex-col gap-4">
        {esistente ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-stone-500">
            <Etichetta colore={STATI[esistente.stato].colore}>{STATI[esistente.stato].testo}</Etichetta>
            <span>
              {esistente.origine === 'whatsapp' ? 'Prenotato su WhatsApp' : esistente.origine === 'anticipo' ? 'Anticipato dalla lista d\'attesa' : 'Inserito dal pannello'}
            </span>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">Cliente</span>
          <SelettoreCliente valore={s.cliente} onCambia={(c) => aggiorna({ cliente: c })} />
        </div>

        <Voce etichetta="Servizio">
          {(id) => (
            <Scelta
              id={id}
              value={s.servizioId}
              onChange={(e) => {
                const serv = servizi.find((x) => x.id === e.target.value)
                aggiorna({ servizioId: e.target.value, ...(serv ? { durata: String(serv.durata_minuti) } : {}) })
              }}
            >
              <option value="">— Nessun servizio —</option>
              {serviziScelta.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome} ({durataLeggibile(x.durata_minuti)})
                </option>
              ))}
            </Scelta>
          )}
        </Voce>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Voce etichetta="Giorno" className="col-span-2 sm:col-span-1">
            {(id) => <Campo id={id} type="date" value={s.data} onChange={(e) => aggiorna({ data: e.target.value })} required />}
          </Voce>
          <Voce etichetta="Ora">
            {(id) => <Campo id={id} type="time" step={300} value={s.ora} onChange={(e) => aggiorna({ ora: e.target.value })} required />}
          </Voce>
          <Voce etichetta="Durata (min)">
            {(id) => (
              <Campo
                id={id}
                type="number"
                inputMode="numeric"
                min={5}
                max={600}
                step={5}
                value={s.durata}
                onChange={(e) => aggiorna({ durata: e.target.value })}
                required
              />
            )}
          </Voce>
        </div>
        <RiepilogoOrario data={s.data} ora={s.ora} durata={s.durata} />

        <Voce etichetta="Stato">
          {(id) => (
            <Scelta id={id} value={s.stato} onChange={(e) => aggiorna({ stato: e.target.value as StatoAppuntamento })}>
              {statiScelta.map((st) => (
                <option key={st} value={st}>
                  {STATI[st].testo}
                </option>
              ))}
            </Scelta>
          )}
        </Voce>

        <Voce etichetta="Note (facoltative)">
          {(id) => <AreaTesto id={id} maxLength={1000} value={s.note} onChange={(e) => aggiorna({ note: e.target.value })} />}
        </Voce>

        {avvertenza ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            {avvertenza} Vuoi salvarlo comunque?
          </p>
        ) : null}
        {errore ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{errore}</p> : null}
        {esistente && attivo ? (
          <Pulsante piccolo variante="fantasma" className="self-start" onClick={() => void elimina()}>
            Elimina definitivamente
          </Pulsante>
        ) : null}
      </form>
    </Finestra>
  )
}

function RiepilogoOrario({ data, ora, durata }: { data: string; ora: string; durata: string }) {
  try {
    const i = daDataOra(data, ora)
    const n = Number(durata)
    if (!Number.isFinite(n) || n <= 0) return null
    const f = i.plus({ minutes: n })
    return (
      <p className="-mt-2 text-sm text-stone-500 first-letter:uppercase">
        {dataLunga(i)}, dalle {oraBreve(i)} alle {oraBreve(f)}
      </p>
    )
  } catch {
    return null
  }
}
