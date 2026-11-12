'use client'

import { useEffect } from 'react'
import { ascoltaInstallazione, registraServiceWorker } from '@/lib/pwa'

// fuori dal componente: l'evento di installazione può arrivare prima del montaggio
if (typeof window !== 'undefined') ascoltaInstallazione()

/** Registra il service worker (app installabile, notifiche push). */
export function AvvioPwa() {
  useEffect(() => registraServiceWorker(), [])
  return null
}
