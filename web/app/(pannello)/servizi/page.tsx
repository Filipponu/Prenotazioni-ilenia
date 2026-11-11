'use client'

import type { Servizio } from '@ilenia/shared/tipi-db'
import { durataLeggibile, prezzoLeggibile } from '@ilenia/shared/tempo'
import { useCallback, useEffect, useState } from 'react'
import { useAvvisi } from '@/components/Avvisi'
import { Finestra } from '@/components/Finestra'
import {
  Caricamento,
  Campo,
  Etichetta,
  Interruttore,
  Pulsante,
  Scheda,
  TitoloPagina,
  Voce,
  Vuoto,
} from '@/components/ui'
import { messaggioErrore } from '@/lib/errori'
import { useOperatrice } from '@/lib/sessione'
import { supabase } from '@/lib/supabase'

/** Su WhatsApp, nelle liste, si vedono al massimo 24 caratteri del titolo */
const LIMITE_WHATSAPP = 24

type Modulo = { id: string | null; nome: string; durata: string; prezzo: string; attivo: boolean }

const moduloVuoto: Modulo = { id: null, nome: '', durata: '30', prezzo: '', attivo: true }

function leggiPrezzo(testo: string): number | null | 'errore' {
  const t = testo.trim().replace('€', '').replace(',', '.').trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 'errore'
}

