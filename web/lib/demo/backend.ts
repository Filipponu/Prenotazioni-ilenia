/**
 * "Supabase finto" che gira nel browser, per la versione dimostrativa.
 *
 * Risponde alle stesse chiamate HTTP che supabase-js fa ad Auth e a
 * PostgREST (solo il sottoinsieme usato dal pannello) e simula i vincoli
 * principali del database: sovrapposizioni (23P01), servizio in uso
 * (23503), telefono duplicato (23505). I dati restano nel browser.
 */
import { chiaveSettimana, creaDatiDemo, EMAIL_DEMO, ID_OPERATRICE, ID_UTENTE, PASSWORD_DEMO, type DbDemo, type Riga } from './dati'

const CHIAVE_DATI = 'ilenia-demo-dati-v1'
const CHIAVE_SETTIMANA = 'ilenia-demo-settimana-v1'

// caricati alla prima richiesta (non all'import, che avviene anche durante la build)
let db: DbDemo = {}
let caricato = false

function carica(): DbDemo {
  try {
    const salvati = localStorage.getItem(CHIAVE_DATI)
    if (salvati && localStorage.getItem(CHIAVE_SETTIMANA) === chiaveSettimana()) return JSON.parse(salvati) as DbDemo
  } catch {
    // archivio del browser non disponibile: si lavora solo in memoria
  }
  const nuovi = creaDatiDemo()
  salva(nuovi)
  return nuovi
}

function salva(dati: DbDemo = db) {
  try {
    localStorage.setItem(CHIAVE_DATI, JSON.stringify(dati))
    localStorage.setItem(CHIAVE_SETTIMANA, chiaveSettimana())
  } catch {
    // niente: la demo funziona lo stesso, ma non ricorda le modifiche
  }
}

/** Rimette i dati di esempio iniziali. */
export function ripristinaDemo() {
  db = creaDatiDemo()
  caricato = true
  salva()
}

// ---------------------------------------------------------------------
// Query in stile PostgREST
// ---------------------------------------------------------------------
const FK: Record<string, string> = { clienti: 'cliente_id', servizi: 'servizio_id', operatrici: 'operatrice_id' }
const PARAMETRI_SPECIALI = new Set(['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'])

function dividi(testo: string): string[] {
  const parti: string[] = []
  let livello = 0
  let corrente = ''
  for (const c of testo) {
    if (c === '(') livello++
    if (c === ')') livello--
    if (c === ',' && livello === 0) {
      parti.push(corrente)
      corrente = ''
    } else corrente += c
  }
  if (corrente) parti.push(corrente)
  return parti.map((p) => p.trim())
}

function confronta(a: unknown, b: string): number {
  if (typeof a === 'number') return a - Number(b)
  const sa = String(a)
  if (/^\d{4}-\d\d-\d\dT/.test(sa) && /^\d{4}-\d\d-\d\dT/.test(b)) return Date.parse(sa) - Date.parse(b)
  return sa.localeCompare(b)
}

function condizione(colonna: string, espressione: string): (r: Riga) => boolean {
  const [op, ...resto] = espressione.split('.')
  const valore = resto.join('.')
  return (r) => {
    const v = r[colonna]
    switch (op) {
      case 'eq':
        return String(v) === valore
      case 'neq':
        return String(v) !== valore
      case 'lt':
        return v != null && confronta(v, valore) < 0
      case 'lte':
        return v != null && confronta(v, valore) <= 0
      case 'gt':
        return v != null && confronta(v, valore) > 0
      case 'gte':
        return v != null && confronta(v, valore) >= 0
      case 'in':
        return valore
          .slice(1, -1)
          .split(',')
          .map((x) => x.replace(/^"|"$/g, ''))
          .includes(String(v))
      case 'ilike': {
        const re = new RegExp(
          '^' + valore.split(/[%*]/).map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$',
          'i',
        )
        return v != null && re.test(String(v))
      }
      case 'is':
        return valore === 'null' ? v == null : String(v) === valore
      default:
        throw new Error(`Filtro non gestito nella demo: ${op}`)
    }
  }
}

function filtro(parametri: URLSearchParams): (r: Riga) => boolean {
  const condizioni: Array<(r: Riga) => boolean> = []
  for (const [chiave, valore] of parametri) {
    if (PARAMETRI_SPECIALI.has(chiave)) continue
    if (chiave === 'or') {
      const alternative = dividi(valore.slice(1, -1)).map((p) => {
        const [c, ...r] = p.split('.')
        return condizione(c ?? '', r.join('.'))
      })
      condizioni.push((r) => alternative.some((f) => f(r)))
    } else condizioni.push(condizione(chiave, valore))
  }
  return (r) => condizioni.every((f) => f(r))
}

