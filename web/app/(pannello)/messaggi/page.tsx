'use client'

import { formattaTelefono, linkWhatsApp } from '@ilenia/shared/telefono'
import { adesso, dataBreve, daIso, oraBreve } from '@ilenia/shared/tempo'
import type { Cliente } from '@ilenia/shared/tipi-db'
import { statoFinestra, tempoRestante } from '@ilenia/shared/whatsapp/finestra'
import type { MessaggioUscita } from '@ilenia/shared/whatsapp/messaggi'
import type { ContenutoIngresso } from '@ilenia/shared/whatsapp/webhook'
import { useCallback, useEffect, useState } from 'react'
import { useAvvisi } from '@/components/Avvisi'
import { nomeCliente } from '@/components/clienti'
import { AreaTesto, Caricamento, cx, Etichetta, Pulsante, Scheda, TitoloPagina, Vuoto } from '@/components/ui'
import { Chat, type VoceChat } from '@/components/whatsapp/Chat'
import { EVENTO_AGGIORNA_CONTATORI, ErroreInvio, riattiva, rispondi } from '@/lib/api'
import { messaggioErrore } from '@/lib/errori'
import { supabase } from '@/lib/supabase'

type Conversazione = {
  id: string
  cliente_id: string
  ultimo_messaggio_cliente_il: string | null
  bot_in_pausa_fino_al: string | null
  clienti: Pick<Cliente, 'id' | 'nome' | 'telefono'> | null
}

function inPausa(c: Conversazione): boolean {
  return !!c.bot_in_pausa_fino_al && Date.parse(c.bot_in_pausa_fino_al) > Date.now()
}

function quando(iso: string | null): string {
  if (!iso) return ''
  const d = daIso(iso)
  return d.hasSame(adesso(), 'day') ? oraBreve(d) : dataBreve(d)
}

