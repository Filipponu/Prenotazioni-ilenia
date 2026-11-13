'use client'

import { adesso } from '@ilenia/shared/tempo'
import { statoFinestra, tempoRestante, type StatoFinestra } from '@ilenia/shared/whatsapp/finestra'
import { useEffect, useState } from 'react'
import { approva, descriviEsito, ErroreInvio, rifiuta } from '@/lib/api'
import { useOperatrice } from '@/lib/sessione'
import { supabase } from '@/lib/supabase'
import { useAvvisi } from '../Avvisi'
import { useLinkWhatsApp } from '../LinkWhatsApp'
import { Finestra } from '../Finestra'
import { AreaTesto, Etichetta, Pulsante, Voce } from '../ui'

/** Stato della finestra gratuita di 24 ore per una cliente. */
export function useFinestra(clienteId: string | null): StatoFinestra | null {
  const [stato, setStato] = useState<StatoFinestra | null>(null)
  useEffect(() => {
    if (!clienteId) return
    let attivo = true
    void supabase()
      .from('conversazioni')
      .select('ultimo_messaggio_cliente_il')
      .eq('cliente_id', clienteId)
      .maybeSingle()
      .then(({ data }) => {
        if (attivo) setStato(statoFinestra(data?.ultimo_messaggio_cliente_il, adesso()))
      })
    return () => {
      attivo = false
    }
  }, [clienteId])
  return stato
}

/** Etichetta: conferma gratuita (con tempo residuo) o a pagamento. */
export function EtichettaFinestra({ finestra, telefono }: { finestra: StatoFinestra | null; telefono: string | null }) {
  if (!telefono) return <Etichetta>Senza WhatsApp</Etichetta>
  if (!finestra) return null
  return finestra.aperta ? (
    <Etichetta colore="verde">Conferma gratuita · {tempoRestante(finestra.minutiRestanti)}</Etichetta>
  ) : (
    <Etichetta colore="ambra">Conferma con template a pagamento</Etichetta>
  )
}

/**
 * Pulsanti Approva / Rifiuta di una richiesta in attesa, con la finestra
 * per il motivo del rifiuto e, se serve, il link per scrivere a mano.
 */
export function AzioniRichiesta({
  appuntamentoId,
  cliente,
  telefono,
  finestra,
  onFatto,
}: {
  appuntamentoId: string
  cliente: string
  telefono: string | null
  finestra: StatoFinestra | null
  onFatto: () => void
}) {
  const operatrice = useOperatrice()
  const avvisi = useAvvisi()
  const [inCorso, setInCorso] = useState<'approva' | 'rifiuta' | null>(null)
  const [rifiutoAperto, setRifiutoAperto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const mostraLink = useLinkWhatsApp()

  async function esegui(azione: 'approva' | 'rifiuta') {
    setInCorso(azione)
    try {
      const esito =
        azione === 'approva' ? await approva(operatrice.id, appuntamentoId) : await rifiuta(operatrice.id, appuntamentoId, motivo)
      setRifiutoAperto(false)
      if (esito.inviato === 'no' && esito.motivo !== 'senza_telefono' && esito.link) {
        const fatto = azione === 'approva' ? 'Richiesta approvata' : 'Richiesta rifiutata'
        mostraLink({
          titolo: 'Avvisa la cliente',
          testo:
            esito.motivo === 'template_non_riuscito'
              ? `${fatto}, ma il messaggio WhatsApp a pagamento non è partito (modello non ancora approvato o pagamento non attivo). Avvisa ${cliente} dal tuo telefono: il messaggio è già scritto.`
              : `${fatto}. Per avvisare ${cliente} gratis, apri WhatsApp dal tuo telefono: il messaggio è già scritto.`,
          link: esito.link,
        })
      } else {
        avvisi.successo(descriviEsito(azione === 'approva' ? 'approvata' : 'rifiutata', esito))
      }
      onFatto()
    } catch (e) {
      avvisi.errore(e instanceof ErroreInvio ? e.message : 'Operazione non riuscita, riprova.')
    } finally {
      setInCorso(null)
    }
  }

  const aPagamento = !!telefono && finestra !== null && !finestra.aperta

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Pulsante onClick={() => void esegui('approva')} inCorso={inCorso === 'approva'} disabled={inCorso !== null}>
          {aPagamento ? 'Approva (template)' : 'Approva'}
        </Pulsante>
        <Pulsante variante="pericolo" onClick={() => setRifiutoAperto(true)} disabled={inCorso !== null}>
          Rifiuta
        </Pulsante>
      </div>

      <Finestra
        aperta={rifiutoAperto}
        onChiudi={() => setRifiutoAperto(false)}
        titolo={`Rifiutare la richiesta di ${cliente}?`}
        piede={
          <>
            <Pulsante variante="secondario" onClick={() => setRifiutoAperto(false)}>
              Annulla
            </Pulsante>
            <Pulsante variante="pericolo" onClick={() => void esegui('rifiuta')} inCorso={inCorso === 'rifiuta'}>
              Rifiuta
            </Pulsante>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Voce etichetta="Motivo (facoltativo)" aiuto="Lo leggerà la cliente, es. «Quel giorno sono a un corso».">
            {(id) => <AreaTesto id={id} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />}
          </Voce>
          <p className="text-sm text-stone-600">
            {!telefono
              ? 'La cliente non ha un numero WhatsApp: avvisala tu.'
              : finestra?.aperta
                ? 'La cliente riceverà un messaggio gratuito con il pulsante per scegliere un altro orario.'
                : 'Sono passate più di 24 ore dal suo ultimo messaggio: non partirà nulla in automatico, ti daremo il link per scriverle dal tuo telefono.'}
          </p>
        </div>
      </Finestra>

    </>
  )
}
