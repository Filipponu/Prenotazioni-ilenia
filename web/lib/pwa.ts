'use client'

/**
 * App installabile e notifiche push nel browser.
 * Il service worker (public/sw.js) si registra solo nel sito vero, non in
 * sviluppo né nella demo.
 */
import { daB64url } from '@ilenia/shared/notifiche/webpush'
import { modalitaDemo, supabase } from './supabase'

const CHIAVE_VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

// ---------------------------------------------------------------- service worker
const usaServiceWorker = () =>
  !modalitaDemo && process.env.NODE_ENV === 'production' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator

export function registraServiceWorker() {
  if (!usaServiceWorker()) return
  navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Service worker non registrato', e))
}

// ---------------------------------------------------------------- installazione
interface EventoInstallazione extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let richiestaInstallazione: EventoInstallazione | null = null
const ascoltatori = new Set<() => void>()
const avvisa = () => ascoltatori.forEach((f) => f())

/** Da chiamare subito all'avvio: Chrome offre l'installazione una sola volta per pagina. */
export function ascoltaInstallazione() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    richiestaInstallazione = e as EventoInstallazione
    avvisa()
  })
  window.addEventListener('appinstalled', () => {
    richiestaInstallazione = null
    avvisa()
  })
}

export function suCambioInstallazione(f: () => void) {
  ascoltatori.add(f)
  return () => void ascoltatori.delete(f)
}

export type StatoInstallazione = 'installata' | 'pronta' | 'ios' | 'manuale'

export function statoInstallazione(): StatoInstallazione {
  if (appInstallata()) return 'installata'
  if (richiestaInstallazione) return 'pronta'
  if (suIos()) return 'ios'
  return 'manuale'
}

/** Mostra la finestra «Installa app» del browser. */
export async function installa(): Promise<boolean> {
  const r = richiestaInstallazione
  if (!r) return false
  await r.prompt()
  const { outcome } = await r.userChoice
  richiestaInstallazione = null
  avvisa()
  return outcome === 'accepted'
}

export function appInstallata(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

export function suIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// ---------------------------------------------------------------- notifiche push
export type StatoNotifiche =
  | 'demo'
  | 'non_configurate' // manca la chiave VAPID nel pannello
  | 'ios_da_installare' // su iPhone le notifiche arrivano solo all'app aggiunta alla schermata Home
  | 'non_supportate'
  | 'bloccate' // permesso negato: si riattiva dalle impostazioni del browser
  | 'spente'
  | 'attive'

async function registrazione(): Promise<ServiceWorkerRegistration | null> {
  if (!usaServiceWorker()) return null // in sviluppo non c'è: niente attese infinite
  const r = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'))
  return r ? navigator.serviceWorker.ready : null
}

export async function statoNotifiche(): Promise<StatoNotifiche> {
  if (modalitaDemo) return 'demo'
  if (!CHIAVE_VAPID) return 'non_configurate'
  const supportate = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!supportate) return suIos() && !appInstallata() ? 'ios_da_installare' : 'non_supportate'
  if (Notification.permission === 'denied') return 'bloccate'
  const reg = await registrazione()
  if (!reg) return 'non_supportate'
  const sott = await reg.pushManager.getSubscription()
  return sott && Notification.permission === 'granted' ? 'attive' : 'spente'
}

/** Salva l'abbonamento di questo dispositivo (se manca nel database). */
async function salva(operatriceId: string, sott: PushSubscription) {
  const j = sott.toJSON()
  if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) throw new Error('Abbonamento push incompleto')
  const sb = supabase()
  const { data: esiste } = await sb.from('push_iscrizioni').select('id').eq('endpoint', j.endpoint).maybeSingle()
  if (esiste) return
  const { error } = await sb.from('push_iscrizioni').insert({
    operatrice_id: operatriceId,
    endpoint: j.endpoint,
    p256dh: j.keys.p256dh,
    auth: j.keys.auth,
    user_agent: navigator.userAgent.slice(0, 300),
  })
  if (error) throw error
}

export class ErroreNotifiche extends Error {}

export async function attivaNotifiche(operatriceId: string) {
  const permesso = await Notification.requestPermission()
  if (permesso !== 'granted') {
    throw new ErroreNotifiche(
      permesso === 'denied'
        ? 'Hai bloccato le notifiche: riattivale dalle impostazioni del browser (icona del lucchetto accanto all\'indirizzo).'
        : 'Per ricevere gli avvisi devi consentire le notifiche.',
    )
  }
  const reg = await registrazione()
  if (!reg) throw new ErroreNotifiche('Questo browser non gestisce le notifiche push.')
  const sott =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: daB64url(CHIAVE_VAPID) }))
  await salva(operatriceId, sott)
}

/** All'apertura del pannello: se il browser è abbonato ma il database l'ha perso, lo risalva. */
export async function sincronizzaNotifiche(operatriceId: string) {
  if ((await statoNotifiche()) !== 'attive') return
  const sott = await (await registrazione())?.pushManager.getSubscription()
  if (sott) await salva(operatriceId, sott)
}

export async function disattivaNotifiche() {
  const sott = await (await registrazione())?.pushManager.getSubscription()
  if (!sott) return
  await supabase().from('push_iscrizioni').delete().eq('endpoint', sott.endpoint)
  await sott.unsubscribe()
}