function proietta(riga: Riga, select: string | null): Riga {
  if (!select || select === '*') return { ...riga }
  const out: Riga = {}
  for (const parte of dividi(select)) {
    const m = /^(\w+)\((.*)\)$/.exec(parte)
    if (m) {
      const tabella = m[1]!
      const collegata = (db[tabella] ?? []).find((x) => x.id === riga[FK[tabella] ?? ''])
      out[tabella] = collegata ? proietta(collegata, m[2]!) : null
    } else if (parte === '*') Object.assign(out, riga)
    else out[parte] = riga[parte]
  }
  return out
}

function ordina(righe: Riga[], ordini: string[]): Riga[] {
  if (ordini.length === 0) return righe
  return [...righe].sort((a, b) => {
    for (const o of ordini) {
      const [col = '', verso = 'asc'] = o.split('.')
      const va = a[col]
      const vb = b[col]
      const c = va == null ? (vb == null ? 0 : 1) : vb == null ? -1 : confronta(va, String(vb))
      if (c !== 0) return verso === 'desc' ? -c : c
    }
    return 0
  })
}

// ---------------------------------------------------------------------
// Vincoli del database
// ---------------------------------------------------------------------
class ErrorePg extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

const ATTIVI = ['in_attesa', 'confermato']

function verifica(tabella: string, riga: Riga, id: string | undefined) {
  if (tabella === 'appuntamenti') {
    const inizio = Date.parse(String(riga.inizio))
    const fine = Date.parse(String(riga.fine))
    if (!(fine > inizio)) throw new ErrorePg('23514', 'violates check constraint "appuntamenti_fine_dopo_inizio"')
    if (ATTIVI.includes(String(riga.stato))) {
      const conflitto = (db.appuntamenti ?? []).some(
        (a) =>
          a.id !== id &&
          a.operatrice_id === riga.operatrice_id &&
          ATTIVI.includes(String(a.stato)) &&
          Date.parse(String(a.inizio)) < fine &&
          inizio < Date.parse(String(a.fine)),
      )
      if (conflitto) {
        throw new ErrorePg('23P01', 'conflicting key value violates exclusion constraint "appuntamenti_no_sovrapposizioni"')
      }
    }
  }
  if (tabella === 'clienti' && riga.telefono) {
    if ((db.clienti ?? []).some((c) => c.id !== id && c.telefono === riga.telefono)) {
      throw new ErrorePg('23505', 'duplicate key value violates unique constraint "clienti_telefono_key"')
    }
  }
}

