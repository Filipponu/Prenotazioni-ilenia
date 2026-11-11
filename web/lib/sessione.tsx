'use client'

import type { Session } from '@supabase/supabase-js'
import type { Operatrice } from '@ilenia/shared/tipi-db'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { configurazioneMancante, supabase } from './supabase'

export type StatoSessione =
  | { stato: 'caricamento' }
  | { stato: 'configurazione_mancante' }
  | { stato: 'anonimo' }
  | { stato: 'non_abilitata'; session: Session }
  | { stato: 'pronta'; session: Session; operatrice: Operatrice }

type ValoreSessione = {
  sessione: StatoSessione
  /** true quando si arriva dal link "reimposta password" dell'email */
  recuperoPassword: boolean
  fineRecuperoPassword: () => void
  aggiornaOperatrice: (o: Operatrice) => void
  esci: () => Promise<void>
}

const ContestoSessione = createContext<ValoreSessione | null>(null)

export function FornitoreSessione({ children }: { children: React.ReactNode }) {
  const [sessione, setSessione] = useState<StatoSessione>({ stato: 'caricamento' })
  const [recuperoPassword, setRecuperoPassword] = useState(false)
  const utenteCaricato = useRef<string | null>(null)

  useEffect(() => {
    if (configurazioneMancante) {
      setSessione({ stato: 'configurazione_mancante' })
      return
    }
    const sb = supabase()
    let attivo = true

    async function carica(session: Session | null) {
      if (!session) {
        utenteCaricato.current = null
        setSessione({ stato: 'anonimo' })
        return
      }
      // stesso utente già caricato (es. rinnovo del token): aggiorno solo la sessione
      if (utenteCaricato.current === session.user.id) {
        setSessione((s) => (s.stato === 'pronta' ? { ...s, session } : s))
        return
      }
      const { data, error } = await sb
        .from('operatrici')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (!attivo) return
      utenteCaricato.current = session.user.id
      if (error || !data) setSessione({ stato: 'non_abilitata', session })
      else setSessione({ stato: 'pronta', session, operatrice: data })
    }

    const { data: iscrizione } = sb.auth.onAuthStateChange((evento, session) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperoPassword(true)
      // niente await dentro il callback di Supabase: si rimanda al giro successivo
      setTimeout(() => {
        if (attivo) void carica(session)
      }, 0)
    })

    return () => {
      attivo = false
      iscrizione.subscription.unsubscribe()
    }
  }, [])

  const esci = useCallback(async () => {
    await supabase().auth.signOut()
    utenteCaricato.current = null
    setSessione({ stato: 'anonimo' })
  }, [])

  const aggiornaOperatrice = useCallback((operatrice: Operatrice) => {
    setSessione((s) => (s.stato === 'pronta' ? { ...s, operatrice } : s))
  }, [])

  const valore = useMemo<ValoreSessione>(
    () => ({
      sessione,
      recuperoPassword,
      fineRecuperoPassword: () => setRecuperoPassword(false),
      aggiornaOperatrice,
      esci,
    }),
    [sessione, recuperoPassword, aggiornaOperatrice, esci],
  )

  return <ContestoSessione.Provider value={valore}>{children}</ContestoSessione.Provider>
}

export function useSessione(): ValoreSessione {
  const v = useContext(ContestoSessione)
  if (!v) throw new Error('useSessione fuori da FornitoreSessione')
  return v
}

/** L'operatrice collegata (solo nelle pagine del pannello, dopo il login). */
export function useOperatrice(): Operatrice {
  const { sessione } = useSessione()
  if (sessione.stato !== 'pronta') throw new Error('Operatrice non disponibile')
  return sessione.operatrice
}
