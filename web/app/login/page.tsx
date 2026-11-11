'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAvvisi } from '@/components/Avvisi'
import { Campo, Pulsante, Scheda, Voce } from '@/components/ui'
import { useSessione } from '@/lib/sessione'
import { configurazioneMancante, supabase } from '@/lib/supabase'

export default function Login() {
  const { sessione, recuperoPassword, fineRecuperoPassword } = useSessione()
  const router = useRouter()
  const avvisi = useAvvisi()
  const [modo, setModo] = useState<'accesso' | 'dimenticata'>('accesso')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nuovaPassword, setNuovaPassword] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [emailInviata, setEmailInviata] = useState(false)

  useEffect(() => {
    if (sessione.stato === 'pronta' && !recuperoPassword) router.replace('/agenda/')
  }, [sessione.stato, recuperoPassword, router])

  async function accedi(e: React.FormEvent) {
    e.preventDefault()
    setErrore(null)
    setInCorso(true)
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password })
    setInCorso(false)
    if (error) {
      setErrore(
        error.message.toLowerCase().includes('invalid')
          ? 'Email o password non corretti.'
          : `Accesso non riuscito: ${error.message}`,
      )
    }
  }

  async function inviaRecupero(e: React.FormEvent) {
    e.preventDefault()
    setErrore(null)
    setInCorso(true)
    const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login/`,
    })
    setInCorso(false)
    if (error) setErrore(`Invio non riuscito: ${error.message}`)
    else setEmailInviata(true)
  }

  async function salvaNuovaPassword(e: React.FormEvent) {
    e.preventDefault()
    if (nuovaPassword.length < 8) {
      setErrore('La password deve avere almeno 8 caratteri.')
      return
    }
    setErrore(null)
    setInCorso(true)
    const { error } = await supabase().auth.updateUser({ password: nuovaPassword })
    setInCorso(false)
    if (error) {
      setErrore(`Salvataggio non riuscito: ${error.message}`)
      return
    }
    avvisi.successo('Password aggiornata')
    fineRecuperoPassword()
    router.replace('/agenda/')
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <p className="text-xs font-medium tracking-wide text-brand-600 uppercase">Prenotazioni</p>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">Ilenia</h1>
      </div>

      <Scheda>
        {configurazioneMancante ? (
          <p className="text-sm text-red-700">
            Configurazione mancante: imposta <code>NEXT_PUBLIC_SUPABASE_URL</code> e{' '}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> in <code>web/.env.local</code>.
          </p>
        ) : recuperoPassword ? (
          <form onSubmit={salvaNuovaPassword} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Scegli una nuova password</h2>
            <Voce etichetta="Nuova password" aiuto="Almeno 8 caratteri.">
              {(id) => (
                <Campo
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  value={nuovaPassword}
                  onChange={(e) => setNuovaPassword(e.target.value)}
                  required
                />
              )}
            </Voce>
            {errore ? <p className="text-sm text-red-700">{errore}</p> : null}
            <Pulsante type="submit" inCorso={inCorso}>
              Salva password
            </Pulsante>
          </form>
        ) : modo === 'accesso' ? (
          <form onSubmit={accedi} className="flex flex-col gap-4">
            <Voce etichetta="Email">
              {(id) => (
                <Campo
                  id={id}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              )}
            </Voce>
            <Voce etichetta="Password">
              {(id) => (
                <Campo
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              )}
            </Voce>
            {errore ? <p className="text-sm text-red-700">{errore}</p> : null}
            <Pulsante type="submit" inCorso={inCorso}>
              Accedi
            </Pulsante>
            <button
              type="button"
              className="text-sm text-stone-500 underline-offset-2 hover:underline"
              onClick={() => {
                setModo('dimenticata')
                setErrore(null)
              }}
            >
              Password dimenticata?
            </button>
          </form>
        ) : (
          <form onSubmit={inviaRecupero} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Recupera la password</h2>
            {emailInviata ? (
              <p className="text-sm text-stone-600">
                Se l&apos;indirizzo è registrato, riceverai un&apos;email con il link per scegliere una nuova
                password.
              </p>
            ) : (
              <>
                <Voce etichetta="Email">
                  {(id) => (
                    <Campo
                      id={id}
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  )}
                </Voce>
                {errore ? <p className="text-sm text-red-700">{errore}</p> : null}
                <Pulsante type="submit" inCorso={inCorso}>
                  Invia link
                </Pulsante>
              </>
            )}
            <button
              type="button"
              className="text-sm text-stone-500 underline-offset-2 hover:underline"
              onClick={() => {
                setModo('accesso')
                setEmailInviata(false)
                setErrore(null)
              }}
            >
              Torna all&apos;accesso
            </button>
          </form>
        )}
      </Scheda>
    </div>
  )
}
