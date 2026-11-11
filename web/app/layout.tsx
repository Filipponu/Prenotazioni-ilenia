import type { Metadata, Viewport } from 'next'
import { FornitoreAvvisi } from '@/components/Avvisi'
import { FornitoreConferma } from '@/components/Conferma'
import { FornitoreSessione } from '@/lib/sessione'
import './globals.css'

export const metadata: Metadata = {
  title: 'Prenotazioni Ilenia',
  description: 'Agenda e prenotazioni del salone',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#b3305e',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="min-h-dvh antialiased">
        <FornitoreAvvisi>
          <FornitoreConferma>
            <FornitoreSessione>{children}</FornitoreSessione>
          </FornitoreConferma>
        </FornitoreAvvisi>
      </body>
    </html>
  )
}
