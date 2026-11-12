'use client'

import { messaggioManuale } from '@ilenia/shared/bot/anticipo'
import { adesso, dataBreve, dataOraLunga, daIso, oraBreve } from '@ilenia/shared/tempo'
import type { Impostazioni, StatoProposta, StatoSlotLiberato } from '@ilenia/shared/tipi-db'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useAvvisi } from '@/components/Avvisi'
import { nomeCliente } from '@/components/clienti'
import { useConferma } from '@/components/Conferma'
import { Caricamento, Etichetta, Pulsante, Scheda, TitoloPagina, Vuoto } from '@/components/ui'
import { chiudiPosto, EVENTO_AGGIORNA_CONTATORI, ErroreInvio, rispostaProposta, segnaPropostaInviata } from '@/lib/api'
import { messaggioErrore } from '@/lib/errori'
import { useOperatrice } from '@/lib/sessione'
import { supabase } from '@/lib/supabase'

type Proposta = {
  id: string
  slot_id: string
  codice: string
  canale: 'interattivo' | 'template' | 'manuale'
  stato: StatoProposta
  nuovo_inizio: string
  nuova_fine: string
  scade_il: string | null
  clienti: { nome: string | null; telefono: string | null } | null
  appuntamenti: { inizio: string; servizi: { nome: string } | null } | null
}

type Iscritta = {
  id: string
  clienti: { nome: string | null; telefono: string | null } | null
  appuntamenti: { inizio: string; stato: string; servizi: { nome: string } | null } | null
}

type Posto = {
  id: string
  inizio: string
  fine: string
  stato: StatoSlotLiberato
  creato_il: string
}

const ESITI: Record<StatoSlotLiberato, { testo: string; colore: 'neutro' | 'brand' | 'ambra' | 'verde' | 'rosso' }> = {
  aperto: { testo: 'In corso', colore: 'ambra' },
  assegnato: { testo: 'Assegnato', colore: 'verde' },
  esaurito: { testo: 'Nessuna interessata', colore: 'neutro' },
  annullato: { testo: 'Chiuso', colore: 'neutro' },
}

function minutiAlla(scadenza: string | null): number | null {
  if (!scadenza) return null
  return Math.max(0, Math.ceil((Date.parse(scadenza) - Date.now()) / 60_000))
}

