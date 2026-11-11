/** Sostituto di next/dynamic: React.lazy + Suspense. */
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'

type Modulo<P> = { default: ComponentType<P> } | ComponentType<P>

export default function dynamic<P extends object>(
  carica: () => Promise<Modulo<P>>,
  opzioni?: { loading?: () => ReactNode; ssr?: boolean },
) {
  const Pigro = lazy(async () => {
    const m = await carica()
    return 'default' in m ? m : { default: m }
  })
  return function Dinamico(props: P) {
    return (
      <Suspense fallback={opzioni?.loading?.() ?? null}>
        <Pigro {...props} />
      </Suspense>
    )
  }
}
