// Funzioni comuni agli script di messa online.
import { fileURLToPath } from 'node:url'

export const RADICE = fileURLToPath(new URL('../../', import.meta.url))

/** --nome valore  →  { nome: 'valore' };  --solo  →  { solo: true }; il resto in _ */
export function argomenti(argv = process.argv.slice(2)) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) {
      out._.push(a)
      continue
    }
    const [nome, valore] = a.slice(2).split('=', 2)
    if (valore !== undefined) out[nome] = valore
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[nome] = argv[++i]
    else out[nome] = true
  }
  return out
}

export class Errore extends Error {}

/** Esce con un messaggio comprensibile (senza pila di chiamate per gli errori previsti). */
export function principale(f) {
  f().catch((e) => {
    console.error(`\n✗ ${e instanceof Errore ? e.message : e?.stack ?? e}`)
    process.exit(1)
  })
}

export function richiesto(valore, messaggio) {
  if (valore === undefined || valore === null || valore === '' || valore === true) throw new Errore(messaggio)
  return valore
}

/** Chiamata JSON con errore leggibile. */
export async function chiama(url, { metodo = 'GET', token, corpo, intestazioni = {} } = {}) {
  let r
  try {
    r = await fetch(url, {
      method: metodo,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}),
        ...intestazioni,
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
  } catch (e) {
    throw new Errore(`Impossibile raggiungere ${new URL(url).host}: ${e.cause?.message ?? e.message}`)
  }
  const testo = await r.text()
  let json = null
  try {
    json = testo ? JSON.parse(testo) : null
  } catch {}
  if (!r.ok) {
    const msg = json?.error?.message ?? json?.message ?? json?.msg ?? testo.slice(0, 300)
    throw new Errore(`${metodo} ${new URL(url).pathname} → ${r.status}: ${msg}`)
  }
  return json
}

export const ok = (t) => console.log(`✓ ${t}`)
export const info = (t) => console.log(`  ${t}`)
export const titolo = (t) => console.log(`\n— ${t}`)
