'use client'

import { formattaTelefono } from '@ilenia/shared/telefono'
import { useEffect, useState } from 'react'
import { Scheda } from '@/components/ui'
import { BASE_API } from '@/lib/configurazione'

interface Info {
  nome: string | null
  telefono: string | null
  whatsapp: string | null
  email: string | null
}

/**
 * Informativa privacy pubblica (serve a Meta per attivare il numero WhatsApp
 * e alle clienti). Nome e contatti arrivano dalle Impostazioni del pannello.
 * Testo di base: va riletto da chi conosce l'attività prima di pubblicarlo.
 */
export default function Privacy() {
  const [info, setInfo] = useState<Info | null>(null)
  useEffect(() => {
    fetch(`${BASE_API}/api/info`)
      .then((r) => (r.ok ? (r.json() as Promise<Info>) : null))
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [])

  const titolare = info?.nome ? `${info.nome} (titolare del salone)` : 'la titolare del salone'
  const contatti = [
    info?.telefono ? `telefono ${info.telefono}` : null,
    info?.whatsapp ? `WhatsApp ${formattaTelefono(info.whatsapp)}` : null,
    info?.email ? `email ${info.email}` : null,
  ].filter(Boolean)

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-medium tracking-wide text-brand-700 uppercase">Prenotazioni</p>
      <h1 className="mb-6 text-2xl font-semibold">Informativa sulla privacy</h1>
      <Scheda>
        <div className="flex flex-col gap-5 text-sm leading-relaxed text-stone-700 [&_h2]:mb-1 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-stone-900">
          <section>
            <h2>Chi tratta i tuoi dati</h2>
            <p>
              Il titolare del trattamento è {titolare}
              {contatti.length ? `, contattabile a: ${contatti.join(', ')}` : ''}.
            </p>
          </section>
          <section>
            <h2>Quali dati</h2>
            <p>
              Nome, numero di telefono WhatsApp, email (solo se la indichi), appuntamenti e servizi richiesti, messaggi
              scambiati con il servizio di prenotazione.
            </p>
          </section>
          <section>
            <h2>Perché</h2>
            <p>
              Solo per gestire le prenotazioni: richieste, conferme, spostamenti, disdette, promemoria del giorno prima e,
              se lo chiedi, la proposta di anticipare l&apos;appuntamento quando si libera un posto. La base giuridica è
              l&apos;esecuzione del servizio che richiedi (art. 6.1.b del Regolamento UE 2016/679). Niente pubblicità, niente
              cessione a terzi per altri scopi.
            </p>
          </section>
          <section>
            <h2>Chi altro li vede</h2>
            <p>
              Fornitori tecnici che li trattano per conto del salone: Meta (WhatsApp Business), Supabase (archivio dati,
              server nell&apos;Unione Europea), Cloudflare (sito e servizio di prenotazione) e Resend (email, se usate).
              Quando un fornitore tratta dati fuori dall&apos;UE si applicano le garanzie previste dal Regolamento (clausole
              contrattuali standard o EU-US Data Privacy Framework).
            </p>
          </section>
          <section>
            <h2>Per quanto tempo</h2>
            <p>
              Finché sei cliente del salone e per il tempo necessario agli obblighi di legge. Puoi chiedere in qualsiasi
              momento la cancellazione.
            </p>
          </section>
          <section>
            <h2>I tuoi diritti</h2>
            <p>
              Puoi chiedere di vedere, correggere o cancellare i tuoi dati, limitarne o opporti al trattamento e riceverne
              una copia: scrivi «operatore» su WhatsApp o usa i contatti qui sopra. Puoi anche presentare reclamo al
              Garante per la protezione dei dati personali (garanteprivacy.it).
            </p>
          </section>
        </div>
      </Scheda>
    </main>
  )
}
