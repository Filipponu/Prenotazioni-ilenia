/**
 * Punto d'ingresso della versione dimostrativa in un solo file HTML.
 * Usa le stesse pagine e gli stessi componenti del pannello vero.
 */
import { createRoot } from 'react-dom/client'
import { usePathname } from 'next/navigation'
import LayoutPannello from '@/app/(pannello)/layout'
import PaginaAgenda from '@/app/(pannello)/agenda/page'
import PaginaClienti from '@/app/(pannello)/clienti/page'
import PaginaImpostazioni from '@/app/(pannello)/impostazioni/page'
import PaginaOrari from '@/app/(pannello)/orari/page'
import PaginaServizi from '@/app/(pannello)/servizi/page'
import Login from '@/app/login/page'
import Inizio from '@/app/page'
import { FornitoreAvvisi } from '@/components/Avvisi'
import { FornitoreConferma } from '@/components/Conferma'
import { FornitoreSessione } from '@/lib/sessione'

const PAGINE: Record<string, () => React.JSX.Element> = {
  '/agenda/': PaginaAgenda,
  '/clienti/': PaginaClienti,
  '/servizi/': PaginaServizi,
  '/orari/': PaginaOrari,
  '/impostazioni/': PaginaImpostazioni,
}

function App() {
  const percorso = usePathname()
  if (percorso === '/login/') return <Login />
  const Pagina = PAGINE[percorso]
  if (!Pagina) return <Inizio />
  return (
    <LayoutPannello>
      <Pagina />
    </LayoutPannello>
  )
}

const radice = document.getElementById('app')
if (radice) {
  createRoot(radice).render(
    <FornitoreAvvisi>
      <FornitoreConferma>
        <FornitoreSessione>
          <App />
        </FornitoreSessione>
      </FornitoreConferma>
    </FornitoreAvvisi>,
  )
}
