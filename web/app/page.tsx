'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Caricamento } from '@/components/ui'
import { useSessione } from '@/lib/sessione'

/** Pagina iniziale: smista verso l'agenda o il login. */
export default function Inizio() {
  const { sessione } = useSessione()
  const router = useRouter()

  useEffect(() => {
    if (sessione.stato === 'caricamento') return
    router.replace(sessione.stato === 'pronta' ? '/agenda/' : '/login/')
  }, [sessione.stato, router])

  return <Caricamento />
}