// ---------------------------------------------------------------------
// Auth finta
// ---------------------------------------------------------------------
function base64url(oggetto: unknown): string {
  const json = JSON.stringify(oggetto)
  const bytes = new TextEncoder().encode(json)
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sessione() {
  const ora = Math.floor(Date.now() / 1000)
  const scadenza = ora + 30 * 24 * 3600
  const user = {
    id: ID_UTENTE,
    aud: 'authenticated',
    role: 'authenticated',
    email: EMAIL_DEMO,
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: new Date().toISOString(),
  }
  const token = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({
    sub: ID_UTENTE,
    role: 'authenticated',
    aud: 'authenticated',
    email: EMAIL_DEMO,
    iat: ora,
    exp: scadenza,
  })}.demo`
  return {
    access_token: token,
    token_type: 'bearer',
    expires_in: scadenza - ora,
    expires_at: scadenza,
    refresh_token: `demo-${ora}`,
    user,
  }
}

// ---------------------------------------------------------------------
// fetch finto, da passare a createClient({ global: { fetch } })
// ---------------------------------------------------------------------
function risposta(stato: number, corpo?: unknown): Response {
  return new Response(corpo === undefined || stato === 204 ? null : JSON.stringify(corpo), {
    status: stato,
    headers: { 'content-type': 'application/json' },
  })
}

export async function fetchDemo(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!caricato) {
    db = carica()
    caricato = true
  }
  const indirizzo = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const url = new URL(indirizzo)
  const metodo = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const intestazioni = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  const testo = typeof init?.body === 'string' ? init.body : undefined
  const corpo = testo ? (JSON.parse(testo) as unknown) : undefined

  // piccola attesa per sembrare una rete vera
  await new Promise((r) => setTimeout(r, 60))

  // ----- Auth
  if (url.pathname.startsWith('/auth/v1/')) {
    if (url.pathname === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'password') {
        const c = corpo as { email?: string; password?: string }
        if (c.email?.trim().toLowerCase() !== EMAIL_DEMO || c.password !== PASSWORD_DEMO) {
          return risposta(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
        }
      }
      return risposta(200, sessione())
    }
    if (url.pathname === '/auth/v1/user') return risposta(200, sessione().user)
    if (url.pathname === '/auth/v1/logout') return risposta(204)
    return risposta(200, {})
  }

  // ----- Dati
  const m = /^\/rest\/v1\/(rpc\/)?(\w+)$/.exec(url.pathname)
  if (!m) return risposta(404, { message: 'Percorso non gestito nella demo' })
  const [, rpc, nome = ''] = m
  const oggetto = (intestazioni.get('accept') ?? '').includes('vnd.pgrst.object')
  const rappresentazione = (intestazioni.get('prefer') ?? '').includes('return=representation')
  const select = url.searchParams.get('select')
  const adessoIso = new Date().toISOString()

  try {
    if (rpc) {
      if (nome !== 'salva_orari_settimanali') return risposta(404, { message: 'Funzione non gestita nella demo' })
      const fasce = (corpo as { fasce: Array<{ giorno: number; ora_inizio: string; ora_fine: string }> }).fasce
      db.orari_settimanali = fasce.map((f, i) => ({
        id: `o-${Date.now()}-${i}`,
        operatrice_id: ID_OPERATRICE,
        giorno: f.giorno,
        ora_inizio: f.ora_inizio.length === 5 ? `${f.ora_inizio}:00` : f.ora_inizio,
        ora_fine: f.ora_fine.length === 5 ? `${f.ora_fine}:00` : f.ora_fine,
        creato_il: adessoIso,
        aggiornato_il: adessoIso,
      }))
      salva()
      return risposta(200, db.orari_settimanali)
    }

    const tabella = db[nome]
    if (!tabella) return risposta(404, { message: `Tabella ${nome} non gestita nella demo` })
    const corrisponde = filtro(url.searchParams)

    if (metodo === 'GET') {
      let righe = ordina(tabella.filter(corrisponde), url.searchParams.getAll('order'))
      const limite = url.searchParams.get('limit')
      if (limite) righe = righe.slice(0, Number(limite))
      const out = righe.map((r) => proietta(r, select))
      if (oggetto) {
        return out.length === 1
          ? risposta(200, out[0])
          : risposta(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })
      }
      return risposta(200, out)
    }

    if (metodo === 'POST') {
      const lista = (Array.isArray(corpo) ? corpo : [corpo]) as Riga[]
      const predefiniti: Record<string, Riga> = {
        servizi: { attivo: true, ordine: 0, prezzo: null },
        clienti: { nome: null, telefono: null, email: null, note: null },
        appuntamenti: {
          stato: 'in_attesa',
          origine: 'pannello',
          note: null,
          servizio_id: null,
          motivo_rifiuto: null,
          conferma_via_template: false,
          promemoria_inviato_il: null,
        },
        chiusure: { motivo: null },
      }
      const nuove = lista.map((x) => ({
        id: crypto.randomUUID(),
        ...(predefiniti[nome] ?? {}),
        ...x,
        creato_il: adessoIso,
        aggiornato_il: adessoIso,
      }))
      for (const n of nuove) verifica(nome, n, n.id)
      tabella.push(...nuove)
      salva()
      if (!rappresentazione) return risposta(201)
      const out = nuove.map((r) => proietta(r, select))
      return risposta(201, oggetto ? out[0] : out)
    }

    if (metodo === 'PATCH') {
      const colpite = tabella.filter(corrisponde)
      for (const r of colpite) verifica(nome, { ...r, ...(corpo as Riga) }, r.id)
      for (const r of colpite) Object.assign(r, corpo, { aggiornato_il: adessoIso })
      salva()
      if (!rappresentazione) return risposta(204)
      const out = colpite.map((r) => proietta(r, select))
      return risposta(200, oggetto ? out[0] : out)
    }

    if (metodo === 'DELETE') {
      const colpite = tabella.filter(corrisponde)
      if (nome === 'servizi' && colpite.some((s) => (db.appuntamenti ?? []).some((a) => a.servizio_id === s.id))) {
        throw new ErrorePg('23503', 'violates foreign key constraint "appuntamenti_servizio_id_fkey"')
      }
      if (nome === 'clienti') {
        db.appuntamenti = (db.appuntamenti ?? []).filter((a) => !colpite.some((c) => c.id === a.cliente_id))
      }
      db[nome] = tabella.filter((r) => !colpite.includes(r))
      salva()
      return risposta(204)
    }
  } catch (e) {
    if (e instanceof ErrorePg) return risposta(409, { code: e.code, message: e.message, details: null, hint: null })
    return risposta(500, { message: String(e) })
  }
  return risposta(405, { message: 'Metodo non gestito' })
}
