// Finto Supabase in memoria per provare il pannello nel browser.
// Simula /auth/v1 (login) e il sottoinsieme di /rest/v1 (PostgREST) usato dalle pagine,
// compresi gli errori 23P01 (sovrapposizione), 23503 (in uso), 23505 (duplicato).
import http from 'node:http'
import crypto from 'node:crypto'

const SECRET = 'prova-locale'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (c) => {
  const h = b64({ alg: 'HS256', typ: 'JWT' })
  const p = b64(c)
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`
}
export const ANON = jwt({ role: 'anon', exp: 2000000000 })
const UID = '11111111-1111-1111-1111-111111111111'
const OP = 'aaaaaaaa-0000-0000-0000-000000000001'
const ora = () => new Date().toISOString()

const db = {
  operatrici: [{ id: OP, user_id: UID, nome: 'Ilenia', email: 'ilenia@example.com', attiva: true, creato_il: ora(), aggiornato_il: ora() }],
  impostazioni: [{
    operatrice_id: OP, approvazione: 'manuale', ore_limite_modifica: 24, promemoria: 'disattivato', ora_promemoria: '18:00:00',
    lista_attesa_modalita: 'manuale', lista_attesa_minuti_risposta: 15, lista_attesa_preavviso_minimo_min: 120,
    preavviso_minimo_prenotazione_min: 120, giorni_prenotabili: 30, passo_slot_min: 30, parola_operatore: 'operatore',
    ore_pausa_operatore: 12, telefono_salone: null, email_notifiche: null, creato_il: ora(), aggiornato_il: ora(),
  }],
  servizi: [], orari_settimanali: [], chiusure: [], clienti: [], appuntamenti: [],
  contatore_messaggi_mensile: [], log_messaggi: [],
  conversazioni: [], lista_attesa: [], proposte_anticipo: [], slot_liberati: [], push_iscrizioni: [],
}
const DEFAULT = {
  servizi: { attivo: true, ordine: 0, prezzo: null },
  clienti: { nome: null, telefono: null, email: null, note: null },
  appuntamenti: { stato: 'in_attesa', origine: 'pannello', note: null, servizio_id: null, motivo_rifiuto: null, conferma_via_template: false, promemoria_inviato_il: null, promemoria_esito: null },
  push_iscrizioni: { user_agent: null },
  chiusure: { motivo: null },
}
const FK = { clienti: 'cliente_id', servizi: 'servizio_id', operatrici: 'operatrice_id' }

// ---------------------------------------------------------------- query
function dividi(s) {
  const out = []; let liv = 0; let cur = ''
  for (const ch of s) {
    if (ch === '(') liv++
    if (ch === ')') liv--
    if (ch === ',' && liv === 0) { out.push(cur); cur = '' } else cur += ch
  }
  if (cur) out.push(cur)
  return out.map((x) => x.trim())
}
const confronta = (a, b) => {
  const da = Date.parse(a), dbb = Date.parse(b)
  if (typeof a === 'string' && /\d{4}-\d\d-\d\d/.test(a) && !Number.isNaN(da) && !Number.isNaN(dbb)) return da - dbb
  if (typeof a === 'number') return a - Number(b)
  return String(a).localeCompare(String(b))
}
function condizione(col, espr) {
  const [op, ...resto] = espr.split('.')
  const val = resto.join('.')
  return (r) => {
    const v = r[col]
    switch (op) {
      case 'eq': return String(v) === val
      case 'neq': return String(v) !== val
      case 'lt': return v != null && confronta(v, val) < 0
      case 'gt': return v != null && confronta(v, val) > 0
      case 'gte': return v != null && confronta(v, val) >= 0
      case 'lte': return v != null && confronta(v, val) <= 0
      case 'in': return val.slice(1, -1).split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(v))
      case 'ilike': {
        const re = new RegExp('^' + val.split(/[%*]/).map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i')
        return v != null && re.test(String(v))
      }
      case 'is': return val === 'null' ? v == null : String(v) === val
      default: throw new Error('operatore non simulato ' + op)
    }
  }
}
function filtri(params) {
  const fs = []
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) continue
    if (k === 'or') {
      const parti = dividi(v.slice(1, -1)).map((p) => { const [c, ...r] = p.split('.'); return condizione(c, r.join('.')) })
      fs.push((r) => parti.some((f) => f(r)))
    } else fs.push(condizione(k, v))
  }
  return (r) => fs.every((f) => f(r))
}
function proietta(riga, select) {
  if (!select || select === '*') return { ...riga }
  const out = {}
  for (const parte of dividi(select)) {
    const m = /^(\w+)\((.*)\)$/.exec(parte)
    if (m) {
      const [, tab, sub] = m
      const rel = db[tab].find((x) => x.id === riga[FK[tab]])
      out[tab] = rel ? proietta(rel, sub) : null
    } else if (parte === '*') Object.assign(out, riga)
    else out[parte] = riga[parte]
  }
  return out
}
function ordina(righe, order) {
  if (!order.length) return righe
  return [...righe].sort((a, b) => {
    for (const o of order) {
      const [col, dir = 'asc'] = o.split('.')
      const c = a[col] == null ? 1 : b[col] == null ? -1 : confronta(a[col], b[col])
      if (c !== 0) return dir === 'desc' ? -c : c
    }
    return 0
  })
}

// ---------------------------------------------------------------- vincoli
class ErrPg extends Error { constructor(code, message) { super(message); this.code = code } }
function verifica(tab, riga, id) {
  if (tab === 'appuntamenti' && ['in_attesa', 'confermato'].includes(riga.stato)) {
    const i = Date.parse(riga.inizio), f = Date.parse(riga.fine)
    if (f <= i) throw new ErrPg('23514', 'violates check constraint "appuntamenti_fine_dopo_inizio"')
    const altro = db.appuntamenti.find((a) => a.id !== id && a.operatrice_id === riga.operatrice_id &&
      ['in_attesa', 'confermato'].includes(a.stato) && Date.parse(a.inizio) < f && i < Date.parse(a.fine))
    if (altro) throw new ErrPg('23P01', 'conflicting key value violates exclusion constraint "appuntamenti_no_sovrapposizioni"')
  }
  if (tab === 'clienti' && riga.telefono && db.clienti.some((c) => c.id !== id && c.telefono === riga.telefono)) {
    throw new ErrPg('23505', 'duplicate key value violates unique constraint "clienti_telefono_key"')
  }
}

// ---------------------------------------------------------------- server
const cors = {
  'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'access-control-expose-headers': '*',
}
function sessione() {
  const now = Math.floor(Date.now() / 1000)
  const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'ilenia@example.com', app_metadata: {}, user_metadata: {}, created_at: ora() }
  return { access_token: jwt({ sub: UID, role: 'authenticated', exp: now + 3600 }), token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: crypto.randomUUID(), user }
}

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }
  const url = new URL(req.url, 'http://x')
  let corpo = ''
  for await (const c of req) corpo += c
  const json = corpo ? JSON.parse(corpo) : undefined
  const invia = (code, obj, extra = {}) => {
    res.writeHead(code, { ...cors, 'content-type': 'application/json', ...extra })
    res.end(obj === undefined ? '' : JSON.stringify(obj))
  }

  if (url.pathname === '/auth/v1/token') {
    if (url.searchParams.get('grant_type') === 'password' && (json.email !== 'ilenia@example.com' || json.password !== 'prova1234')) {
      return invia(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
    }
    return invia(200, sessione())
  }
  if (url.pathname === '/auth/v1/user') return invia(200, sessione().user)
  if (url.pathname === '/auth/v1/logout') return invia(204)
  if (url.pathname.startsWith('/auth/v1/')) return invia(200, {})

  const m = /^\/rest\/v1\/(rpc\/)?(\w+)$/.exec(url.pathname)
  if (!m) return invia(404, { message: 'non trovato' })
  const [, rpc, tab] = m
  const oggetto = (req.headers.accept || '').includes('vnd.pgrst.object')
  const rappresentazione = (req.headers.prefer || '').includes('return=representation')
  const select = url.searchParams.get('select')
  try {
    if (rpc) {
      if (tab !== 'salva_orari_settimanali') return invia(404, { message: 'rpc non simulata' })
      const nuove = json.fasce.map((f) => ({ id: crypto.randomUUID(), operatrice_id: OP, giorno: f.giorno, ora_inizio: f.ora_inizio + ':00', ora_fine: f.ora_fine + ':00', creato_il: ora(), aggiornato_il: ora() }))
      db.orari_settimanali = nuove
      return invia(200, nuove)
    }
    const tabella = db[tab]
    if (!tabella) return invia(404, { message: 'tabella non simulata ' + tab })
    const filtro = filtri(url.searchParams)

    if (req.method === 'GET') {
      let righe = ordina(tabella.filter(filtro), url.searchParams.getAll('order'))
      const limite = url.searchParams.get('limit')
      if (limite) righe = righe.slice(0, Number(limite))
      righe = righe.map((r) => proietta(r, select))
      if (oggetto) return righe.length === 1 ? invia(200, righe[0]) : invia(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })
      return invia(200, righe)
    }
    if (req.method === 'POST') {
      const lista = Array.isArray(json) ? json : [json]
      const nuove = lista.map((x) => ({ id: crypto.randomUUID(), ...(DEFAULT[tab] ?? {}), ...x, creato_il: ora(), aggiornato_il: ora() }))
      for (const n of nuove) verifica(tab, n, n.id)
      tabella.push(...nuove)
      if (!rappresentazione) return invia(201)
      const out = nuove.map((r) => proietta(r, select))
      return invia(201, oggetto ? out[0] : out)
    }
    if (req.method === 'PATCH') {
      const colpite = tabella.filter(filtro)
      for (const r of colpite) verifica(tab, { ...r, ...json }, r.id)
      for (const r of colpite) Object.assign(r, json, { aggiornato_il: ora() })
      if (!rappresentazione) return invia(204)
      const out = colpite.map((r) => proietta(r, select))
      return invia(200, oggetto ? out[0] : out)
    }
    if (req.method === 'DELETE') {
      const colpite = tabella.filter(filtro)
      if (tab === 'servizi' && colpite.some((s) => db.appuntamenti.some((a) => a.servizio_id === s.id))) {
        throw new ErrPg('23503', 'update or delete on table "servizi" violates foreign key constraint "appuntamenti_servizio_id_fkey"')
      }
      if (tab === 'clienti') db.appuntamenti = db.appuntamenti.filter((a) => !colpite.some((c) => c.id === a.cliente_id))
      db[tab] = tabella.filter((r) => !colpite.includes(r))
      return invia(204)
    }
  } catch (e) {
    if (e instanceof ErrPg) return invia(409, { code: e.code, message: e.message, details: null, hint: null })
    console.error(e)
    return invia(500, { message: String(e) })
  }
  return invia(405, {})
}).listen(54321, '127.0.0.1', () => console.log('finto supabase pronto; ANON=' + ANON))