export default function PaginaServizi() {
  const operatrice = useOperatrice()
  const avvisi = useAvvisi()
  const [servizi, setServizi] = useState<Servizio[] | null>(null)
  const [modulo, setModulo] = useState<Modulo | null>(null)
  const [errori, setErrori] = useState<Partial<Record<keyof Modulo, string>>>({})
  const [inCorso, setInCorso] = useState(false)

  const carica = useCallback(async () => {
    const { data, error } = await supabase()
      .from('servizi')
      .select('*')
      .order('ordine')
      .order('nome')
    if (error) avvisi.errore(messaggioErrore(error))
    else setServizi(data)
  }, [avvisi])

  useEffect(() => {
    void carica()
  }, [carica])

  async function salva(e: React.FormEvent) {
    e.preventDefault()
    if (!modulo) return
    const nuoviErrori: typeof errori = {}
    const nome = modulo.nome.trim()
    const durata = Number(modulo.durata)
    const prezzo = leggiPrezzo(modulo.prezzo)
    if (!nome) nuoviErrori.nome = 'Scrivi il nome del servizio.'
    if (!Number.isInteger(durata) || durata < 5 || durata > 600) nuoviErrori.durata = 'Durata tra 5 e 600 minuti.'
    if (prezzo === 'errore') nuoviErrori.prezzo = 'Prezzo non valido (es. 25 oppure 22,50).'
    setErrori(nuoviErrori)
    if (Object.keys(nuoviErrori).length > 0 || prezzo === 'errore') return

    setInCorso(true)
    const valori = { nome, durata_minuti: durata, prezzo, attivo: modulo.attivo }
    const sb = supabase()
    const { error } = modulo.id
      ? await sb.from('servizi').update(valori).eq('id', modulo.id)
      : await sb.from('servizi').insert({
          ...valori,
          operatrice_id: operatrice.id,
          ordine: (servizi?.length ?? 0) + 1,
        })
    setInCorso(false)
    if (error) {
      avvisi.errore(messaggioErrore(error, 'servizio'))
      return
    }
    avvisi.successo(modulo.id ? 'Servizio aggiornato' : 'Servizio aggiunto')
    setModulo(null)
    void carica()
  }

  async function cambiaAttivo(s: Servizio, attivo: boolean) {
    setServizi((lista) => lista?.map((x) => (x.id === s.id ? { ...x, attivo } : x)) ?? null)
    const { error } = await supabase().from('servizi').update({ attivo }).eq('id', s.id)
    if (error) {
      avvisi.errore(messaggioErrore(error))
      void carica()
    }
  }

  async function sposta(indice: number, verso: -1 | 1) {
    if (!servizi) return
    const altro = indice + verso
    if (altro < 0 || altro >= servizi.length) return
    const nuovi = [...servizi]
    ;[nuovi[indice], nuovi[altro]] = [nuovi[altro]!, nuovi[indice]!]
    const riordinati = nuovi.map((s, i) => ({ ...s, ordine: i + 1 }))
    setServizi(riordinati)
    const sb = supabase()
    const risultati = await Promise.all(
      [riordinati[indice]!, riordinati[altro]!].map((s) =>
        sb.from('servizi').update({ ordine: s.ordine }).eq('id', s.id),
      ),
    )
    const errore = risultati.find((r) => r.error)?.error
    if (errore) {
      avvisi.errore(messaggioErrore(errore))
      void carica()
    }
  }

  async function elimina(s: Servizio) {
    if (!window.confirm(`Eliminare il servizio "${s.nome}"?`)) return
    const { error } = await supabase().from('servizi').delete().eq('id', s.id)
    if (error) {
      if (error.code === '23503') {
        if (window.confirm(`"${s.nome}" è usato in alcuni appuntamenti e non si può eliminare. Vuoi disattivarlo?`)) {
          await cambiaAttivo(s, false)
          avvisi.successo('Servizio disattivato')
        }
      } else {
        avvisi.errore(messaggioErrore(error, 'servizio'))
      }
      return
    }
    avvisi.successo('Servizio eliminato')
    setModulo(null)
    void carica()
  }

  return (
    <>
      <TitoloPagina
        titolo="Servizi"
        sottotitolo="Quello che le clienti possono prenotare su WhatsApp, con la durata."
        azioni={
          <Pulsante
            onClick={() => {
              setErrori({})
              setModulo(moduloVuoto)
            }}
          >
            + Nuovo servizio
          </Pulsante>
        }
      />

      {servizi === null ? (
        <Caricamento />
      ) : servizi.length === 0 ? (
        <Vuoto
          titolo="Nessun servizio"
          testo="Aggiungi i servizi che offri (es. Piega, 45 minuti). Il bot li mostrerà alle clienti in questo ordine."
          azione={<Pulsante onClick={() => setModulo(moduloVuoto)}>Aggiungi il primo servizio</Pulsante>}
        />
      ) : (
        <Scheda senzaMargini>
          <ul className="divide-y divide-stone-100">
            {servizi.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label={`Sposta su ${s.nome}`}
                    disabled={i === 0}
                    onClick={() => void sposta(i, -1)}
                    className="rounded p-0.5 text-stone-400 hover:text-stone-700 disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label={`Sposta giù ${s.nome}`}
                    disabled={i === servizi.length - 1}
                    onClick={() => void sposta(i, 1)}
                    className="rounded p-0.5 text-stone-400 hover:text-stone-700 disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    setErrori({})
                    setModulo({
                      id: s.id,
                      nome: s.nome,
                      durata: String(s.durata_minuti),
                      prezzo: s.prezzo === null ? '' : String(s.prezzo).replace('.', ','),
                      attivo: s.attivo,
                    })
                  }}
                >
                  <p className={`truncate font-medium ${s.attivo ? 'text-stone-900' : 'text-stone-400'}`}>
                    {s.nome}
                  </p>
                  <p className="text-sm text-stone-500">
                    {durataLeggibile(s.durata_minuti)}
                    {s.prezzo !== null ? ` · ${prezzoLeggibile(s.prezzo)}` : ''}
                    {!s.attivo ? (
                      <span className="ml-2">
                        <Etichetta>non prenotabile</Etichetta>
                      </span>
                    ) : null}
                  </p>
                </button>
                <Interruttore
                  attivo={s.attivo}
                  etichetta={`Prenotabile: ${s.nome}`}
                  onCambia={(v) => void cambiaAttivo(s, v)}
                />
              </li>
            ))}
          </ul>
        </Scheda>
      )}

      <Finestra
        aperta={modulo !== null}
        onChiudi={() => setModulo(null)}
        titolo={modulo?.id ? 'Modifica servizio' : 'Nuovo servizio'}
        piede={
          <>
            {modulo?.id ? (
              <Pulsante
                variante="pericolo"
                className="mr-auto"
                onClick={() => {
                  const s = servizi?.find((x) => x.id === modulo.id)
                  if (s) void elimina(s)
                }}
              >
                Elimina
              </Pulsante>
            ) : null}
            <Pulsante variante="secondario" onClick={() => setModulo(null)}>
              Annulla
            </Pulsante>
            <Pulsante type="submit" form="modulo-servizio" inCorso={inCorso}>
              Salva
            </Pulsante>
          </>
        }
      >
        {modulo ? (
          <form id="modulo-servizio" onSubmit={salva} className="flex flex-col gap-4">
            <Voce
              etichetta="Nome"
              errore={errori.nome}
              aiuto={
                modulo.nome.trim().length > LIMITE_WHATSAPP
                  ? `Su WhatsApp si vedranno solo i primi ${LIMITE_WHATSAPP} caratteri.`
                  : 'Es. Piega, Taglio donna, Colore + piega'
              }
            >
              {(id) => (
                <Campo
                  id={id}
                  value={modulo.nome}
                  maxLength={60}
                  onChange={(e) => setModulo({ ...modulo, nome: e.target.value })}
                  autoFocus
                />
              )}
            </Voce>
            <div className="grid grid-cols-2 gap-3">
              <Voce etichetta="Durata (minuti)" errore={errori.durata}>
                {(id) => (
                  <Campo
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={5}
                    max={600}
                    step={5}
                    value={modulo.durata}
                    onChange={(e) => setModulo({ ...modulo, durata: e.target.value })}
                  />
                )}
              </Voce>
              <Voce etichetta="Prezzo (facoltativo)" errore={errori.prezzo}>
                {(id) => (
                  <Campo
                    id={id}
                    inputMode="decimal"
                    placeholder="es. 25"
                    value={modulo.prezzo}
                    onChange={(e) => setModulo({ ...modulo, prezzo: e.target.value })}
                  />
                )}
              </Voce>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-stone-800">Prenotabile su WhatsApp</p>
                <p className="text-xs text-stone-500">Se lo spegni resta solo per l&apos;agenda manuale.</p>
              </div>
              <Interruttore
                attivo={modulo.attivo}
                etichetta="Prenotabile su WhatsApp"
                onCambia={(v) => setModulo({ ...modulo, attivo: v })}
              />
            </div>
          </form>
        ) : null}
      </Finestra>
    </>
  )
}
