/**
 * Sostituto di next/navigation per la versione in un solo file:
 * i percorsi diventano nomi nel #hash (es. /agenda/ ↔ #agenda).
 */
import { useSyncExternalStore } from 'react'

export function hashDaPercorso(percorso: string): string {
  return percorso.replace(/^\/+|\/+$/g, '')
}

function percorsoAttuale(): string {
  const nome = window.location.hash.replace(/^#/, '')
  return nome ? `/${nome}/` : '/'
}

function iscrivi(avvisa: () => void) {
  window.addEventListener('hashchange', avvisa)
  return () => window.removeEventListener('hashchange', avvisa)
}

function vai(percorso: string, sostituisci: boolean) {
  const hash = `#${hashDaPercorso(percorso)}`
  if (window.location.hash === hash) return
  try {
    if (sostituisci) {
      history.replaceState(null, '', hash)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
      return
    }
  } catch {
    // alcuni contesti incorporati non permettono replaceState
  }
  window.location.hash = hash
}

const router = {
  push: (p: string) => vai(p, false),
  replace: (p: string) => vai(p, true),
  back: () => history.back(),
  forward: () => history.forward(),
  refresh: () => undefined,
  prefetch: () => undefined,
}

export function useRouter() {
  return router
}

export function usePathname(): string {
  return useSyncExternalStore(iscrivi, percorsoAttuale, () => '/')
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams()
}