export default function PaginaListaAttesa() {
  const operatrice = useOperatrice()
  const avvisi = useAvvisi()
  const conferma = useConferma()
  const [imp, setImp] = useState<Impostazioni | null>(null)
  const [proposte, setProposte] = useState<Proposta[] | null>(null)
  const [iscritte, setIscritte] = useState<Iscritta[]>([])
  const [posti, setPosti] = useState<Posto[]>([])
  const [esitiPosti, setEsitiPosti] = useState<Record<string, string>>({})
  const [, setTic] = useState(0)

  const carica = useCallback(async () => {
    const sb = supabase()
    const [i, p, l, s] = await Promise.all([
      sb.from('impostazioni').select('*').eq('operatrice_id', operatrice.id).single(),
      sb
        .from('proposte_anticipo')
        .select('id, slot_id, codice, canale, stato, nuovo_inizio, nuova_fine, scade_il, clienti(nome, telefono), appuntamenti(inizio, servizi(nome))')
        .in('stato', ['da_inviare', 'inviata'])
        .order('nuovo_inizio'),
      sb.from('lista_attesa').select('id, clienti(nome, telefono), appuntamenti(inizio, stato, servizi(nome))').eq('attiva', true),
      sb.from('slot_liberati').select('id, inizio, fine, stato, creato_il').order('creato_il', { ascending: false }).limit(15),
    ])
    const errore = i.error ?? p.error ?? l.error ?? s.error
    if (errore) {
      avvisi.errore(messaggioErrore(errore))
      return
    }
    setImp(i.data)
    setProposte(p.data as Proposta[])
    const ora = Date.now()
    setIscritte(
      (l.data as Iscritta[])
        .filter((x) => x.appuntamenti && Date.parse(x.appuntamenti.inizio) > ora && x.appuntamenti.stato === 'confermato')
        .sort((a, b) => Date.parse(a.appuntamenti!.inizio) - Date.parse(b.appuntamenti!.inizio)),
    )
    const lista = s.data as Posto[]
    setPosti(lista)
    // a chi sono andati i posti assegnati
    const assegnati = lista.filter((x) => x.stato === 'assegnato').map((x) => x.id)
    if (assegnati.length > 0) {
      const { data } = await sb.from('proposte_anticipo').select('slot_id, clienti(nome, telefono)').in('slot_id', assegnati).eq('stato', 'accettata')
      setEsitiPosti(Object.fromEntries((data ?? []).map((x) => [x.slot_id, nomeCliente(x.clienti)])))
    }
  }, [operatrice.id, avvisi])

  useEffect(() => {
    void carica()
    const dati = setInterval(() => void carica(), 20_000)
    const orologio = setInterval(() => setTic((t) => t + 1), 15_000)
    window.addEventListener(EVENTO_AGGIORNA_CONTATORI, carica)
    return () => {
      clearInterval(dati)
      clearInterval(orologio)
      window.removeEventListener(EVENTO_AGGIORNA_CONTATORI, carica)
    }
  }, [carica])

  async function inviata(p: Proposta) {
    try {
      await segnaPropostaInviata(operatrice.id, p.id)
      void carica()
    } catch (e) {
      avvisi.errore(e instanceof ErroreInvio ? e.message : messaggioErrore(e))
    }
  }

  async function risposta(p: Proposta, accettata: boolean) {
    try {
      const esito = await rispostaProposta(operatrice.id, p.id, accettata)
      if (esito.esito === 'accettata') avvisi.successo(`Fatto: ${nomeCliente(p.clienti)} è anticipata a ${esito.quando}.`)
      else if (esito.esito === 'rifiutata') avvisi.successo('Ok, proponiamo il posto alla prossima della lista.')
      else if (esito.esito === 'preso') avvisi.errore('Quel posto nel frattempo è stato occupato.')
      else avvisi.errore('La proposta è scaduta o è già stata gestita.')
      void carica()
    } catch (e) {
      avvisi.errore(e instanceof ErroreInvio ? e.message : messaggioErrore(e))
    }
  }

  async function chiudi(p: Proposta) {
    const ok = await conferma({
      titolo: 'Smettere di proporre questo posto?',
      messaggio: 'Per esempio perché l\'hai già riempito tu. Le clienti della lista non riceveranno altre proposte per questo orario.',
      conferma: 'Chiudi il posto',
    })
    if (!ok) return
    try {
      await chiudiPosto(operatrice.id, p.slot_id)
      avvisi.successo('Posto chiuso')
      void carica()
    } catch (e) {
      avvisi.errore(e instanceof ErroreInvio ? e.message : messaggioErrore(e))
    }
  }

  async function togli(x: Iscritta) {
    const ok = await conferma({
      titolo: 'Togliere dalla lista d\'attesa?',
      messaggio: `${nomeCliente(x.clienti)} non riceverà più proposte per anticipare questo appuntamento.`,
      conferma: 'Togli',
    })
    if (!ok) return
    const { error } = await supabase().from('lista_attesa').update({ attiva: false }).eq('id', x.id)
    if (error) avvisi.errore(messaggioErrore(error))
    else void carica()
  }

  if (!imp || proposte === null) return <Caricamento />
  const manuale = imp.lista_attesa_modalita === 'manuale'

  return (
    <>
      <TitoloPagina
        titolo="Lista d'attesa"
        sottotitolo="Quando si libera un posto lo proponiamo, una alla volta, a chi vuole anticipare."
      />

      <p className="mb-4 rounded-xl bg-white px-4 py-3 text-sm text-stone-600 ring-1 ring-stone-200">
        Modalità <strong>{manuale ? 'manuale (gratis)' : 'automatica'}</strong>:{' '}
        {manuale
          ? 'prepariamo il messaggio, tu lo invii dal tuo telefono con un tocco.'
          : 'il bot scrive da solo (gratis se la cliente ha scritto nelle ultime 24 ore, altrimenti con un template a pagamento).'}{' '}
        Tempo per rispondere: {imp.lista_attesa_minuti_risposta} minuti.{' '}
        <Link href="/impostazioni/" className="font-medium text-brand-700 underline-offset-2 hover:underline">
          Cambia
        </Link>
        {manuale && !imp.numero_whatsapp ? (
          <span className="mt-1 block text-amber-800">
            Inserisci in Impostazioni il numero WhatsApp del salone: così la cliente accetta con un tocco e il bot sposta da solo
            l&apos;appuntamento.
          </span>
        ) : null}
      </p>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Proposte in corso</h2>
        {proposte.length === 0 ? (
          <Vuoto titolo="Nessun posto da proporre" testo="Quando una cliente disdice o sposta, il posto libero compare qui." />
        ) : (
          <ul className="flex flex-col gap-3">
            {proposte.map((p) => {
              const minuti = minutiAlla(p.scade_il)
              const { link } = messaggioManuale(p, imp)
              return (
                <li key={p.id}>
                  <Scheda>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">Posto libero</p>
                        <p className="text-lg font-semibold text-stone-900 first-letter:uppercase">
                          {dataOraLunga(daIso(p.nuovo_inizio))}
                        </p>
                      </div>
                      {p.stato === 'da_inviare' ? (
                        <Etichetta colore="ambra">Da inviare</Etichetta>
                      ) : (
                        <Etichetta colore="brand">{minuti !== null ? `Risposta entro ${minuti} min` : 'Inviata'}</Etichetta>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-stone-700">
                      Proposto a <strong>{nomeCliente(p.clienti)}</strong>
                      {p.appuntamenti ? (
                        <>
                          {' '}
                          ({p.appuntamenti.servizi?.nome ?? 'appuntamento'}, ora {dataOraLunga(daIso(p.appuntamenti.inizio))})
                        </>
                      ) : null}
                      {p.canale !== 'manuale' ? (
                        <span className="text-stone-500">
                          {' · '}
                          {p.canale === 'template' ? 'inviato dal bot con template' : 'inviato dal bot'}
                        </span>
                      ) : null}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {p.canale === 'manuale' ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => {
                            if (p.stato === 'da_inviare') void inviata(p)
                          }}
                          className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                        >
                          {p.stato === 'da_inviare' ? 'Apri WhatsApp e invia' : 'Riapri WhatsApp'}
                        </a>
                      ) : null}
                      {p.canale === 'manuale' && p.stato === 'inviata' ? (
                        <>
                          <Pulsante onClick={() => void risposta(p, true)}>Ha accettato</Pulsante>
                          <Pulsante variante="secondario" onClick={() => void risposta(p, false)}>
                            Non le interessa
                          </Pulsante>
                        </>
                      ) : null}
                      <Pulsante variante="fantasma" onClick={() => void chiudi(p)}>
                        Chiudi il posto
                      </Pulsante>
                    </div>
                    {p.canale === 'manuale' && p.stato === 'da_inviare' ? (
                      <p className="mt-2 text-xs text-stone-500">
                        Si apre WhatsApp con il messaggio già scritto: premi invia. Da quel momento la cliente ha{' '}
                        {imp.lista_attesa_minuti_risposta} minuti; se accetta col link, l&apos;appuntamento si sposta da solo.
                      </p>
                    ) : null}
                  </Scheda>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Scheda>
          <h2 className="mb-1 text-lg font-semibold">Iscritte</h2>
          <p className="mb-3 text-sm text-stone-500">Clienti che hanno chiesto di essere avvisate se si libera un posto prima.</p>
          {iscritte.length === 0 ? (
            <p className="text-sm text-stone-500">Nessuna iscritta al momento.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {iscritte.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-stone-800">{nomeCliente(x.clienti)}</p>
                    <p className="text-sm text-stone-500">
                      {x.appuntamenti?.servizi?.nome ?? 'Appuntamento'} · {dataBreve(daIso(x.appuntamenti!.inizio))}{' '}
                      {oraBreve(daIso(x.appuntamenti!.inizio))}
                    </p>
                  </div>
                  <Pulsante piccolo variante="fantasma" onClick={() => void togli(x)}>
                    Togli
                  </Pulsante>
                </li>
              ))}
            </ul>
          )}
        </Scheda>

        <Scheda>
          <h2 className="mb-1 text-lg font-semibold">Ultimi posti liberati</h2>
          <p className="mb-3 text-sm text-stone-500">Com&apos;è andata.</p>
          {posti.length === 0 ? (
            <p className="text-sm text-stone-500">Ancora nessuno.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {posti.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="text-stone-800">
                    {dataBreve(daIso(x.inizio))} {oraBreve(daIso(x.inizio))}
                    {esitiPosti[x.id] ? <span className="text-stone-500"> · a {esitiPosti[x.id]}</span> : null}
                  </span>
                  <Etichetta colore={ESITI[x.stato].colore}>{ESITI[x.stato].testo}</Etichetta>
                </li>
              ))}
            </ul>
          )}
        </Scheda>
      </div>
    </>
  )
}
