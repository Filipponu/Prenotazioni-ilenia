/** Sostituto di next/link: link interni come #nome. */
import type { AnchorHTMLAttributes } from 'react'
import { hashDaPercorso } from './next-navigation'

export default function Link({
  href,
  children,
  ...resto
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) {
  const { prefetch: _ignora, ...attributi } = resto as typeof resto & { prefetch?: boolean }
  return (
    <a href={`#${hashDaPercorso(href)}`} {...attributi}>
      {children}
    </a>
  )
}
