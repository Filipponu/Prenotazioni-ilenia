'use client'

import { gestisciEvento, type Notifica } from '@ilenia/shared/bot/motore'
import { formattaTelefono } from '@ilenia/shared/telefono'
import { adesso, versoIso } from '@ilenia/shared/tempo'
import type { Cliente } from '@ilenia/shared/tipi-db'
import type { MessaggioUscita } from '@ilenia/shared/whatsapp/messaggi'
import type { ContenutoIngresso } from '@ilenia/shared/whatsapp/webhook'
import { useCallback, useEffect, useState } from 'react'
import { useAvvisi } from '@/components/Avvisi'
import { nomeCliente } from '@/components/clienti'
import { Campo, Pulsante, Scelta, Scheda, TitoloPagina, Vuoto } from '@/components/ui'
import { Chat, type VoceChat } from '@/components/whatsapp/Chat'
import { EVENTO_AGGIORNA_CONTATORI } from '@/lib/api'
import { messaggioErrore } from '@/lib/errori'
import { modalitaDemo, supabase } from '@/lib/supabase'

/** Numero inventato per una "nuova cliente" del simulatore. */
function numeroNuovo(): string {
  return `39300999${String(Math.floor(Math.random() * 10_000)).padStart(4, '0')}`
}

export default function PaginaWhatsApp() {
  if (!modalitaDemo) {
    return (
      <>
        <TitoloPagina titolo="Prova il bot" />
        <Vuoto titolo="Simulatore disponibile solo nella versione dimostrativa" />
      </>
    )
  }
  return <Simulatore />
}

