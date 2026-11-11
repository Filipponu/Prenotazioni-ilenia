/**
 * Server HTTP con il "Supabase finto" in memoria (lo stesso della demo),
 * per provare il Worker in locale senza un progetto Supabase.
 *
 *   node strumenti/finto-supabase/server.mjs [porta]   (predefinita 54322)
 *
 * Parte con i dati di esempio della demo (servizi, orari, clienti…).
 */
import { build } from 'esbuild'
import http from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const qui = dirname(fileURLToPath(import.meta.url))
const porta = Number(process.argv[2] ?? 54322)

const pacchetto = await build({
  entryPoints: [resolve(qui, '../../shared/src/demo/backend.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'error',
})
const { fetchDemo, impostaRitardoDemo } = await import(
  `data:text/javascript;base64,${Buffer.from(pacchetto.outputFiles[0].text).toString('base64')}`
)
impostaRitardoDemo(0)

http
  .createServer(async (req, res) => {
    let corpo = ''
    for await (const pezzo of req) corpo += pezzo
    const intestazioni = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') intestazioni.set(k, v)
    const risposta = await fetchDemo(`http://127.0.0.1:${porta}${req.url}`, {
      method: req.method,
      headers: intestazioni,
      body: corpo || undefined,
    })
    res.writeHead(risposta.status, Object.fromEntries(risposta.headers))
    res.end(await risposta.text())
  })
  .listen(porta, '127.0.0.1', () => console.log(`Supabase finto su http://127.0.0.1:${porta}`))