export default function PaginaMessaggi() {
  const avvisi = useAvvisi()
  const [conversazioni, setConversazioni] = useState<Conversazione[] | null>(null)
  const [scelta, setScelta] = useState<string | null>(null)

  const carica = useCallback(async () => {
    const { data, error } = await supabase()
      .from('conversazioni')
      .select('id, cliente_id, ultimo_messaggio_cliente_il, bot_in_pausa_fino_al, clienti(id, nome, telefono)')
      .order('ultimo_messaggio_cliente_il', { ascending: false, nullsFirst: false })
      .limit(100)
    if (error) {
      avvisi.errore(messaggioErrore(error))
      return
    }
    const lista = data as Conversazione[]
    // prima chi ha chiesto di parlare con te
    setConversazioni([...lista.filter(inPausa), ...lista.filter((c) => !inPausa(c))])
  }, [avvisi])

  useEffect(() => {
    void carica()
    const intervallo = setInterval(() => void carica(), 20_000)
    window.addEventListener(EVENTO_AGGIORNA_CONTATORI, carica)
    return () => {
      clearInterval(intervallo)
      window.removeEventListener(EVENTO_AGGIORNA_CONTATORI, carica)
    }
  }, [carica])

  const aperta = conversazioni?.find((c) => c.cliente_id === scelta) ?? null

  return (
    <>
      <TitoloPagina titolo="Messaggi" sottotitolo="Le conversazioni WhatsApp con le clienti. Rispondi qui quando chiedono di te." />
      {conversazioni === null ? (
        <Caricamento />
      ) : conversazioni.length === 0 ? (
        <Vuoto titolo="Nessuna conversazione" testo="Le chat compaiono qui quando una cliente scrive al numero del salone." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <Scheda senzaMargini className={cx(aperta && 'hidden lg:block')}>
            <ul className="divide-y divide-stone-100">
              {conversazioni.map((c) => {
                const finestra = statoFinestra(c.ultimo_messaggio_cliente_il, adesso())
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setScelta(c.cliente_id)}
                      className={cx(
                        'flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-stone-50',
                        c.cliente_id === scelta && 'bg-brand-50',
                      )}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium text-stone-900">{nomeCliente(c.clienti)}</span>
                        <span className="shrink-0 text-xs text-stone-500">{quando(c.ultimo_messaggio_cliente_il)}</span>
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {inPausa(c) ? <Etichetta colore="ambra">Vuole parlare con te</Etichetta> : null}
                        {finestra.aperta ? <Etichetta colore="verde">Risposta gratuita</Etichetta> : null}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Scheda>
          {aperta ? (
            <Dettaglio
              key={aperta.cliente_id}
              conversazione={aperta}
              onIndietro={() => setScelta(null)}
              onCambiata={() => void carica()}
            />
          ) : (
            <div className="hidden lg:block">
              <Vuoto titolo="Scegli una conversazione" />
            </div>
          )}
        </div>
      )}
    </>
  )
}

function Dettaglio({
  conversazione,
  onIndietro,
  onCambiata,
}: {
  conversazione: Conversazione
  onIndietro: () => void
  onCambiata: () => void
}) {
  const avvisi = useAvvisi()
  const [voci, setVoci] = useState<VoceChat[] | null>(null)
  const [testo, setTesto] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const telefono = conversazione.clienti?.telefono ?? null
  const finestra = statoFinestra(conversazione.ultimo_messaggio_cliente_il, adesso())

  const caricaChat = useCallback(async () => {
    const { data } = await supabase()
      .from('log_messaggi')
      .select('*')
      .eq('cliente_id', conversazione.cliente_id)
      .order('id')
    setVoci(
      (data ?? []).map((l) =>
        l.direzione === 'in'
          ? { id: l.id, direzione: 'in', contenuto: l.contenuto as unknown as ContenutoIngresso, ora: l.creato_il }
          : { id: l.id, direzione: 'out', contenuto: l.contenuto as unknown as MessaggioUscita, ora: l.creato_il },
      ),
    )
  }, [conversazione.cliente_id])

  useEffect(() => {
    void caricaChat()
    const intervallo = setInterval(() => void caricaChat(), 15_000)
    return () => clearInterval(intervallo)
  }, [caricaChat])

  async function invia(e: React.FormEvent) {
    e.preventDefault()
    if (!testo.trim()) return
    setInCorso(true)
    try {
      await rispondi(conversazione.cliente_id, testo)
      setTesto('')
      await caricaChat()
      onCambiata()
    } catch (err) {
      avvisi.errore(err instanceof ErroreInvio ? err.message : messaggioErrore(err))
    } finally {
      setInCorso(false)
    }
  }

  async function riattivaBot() {
    await riattiva(conversazione.cliente_id)
    avvisi.successo('Il bot risponde di nuovo a questa cliente')
    onCambiata()
  }

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
      <header className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-4 py-3">
        <button type="button" onClick={onIndietro} className="rounded-full p-1 text-stone-500 hover:bg-stone-100 lg:hidden" aria-label="Torna all'elenco">
          ‹
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-stone-900">{nomeCliente(conversazione.clienti)}</p>
          <p className="text-xs text-stone-500">{formattaTelefono(telefono)}</p>
        </div>
        {inPausa(conversazione) ? (
          <Pulsante piccolo variante="secondario" onClick={() => void riattivaBot()}>
            Riattiva il bot
          </Pulsante>
        ) : null}
      </header>
      <div className="max-h-[60dvh] min-h-64 overflow-y-auto">
        {voci === null ? <Caricamento /> : <Chat voci={voci} />}
      </div>
      {inPausa(conversazione) ? (
        <p className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          Il bot è in pausa per questa cliente: le rispondi tu. Quando hai finito, premi «Riattiva il bot».
        </p>
      ) : null}
      {finestra.aperta ? (
        <form onSubmit={invia} className="flex flex-col gap-2 border-t border-stone-100 p-3">
          <AreaTesto
            aria-label="Risposta"
            placeholder="Scrivi la risposta…"
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            className="min-h-16"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-stone-500">Risposta gratuita · {tempoRestante(finestra.minutiRestanti)}</span>
            <Pulsante type="submit" inCorso={inCorso} disabled={!testo.trim()}>
              Invia
            </Pulsante>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 p-3 text-sm text-stone-600">
          <span>Sono passate più di 24 ore dal suo ultimo messaggio: da qui non si può scrivere gratis.</span>
          {telefono ? (
            <a
              href={linkWhatsApp(telefono)}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Scrivile da WhatsApp
            </a>
          ) : null}
        </div>
      )}
    </section>
  )
}