function Simulatore() {
  const avvisi = useAvvisi()
  const [clienti, setClienti] = useState<Cliente[]>([])
  const [nuova, setNuova] = useState(numeroNuovo)
  const [telefono, setTelefono] = useState(nuova)
  const [voci, setVoci] = useState<VoceChat[]>([])
  const [testo, setTesto] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [inPausa, setInPausa] = useState(false)

  const caricaClienti = useCallback(async () => {
    const { data } = await supabase().from('clienti').select('*').not('telefono', 'is', null).order('nome')
    setClienti(data ?? [])
  }, [])

  const caricaChat = useCallback(async (tel: string) => {
    const sb = supabase()
    const [log, cliente] = await Promise.all([
      sb.from('log_messaggi').select('*').eq('telefono', tel).order('id'),
      sb.from('clienti').select('id').eq('telefono', tel).maybeSingle(),
    ])
    setVoci(
      (log.data ?? []).map((l) =>
        l.direzione === 'in'
          ? { id: l.id, direzione: 'in', contenuto: l.contenuto as unknown as ContenutoIngresso, ora: l.creato_il }
          : { id: l.id, direzione: 'out', contenuto: l.contenuto as unknown as MessaggioUscita, ora: l.creato_il },
      ),
    )
    if (cliente.data) {
      const { data: conv } = await sb.from('conversazioni').select('bot_in_pausa_fino_al').eq('cliente_id', cliente.data.id).maybeSingle()
      setInPausa(!!conv?.bot_in_pausa_fino_al && Date.parse(conv.bot_in_pausa_fino_al) > Date.now())
    } else setInPausa(false)
  }, [])

  useEffect(() => {
    void caricaClienti()
  }, [caricaClienti])

  useEffect(() => {
    void caricaChat(telefono)
  }, [telefono, caricaChat])

  function mostraNotifica(n: Notifica) {
    if (n.tipo === 'richiesta') {
      avvisi.successo(
        n.confermata
          ? `Nuova prenotazione: ${n.cliente}, ${n.servizio} ${n.quando}`
          : `Nuova richiesta da approvare: ${n.cliente}, ${n.servizio} ${n.quando}`,
      )
    } else if (n.tipo === 'operatore') {
      avvisi.successo(`${n.cliente} vuole parlare con te`)
    } else if (n.tipo === 'disdetta') {
      avvisi.successo(`${n.cliente} ha disdetto: ${n.servizio} ${n.quando}`)
    } else if (n.tipo === 'spostamento') {
      avvisi.successo(`${n.cliente} ha spostato ${n.servizio}: da ${n.da} a ${n.a}`)
    } else {
      avvisi.successo(`Messaggio da ${n.cliente}: ${n.testo}`)
    }
  }

  async function ricevi(contenuto: ContenutoIngresso) {
    if (inCorso) return
    setInCorso(true)
    setVoci((v) => [...v, { id: `attesa-${Date.now()}`, direzione: 'in', contenuto, ora: versoIso(adesso()) }])
    try {
      await gestisciEvento(
        {
          db: supabase(),
          canale: { invia: async () => ({ id: `wamid.demo.${crypto.randomUUID()}` }) },
          notifica: mostraNotifica,
        },
        {
          tipo: 'messaggio',
          id: `wamid.demo.${crypto.randomUUID()}`,
          da: telefono,
          nomeProfilo: null,
          timestamp: Math.floor(Date.now() / 1000),
          contenuto,
        },
      )
    } catch (e) {
      avvisi.errore(messaggioErrore(e))
    }
    await caricaChat(telefono)
    void caricaClienti()
    window.dispatchEvent(new Event(EVENTO_AGGIORNA_CONTATORI))
    setInCorso(false)
  }

  async function riattivaBot() {
    const sb = supabase()
    const { data: cliente } = await sb.from('clienti').select('id').eq('telefono', telefono).maybeSingle()
    if (!cliente) return
    await sb.from('conversazioni').update({ bot_in_pausa_fino_al: null, stato: 'menu' }).eq('cliente_id', cliente.id)
    setInPausa(false)
    avvisi.successo('Bot riattivato per questa cliente')
  }

  const conNumero = clienti.filter((c) => c.telefono && c.telefono !== nuova)

  return (
    <>
      <TitoloPagina
        titolo="Prova il bot"
        sottotitolo="Scrivi come se fossi una cliente su WhatsApp: prenotazioni, spostamenti e disdette compaiono subito in Agenda e in Richieste."
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,26rem)]">
        <div className="order-2 flex flex-col gap-4 lg:order-1">
          <Scheda>
            <h2 className="mb-2 text-lg font-semibold">Come provarlo</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-700">
              <li>Scrivi un messaggio qualsiasi, per esempio «ciao Ilenia».</li>
              <li>Tocca <strong>Prenota</strong>, scegli servizio, giorno e orario dalle liste.</li>
              <li>Se sei una cliente nuova il bot ti chiede il nome.</li>
              <li>Conferma: la richiesta arriva in <strong>Richieste</strong> e in <strong>Agenda</strong> (in arancione).</li>
              <li>Approvala da <strong>Richieste</strong>: qui in chat arriva la conferma.</li>
              <li>Prova <strong>Sposta</strong> e <strong>Disdici</strong> (fino a 24 ore prima).</li>
              <li>Scrivi «operatore»: la chat compare in <strong>Messaggi</strong>, dove rispondi tu.</li>
            </ol>
            <p className="mt-3 text-xs text-stone-500">
              Sul telefono della cliente i pulsanti e le liste sono quelli di WhatsApp; qui sono disegnati in modo simile.
            </p>
          </Scheda>
          <Scheda>
            <label htmlFor="scrivi-come" className="mb-1.5 block text-sm font-medium text-stone-700">
              Scrivi come
            </label>
            <div className="flex flex-wrap gap-2">
              <Scelta id="scrivi-come" value={telefono} onChange={(e) => setTelefono(e.target.value)} className="min-w-0 flex-1">
                <option value={nuova}>Nuova cliente ({formattaTelefono(nuova)})</option>
                {conNumero.map((c) => (
                  <option key={c.id} value={c.telefono ?? ''}>
                    {nomeCliente(c)}
                  </option>
                ))}
              </Scelta>
              <Pulsante
                variante="secondario"
                onClick={() => {
                  const n = numeroNuovo()
                  setNuova(n)
                  setTelefono(n)
                }}
              >
                Altra cliente nuova
              </Pulsante>
            </div>
          </Scheda>
        </div>

        <section
          aria-label="Chat WhatsApp simulata"
          className="order-1 overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-stone-200 lg:order-2"
        >
          <header className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: '#008069' }}>
            <span className="grid size-9 place-items-center rounded-full bg-white/20 text-sm font-semibold">IL</span>
            <div className="min-w-0">
              <p className="truncate font-semibold">Ilenia – Prenotazioni</p>
              <p className="truncate text-xs text-white/80">account aziendale · risponde l&apos;assistente</p>
            </div>
          </header>
          <div className="h-[28rem] overflow-y-auto">
            <Chat voci={voci} staScrivendo={inCorso} onScelta={(id, titolo) => void ricevi({ tipo: 'scelta', id, titolo })} />
          </div>
          {inPausa ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span>Bot in pausa: risponde Ilenia a mano.</span>
              <button type="button" className="font-medium underline" onClick={() => void riattivaBot()}>
                Riattiva il bot
              </button>
            </div>
          ) : null}
          <form
            className="flex gap-2 border-t border-stone-200 bg-stone-50 p-2"
            onSubmit={(e) => {
              e.preventDefault()
              const t = testo.trim()
              if (!t) return
              setTesto('')
              void ricevi({ tipo: 'testo', testo: t })
            }}
          >
            <Campo
              aria-label="Messaggio"
              placeholder="Scrivi un messaggio"
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              className="min-w-0 flex-1"
            />
            <Pulsante type="submit" disabled={inCorso || !testo.trim()}>
              Invia
            </Pulsante>
          </form>
        </section>
      </div>
    </>
  )
}
