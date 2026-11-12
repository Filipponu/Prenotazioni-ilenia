'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useAvvisi } from '@/components/Avvisi'
import { Etichetta, Pulsante, Scheda } from '@/components/ui'
import { ErroreInvio, provaNotifica } from '@/lib/api'
import { messaggioErrore } from '@/lib/errori'
import {
  attivaNotifiche,
  disattivaNotifiche,
  ErroreNotifiche,
  installa,
  sincronizzaNotifiche,
  statoInstallazione,
  statoNotifiche,
  suCambioInstallazione,
  type StatoNotifiche,
} from '@/lib/pwa'
import { useOperatrice } from '@/lib/sessione'
import { modalitaDemo } from '@/lib/supabase'

/** Scheda delle impostazioni: installa l'app e attiva gli avvisi su questo dispositivo. */
export function AppENotifiche() {
  return (
    <Scheda>
      <h2 className="text-lg font-semibold">App e notifiche</h2>
      <p className="mb-4 text-sm text-stone-500">Valgono per questo dispositivo: ripeti su telefono e computer.</p>
      <div className="flex flex-col gap-5">
        <Installazione />
        <Notifiche />
      </div>
    </Scheda>
  )
}

function Riga({ titolo, stato, children }: { titolo: string; stato?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{titolo}</h3>
        {stato}
      </div>
      <div className="text-sm text-stone-600">{children}</div>
    </div>
  )
}

function Installazione() {
  const stato = useSyncExternalStore(suCambioInstallazione, statoInstallazione, () => 'manuale' as const)

  if (modalitaDemo) {
    return (
      <Riga titolo="Installa l'app">
        Nella versione vera il pannello si installa come un&apos;app: icona sulla schermata Home, si apre a tutto schermo
        e riceve le notifiche. In questa demo non è possibile.
      </Riga>
    )
  }
  if (stato === 'installata') {
    return (
      <Riga titolo="Installa l'app" stato={<Etichetta colore="verde">Installata</Etichetta>}>
        Stai usando l&apos;app installata.
      </Riga>
    )
  }
  if (stato === 'pronta') {
    return (
      <Riga titolo="Installa l'app">
        <p className="mb-2">Aggiunge l&apos;icona alla schermata Home: si apre come un&apos;app normale.</p>
        <Pulsante piccolo onClick={() => void installa()}>
          Installa l&apos;app
        </Pulsante>
      </Riga>
    )
  }
  if (stato === 'ios') {
    return (
      <Riga titolo="Installa l'app">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Apri questa pagina con <strong>Safari</strong>.</li>
          <li>
            Tocca il pulsante <strong>Condividi</strong> (il quadrato con la freccia in su).
          </li>
          <li>
            Scegli <strong>Aggiungi alla schermata Home</strong>, poi <strong>Aggiungi</strong>.
          </li>
          <li>Apri l&apos;app dall&apos;icona e attiva qui le notifiche.</li>
        </ol>
      </Riga>
    )
  }
  return (
    <Riga titolo="Installa l'app">
      Dal menu del browser scegli <strong>Installa app</strong> o <strong>Aggiungi a schermata Home</strong>.
    </Riga>
  )
}

const DESCRIZIONI: Record<Exclude<StatoNotifiche, 'attive' | 'spente'>, string> = {
  demo: 'Nella versione vera ti arriva un avviso sul telefono per ogni nuova richiesta, per chi scrive «operatore» e per i posti liberi da proporre. In questa demo non è possibile.',
  non_configurate: 'Le notifiche non sono ancora configurate (manca la chiave nel pannello: vedi la guida della Fase 5).',
  ios_da_installare: 'Su iPhone le notifiche arrivano solo all\'app installata: prima aggiungila alla schermata Home (istruzioni qui sopra), poi aprila dall\'icona.',
  non_supportate: 'Questo browser non gestisce le notifiche push. Prova con Chrome, Edge, Firefox o Safari aggiornati.',
  bloccate: 'Le notifiche sono bloccate per questo sito: riattivale dalle impostazioni del browser (icona del lucchetto accanto all\'indirizzo), poi ricarica la pagina.',
}

function Notifiche() {
  const operatrice = useOperatrice()
  const avvisi = useAvvisi()
  const [stato, setStato] = useState<StatoNotifiche | null>(null)
  const [inCorso, setInCorso] = useState<'attiva' | 'spegni' | 'prova' | null>(null)

  const aggiorna = useCallback(() => statoNotifiche().then(setStato), [])
  useEffect(() => {
    void aggiorna()
    void sincronizzaNotifiche(operatrice.id).catch(() => undefined)
  }, [aggiorna, operatrice.id])

  async function esegui(azione: 'attiva' | 'spegni' | 'prova') {
    setInCorso(azione)
    try {
      if (azione === 'attiva') {
        await attivaNotifiche(operatrice.id)
        avvisi.successo('Notifiche attivate su questo dispositivo.')
      } else if (azione === 'spegni') {
        await disattivaNotifiche()
        avvisi.successo('Notifiche disattivate su questo dispositivo.')
      } else {
        const arrivate = await provaNotifica()
        if (arrivate > 0) avvisi.successo(`Notifica di prova inviata (${arrivate === 1 ? '1 dispositivo' : `${arrivate} dispositivi`}).`)
        else avvisi.errore('Nessun dispositivo l\'ha ricevuta: disattiva e riattiva le notifiche.')
      }
    } catch (e) {
      avvisi.errore(e instanceof ErroreNotifiche || e instanceof ErroreInvio ? e.message : messaggioErrore(e))
    } finally {
      setInCorso(null)
      void aggiorna()
    }
  }

  if (!stato) return <Riga titolo="Notifiche">Controllo in corso…</Riga>
  if (stato === 'attive' || stato === 'spente') {
    const attive = stato === 'attive'
    return (
      <Riga
        titolo="Notifiche"
        stato={<Etichetta colore={attive ? 'verde' : 'neutro'}>{attive ? 'Attive' : 'Spente'}</Etichetta>}
      >
        <p className="mb-2">
          Avvisi per nuove richieste, clienti che chiedono di parlarti, disdette, spostamenti e posti liberi della lista
          d&apos;attesa. Se nessun dispositivo li riceve, ti scriviamo all&apos;email di riserva.
        </p>
        <div className="flex flex-wrap gap-2">
          {attive ? (
            <>
              <Pulsante piccolo variante="secondario" inCorso={inCorso === 'prova'} onClick={() => void esegui('prova')}>
                Manda una prova
              </Pulsante>
              <Pulsante piccolo variante="fantasma" inCorso={inCorso === 'spegni'} onClick={() => void esegui('spegni')}>
                Disattiva
              </Pulsante>
            </>
          ) : (
            <Pulsante piccolo inCorso={inCorso === 'attiva'} onClick={() => void esegui('attiva')}>
              Attiva le notifiche
            </Pulsante>
          )}
        </div>
      </Riga>
    )
  }
  return (
    <Riga titolo="Notifiche" stato={stato === 'bloccate' ? <Etichetta colore="rosso">Bloccate</Etichetta> : undefined}>
      {DESCRIZIONI[stato]}
    </Riga>
  )
}
