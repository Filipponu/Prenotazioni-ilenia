'use client'

import type { ContatoreMessaggiMensile, Impostazioni } from '@ilenia/shared/tipi-db'
import { normalizzaTelefono, formattaTelefono } from '@ilenia/shared/telefono'
import { daIso, dataLunga } from '@ilenia/shared/tempo'
import { DateTime } from 'luxon'
import { useEffect, useState } from 'react'
import { useAvvisi } from '@/components/Avvisi'
import { AppENotifiche } from '@/components/impostazioni/AppENotifiche'
import { Caricamento, Campo, cx, Pulsante, Scelta, Scheda, TitoloPagina, Voce } from '@/components/ui'
import { messaggioErrore } from '@/lib/errori'
import { useOperatrice, useSessione } from '@/lib/sessione'
import { promemoriaDemo } from '@/lib/api'
import { modalitaDemo, supabase } from '@/lib/supabase'

/** Risposte libere gratuite al mese per numero (regole Meta dal 1/10/2026) */
const SOGLIA_GRATUITA = 1000

const OPZIONI_PREAVVISO = [
  [0, 'Nessuno'],
  [30, '30 minuti'],
  [60, '1 ora'],
  [120, '2 ore'],
  [180, '3 ore'],
  [240, '4 ore'],
  [360, '6 ore'],
  [720, '12 ore'],
  [1440, '24 ore'],
  [2880, '48 ore'],
] as const

function opzioniConValore(valore: number) {
  return OPZIONI_PREAVVISO.some(([v]) => v === valore)
    ? OPZIONI_PREAVVISO
    : ([...OPZIONI_PREAVVISO, [valore, `${valore} minuti`]] as const)
}

