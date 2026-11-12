import type { Metadata, Viewport } from 'next'
import { AvvioPwa } from '@/components/AvvioPwa'
import { FornitoreAvvisi } from '@/components/Avvisi'
import { FornitoreConferma } from '@/components/Conferma'
import { FornitoreLinkWhatsApp } from '@/components/LinkWhatsApp'
import { FornitoreSessione } from '@/lib/sessione'
import './globals.css'

export const metadata: Metadata = {
  title: 'Prenotazioni Ilenia',
  description: 'Agenda e prenotazioni del salone',
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icone/favicon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: [{ url: '/icone/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: 'Prenotazioni', statusBarStyle: 'default' },
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
        <AvvioPwa />
        <FornitoreAvvisi>
          <FornitoreConferma>
            <FornitoreLinkWhatsApp>
              <FornitoreSessione>{children}</FornitoreSessione>
            </FornitoreLinkWhatsApp>
          </FornitoreConferma>
        </FornitoreAvvisi>
      </body>
    </html>
  )
}