export default function PaginaImpostazioni() {
  const operatrice = useOperatrice()
  const { sessione, esci, aggiornaOperatrice } = useSessione()
  const avvisi = useAvvisi()
  const [imp, setImp] = useState<Impostazioni | null>(null)
  const [nome, setNome] = useState(operatrice.nome)
  const [contatore, setContatore] = useState<ContatoreMessaggiMensile | null | undefined>(undefined)
  const [numeroBot, setNumeroBot] = useState('')
  const [inCorso, setInCorso] = useState(false)
  /** promemoria come salvato nel database (il pulsante della demo usa quello) */
  const [promemoriaSalvato, setPromemoriaSalvato] = useState<Impostazioni['promemoria']>('disattivato')
  const [provaPromemoria, setProvaPromemoria] = useState(false)

  useEffect(() => {
    const sb = supabase()
    const mese = DateTime.utc().toFormat('yyyy-LL')
    void Promise.all([
      sb.from('impostazioni').select('*').eq('operatrice_id', operatrice.id).single(),
      sb.from('contatore_messaggi_mensile').select('*').eq('mese', mese).maybeSingle(),
    ]).then(([i, c]) => {
      if (i.error) avvisi.errore(messaggioErrore(i.error))
      else {
        setImp(i.data)
        setPromemoriaSalvato(i.data.promemoria)
        setNumeroBot(formattaTelefono(i.data.numero_whatsapp))
      }
      setContatore(c.data ?? null)
    })
  }, [operatrice.id, avvisi])

  function cambia<K extends keyof Impostazioni>(campo: K, valore: Impostazioni[K]) {
    setImp((p) => (p ? { ...p, [campo]: valore } : p))
  }

  async function salva(e: React.FormEvent) {
    e.preventDefault()
    if (!imp) return
    const numero = numeroBot.trim() ? normalizzaTelefono(numeroBot) : null
    if (numeroBot.trim() && !numero) {
      avvisi.errore('Numero WhatsApp del salone non valido (es. 333 123 4567).')
      return
    }
    setInCorso(true)
    const sb = supabase()
    const { operatrice_id: _id, creato_il: _c, aggiornato_il: _a, ...valori } = imp
    const risultati = await Promise.all([
      sb.from('impostazioni').update({
        ...valori,
        parola_operatore: valori.parola_operatore.trim().toLowerCase(),
        numero_whatsapp: numero,
        telefono_salone: valori.telefono_salone?.trim() || null,
        email_notifiche: valori.email_notifiche?.trim() || null,
      }).eq('operatrice_id', operatrice.id),
      nome.trim() && nome.trim() !== operatrice.nome
        ? sb.from('operatrici').update({ nome: nome.trim() }).eq('id', operatrice.id).select('*').single()
        : Promise.resolve(null),
    ])
    setInCorso(false)
    const errore = risultati[0].error ?? risultati[1]?.error
    if (errore) {
      avvisi.errore(messaggioErrore(errore))
      return
    }
    if (risultati[1]?.data) aggiornaOperatrice(risultati[1].data)
    setPromemoriaSalvato(imp.promemoria)
    avvisi.successo('Impostazioni salvate')
  }

  async function inviaPromemoriaDemo() {
    setProvaPromemoria(true)
    try {
      const r = await promemoriaDemo()
      if (!r.giorno) avvisi.errore('Nessun appuntamento confermato nei prossimi giorni senza promemoria.')
      else {
        const quando = dataLunga(daIso(r.giorno))
        const dove = promemoriaSalvato === 'email' ? 'Email simulate' : 'Messaggi visibili in «Prova il bot»'
        avvisi.successo(`Promemoria per ${quando}: ${r.inviati} inviati, ${r.saltati} senza contatto o non necessari. ${dove}; l'esito è in Agenda.`)
      }
    } catch (e) {
      avvisi.errore(messaggioErrore(e))
    } finally {
      setProvaPromemoria(false)
    }
  }

  if (!imp) return <Caricamento />

  return (
    <form onSubmit={salva}>
      <TitoloPagina
        titolo="Impostazioni"
        azioni={
          <Pulsante type="submit" inCorso={inCorso}>
            Salva
          </Pulsante>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <AppENotifiche />

        <Scheda>
          <h2 className="mb-4 text-lg font-semibold">Messaggi WhatsApp del mese</h2>
          <Contatore contatore={contatore} />
        </Scheda>

        <Scheda>
          <h2 className="mb-4 text-lg font-semibold">Profilo</h2>
          <div className="flex flex-col gap-4">
            <Voce etichetta="Il tuo nome" aiuto="Il bot si presenta come «l'assistente di …».">
              {(id) => <Campo id={id} maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />}
            </Voce>
            <Voce etichetta="Telefono del salone" aiuto="Lo diamo alle clienti quando una modifica è troppo vicina all'appuntamento.">
              {(id) => (
                <Campo
                  id={id}
                  type="tel"
                  maxLength={30}
                  value={imp.telefono_salone ?? ''}
                  onChange={(e) => cambia('telefono_salone', e.target.value)}
                />
              )}
            </Voce>
            <Voce
              etichetta="Email per le notifiche di riserva"
              aiuto="Se nessun dispositivo riceve le notifiche, ti scriviamo qui per nuove richieste, «operatore» e posti da proporre."
            >
              {(id) => (
                <Campo
                  id={id}
                  type="email"
                  value={imp.email_notifiche ?? ''}
                  onChange={(e) => cambia('email_notifiche', e.target.value)}
                />
              )}
            </Voce>
          </div>
        </Scheda>

        <Scheda>
          <h2 className="text-lg font-semibold">Prenotazioni su WhatsApp</h2>
          <p className="mb-4 text-sm text-stone-500">Come si comporta il bot con le clienti.</p>
          <div className="flex flex-col gap-4">
            <SceltaRadio
              etichetta="Approvazione delle richieste"
              valore={imp.approvazione}
              onCambia={(v) => cambia('approvazione', v)}
              opzioni={[
                ['manuale', 'Manuale', 'La richiesta resta in attesa finché non la approvi o rifiuti.'],
                ['automatica', 'Automatica', 'Se l\'orario è libero la prenotazione si conferma da sola.'],
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <Voce etichetta="Preavviso minimo" aiuto="Non si prenota per tra meno di…">
                {(id) => (
                  <Scelta
                    id={id}
                    value={imp.preavviso_minimo_prenotazione_min}
                    onChange={(e) => cambia('preavviso_minimo_prenotazione_min', Number(e.target.value))}
                  >
                    {opzioniConValore(imp.preavviso_minimo_prenotazione_min).map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </Scelta>
                )}
              </Voce>
              <Voce etichetta="Prenotabile fino a" aiuto="Giorni in avanti">
                {(id) => (
                  <Campo
                    id={id}
                    type="number"
                    min={1}
                    max={365}
                    value={imp.giorni_prenotabili}
                    onChange={(e) => cambia('giorni_prenotabili', Number(e.target.value))}
                  />
                )}
              </Voce>
              <Voce etichetta="Orari proposti ogni" aiuto="Es. 9:00, 9:30, 10:00…">
                {(id) => (
                  <Scelta id={id} value={imp.passo_slot_min} onChange={(e) => cambia('passo_slot_min', Number(e.target.value))}>
                    {[5, 10, 15, 20, 30, 60].map((m) => (
                      <option key={m} value={m}>
                        {m === 60 ? '1 ora' : `${m} minuti`}
                      </option>
                    ))}
                  </Scelta>
                )}
              </Voce>
              <Voce etichetta="Disdette e spostamenti" aiuto="Fino a quante ore prima">
                {(id) => (
                  <Campo
                    id={id}
                    type="number"
                    min={0}
                    max={336}
                    value={imp.ore_limite_modifica}
                    onChange={(e) => cambia('ore_limite_modifica', Number(e.target.value))}
                  />
                )}
              </Voce>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Voce etichetta="Parola per parlare con te" aiuto="Se la cliente la scrive, ti avvisiamo.">
                {(id) => (
                  <Campo
                    id={id}
                    maxLength={30}
                    value={imp.parola_operatore}
                    onChange={(e) => cambia('parola_operatore', e.target.value)}
                  />
                )}
              </Voce>
              <Voce etichetta="Bot in pausa per" aiuto="Ore dopo la richiesta">
                {(id) => (
                  <Campo
                    id={id}
                    type="number"
                    min={1}
                    max={168}
                    value={imp.ore_pausa_operatore}
                    onChange={(e) => cambia('ore_pausa_operatore', Number(e.target.value))}
                  />
                )}
              </Voce>
            </div>
          </div>
        </Scheda>

        <Scheda>
          <h2 className="text-lg font-semibold">Lista d&apos;attesa</h2>
          <p className="mb-4 text-sm text-stone-500">Quando una cliente disdice, proponiamo il posto a chi vuole anticipare.</p>
          <div className="flex flex-col gap-4">
            <SceltaRadio
              etichetta="Come avvisare le clienti"
              valore={imp.lista_attesa_modalita}
              onCambia={(v) => cambia('lista_attesa_modalita', v)}
              opzioni={[
                ['manuale', 'Manuale (gratis)', 'Ti mandiamo una notifica con il messaggio già scritto: lo invii tu da WhatsApp.'],
                ['automatica', 'Automatica (a pagamento)', 'Il bot scrive da solo; se la chat è chiusa usa un template a pagamento.'],
              ]}
            />
            <Voce
              etichetta="Numero WhatsApp del salone"
              aiuto="Il numero del bot (la SIM del salone). Nei messaggi manuali la cliente accetta con un tocco e il bot sposta da solo l'appuntamento."
            >
              {(id) => (
                <Campo id={id} type="tel" inputMode="tel" placeholder="es. 333 123 4567" value={numeroBot} onChange={(e) => setNumeroBot(e.target.value)} />
              )}
            </Voce>
            <div className="grid grid-cols-2 gap-3">
              <Voce etichetta="Tempo per rispondere" aiuto="Minuti, poi si passa alla successiva">
                {(id) => (
                  <Campo
                    id={id}
                    type="number"
                    min={1}
                    max={1440}
                    value={imp.lista_attesa_minuti_risposta}
                    onChange={(e) => cambia('lista_attesa_minuti_risposta', Number(e.target.value))}
                  />
                )}
              </Voce>
              <Voce etichetta="Non avvisare se manca meno di">
                {(id) => (
                  <Scelta
                    id={id}
                    value={imp.lista_attesa_preavviso_minimo_min}
                    onChange={(e) => cambia('lista_attesa_preavviso_minimo_min', Number(e.target.value))}
                  >
                    {opzioniConValore(imp.lista_attesa_preavviso_minimo_min).map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </Scelta>
                )}
              </Voce>
            </div>
          </div>
        </Scheda>

        <Scheda>
          <h2 className="text-lg font-semibold">Promemoria del giorno prima</h2>
          <p className="mb-4 text-sm text-stone-500">
            Alle clienti con un appuntamento confermato per il giorno dopo. Chi ha prenotato da meno di 2 ore non lo riceve.
          </p>
          <div className="flex flex-col gap-4">
            <SceltaRadio
              etichetta="Invio"
              valore={imp.promemoria}
              onCambia={(v) => cambia('promemoria', v)}
              opzioni={[
                ['disattivato', 'Disattivato', 'Nessun promemoria.'],
                ['email', 'Email (gratis)', 'Solo alle clienti con l\'email in anagrafica: il bot la chiede quando prenotano.'],
                ['template', 'WhatsApp (a pagamento)', 'Template WhatsApp (pochi centesimi l\'uno); gratis se la cliente ti ha scritto nelle ultime 24 ore.'],
              ]}
            />
            <Voce etichetta="Orario di invio" className="max-w-40">
              {(id) => (
                <Campo
                  id={id}
                  type="time"
                  step={300}
                  value={imp.ora_promemoria.slice(0, 5)}
                  onChange={(e) => cambia('ora_promemoria', e.target.value)}
                />
              )}
            </Voce>
            {modalitaDemo ? (
              <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                <p className="mb-2">
                  Demo: invece di aspettare l&apos;orario, manda subito i promemoria del prossimo giorno con appuntamenti
                  {promemoriaSalvato === 'disattivato' ? ' (prima scegli Email o WhatsApp e salva)' : ''}.
                </p>
                <Pulsante
                  piccolo
                  variante="secondario"
                  disabled={promemoriaSalvato === 'disattivato'}
                  inCorso={provaPromemoria}
                  onClick={() => void inviaPromemoriaDemo()}
                >
                  Invia ora i promemoria
                </Pulsante>
              </div>
            ) : null}
          </div>
        </Scheda>

        <Scheda>
          <h2 className="mb-2 text-lg font-semibold">Account</h2>
          <p className="text-sm text-stone-600">
            Accesso come <strong>{sessione.stato === 'pronta' ? sessione.session.user.email : ''}</strong>
          </p>
          <Pulsante className="mt-4" variante="secondario" onClick={() => void esci()}>
            Esci
          </Pulsante>
        </Scheda>
      </div>

      <div className="mt-6 flex justify-end">
        <Pulsante type="submit" inCorso={inCorso}>
          Salva impostazioni
        </Pulsante>
      </div>
    </form>
  )
}

function SceltaRadio<T extends string>({
  etichetta,
  valore,
  onCambia,
  opzioni,
}: {
  etichetta: string
  valore: T
  onCambia: (v: T) => void
  opzioni: ReadonlyArray<readonly [T, string, string]>
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-stone-700">{etichetta}</legend>
      <div className="flex flex-col gap-2">
        {opzioni.map(([v, titolo, descrizione]) => (
          <label
            key={v}
            className={cx(
              'flex cursor-pointer gap-3 rounded-xl p-3 ring-1',
              valore === v ? 'bg-brand-50 ring-brand-300' : 'bg-white ring-stone-200 hover:bg-stone-50',
            )}
          >
            <input
              type="radio"
              className="mt-1 accent-brand-600"
              checked={valore === v}
              onChange={() => onCambia(v)}
            />
            <span>
              <span className="block text-sm font-medium text-stone-900">{titolo}</span>
              <span className="block text-xs text-stone-500">{descrizione}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function Contatore({ contatore }: { contatore: ContatoreMessaggiMensile | null | undefined }) {
  if (contatore === undefined) return <Caricamento />
  const liberi = contatore?.liberi ?? 0
  const template = contatore?.template ?? 0
  const ricevuti = contatore?.ricevuti ?? 0
  const fatturati = contatore?.fatturati ?? 0
  const percentuale = Math.min(100, Math.round((liberi / SOGLIA_GRATUITA) * 100))
  const vicino = liberi >= SOGLIA_GRATUITA * 0.8
  const tessere: Array<[string, number, string]> = [
    ['Template', template, 'a pagamento'],
    ['Fatturati da Meta', fatturati, 'conteggio ufficiale'],
    ['Ricevuti', ricevuti, 'dalle clienti'],
  ]
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 flex items-baseline justify-between text-sm">
          <span className="font-medium text-stone-800">Risposte libere</span>
          <span className={vicino ? 'font-semibold text-red-700' : 'text-stone-600'}>
            {liberi.toLocaleString('it-IT')} / {SOGLIA_GRATUITA.toLocaleString('it-IT')} gratuite
          </span>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-stone-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={SOGLIA_GRATUITA}
          aria-valuenow={liberi}
          aria-label="Risposte libere usate questo mese"
        >
          <div className={cx('h-full rounded-full', vicino ? 'bg-red-500' : 'bg-brand-500')} style={{ width: `${percentuale}%` }} />
        </div>
        {vicino ? (
          <p className="mt-1 text-xs text-red-700">
            Oltre le 1.000 risposte del mese Meta le fa pagare; senza un metodo di pagamento sull&apos;account non le consegna.
          </p>
        ) : null}
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        {tessere.map(([titolo, valore, nota]) => (
          <div key={titolo} className="rounded-xl bg-stone-50 p-3">
            <dt className="text-xs text-stone-500">{titolo}</dt>
            <dd className="text-xl font-semibold text-stone-900 tabular-nums">{valore.toLocaleString('it-IT')}</dd>
            <dd className="text-[11px] text-stone-400">{nota}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-stone-500">
        Dal 1° del mese (ora UTC, come la fatturazione di Meta). Le prime 1.000 risposte consegnate sono gratuite per ogni numero;
        «Fatturati da Meta» è il dato che Meta invia con le conferme di consegna. Prezzi per l&apos;Italia:{' '}
        <a
          href="https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing#rate-cards-and-volume-tiers"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          listino di Meta
        </a>
        .
      </p>
    </div>
  )
}
