/**
 * Costruisce la versione dimostrativa del pannello in UN SOLO file HTML
 * (JavaScript e CSS incorporati), pubblicabile come pagina statica.
 *
 *   node web/demo/costruisci.mjs [percorso-di-uscita.html]
 */
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const qui = dirname(fileURLToPath(import.meta.url))
const web = resolve(qui, '..')
const uscita = resolve(process.argv[2] ?? join(qui, 'dist', 'prenotazioni-ilenia-demo.html'))
const tmp = mkdtempSync(join(tmpdir(), 'demo-'))

// 1. JavaScript (+ CSS di FullCalendar) con esbuild
const risultato = await build({
  entryPoints: [join(qui, 'main.tsx')],
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  outdir: tmp,
  write: false,
  logLevel: 'warning',
  logOverride: { 'unsupported-directive': 'silent' },
  alias: {
    'next/navigation': join(qui, 'adattatori/next-navigation.ts'),
    'next/link': join(qui, 'adattatori/next-link.tsx'),
    'next/dynamic': join(qui, 'adattatori/next-dynamic.tsx'),
  },
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.NEXT_PUBLIC_DEMO': '"1"',
    'process.env.NEXT_PUBLIC_SUPABASE_URL': '""',
    'process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY': '""',
  },
  tsconfig: join(web, 'tsconfig.json'),
})
const js = risultato.outputFiles.find((f) => f.path.endsWith('.js'))?.text ?? ''
const cssCalendario = risultato.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? ''

// 2. CSS di Tailwind (stesse classi del pannello vero)
const cssTailwind = join(tmp, 'tailwind.css')
execFileSync('npx', ['@tailwindcss/cli', '-i', 'app/globals.css', '-o', cssTailwind, '--minify'], {
  cwd: web,
  stdio: 'pipe',
})

// 3. Un solo file: niente "</script>" o "</style>" dentro il codice incorporato
const jsSicuro = js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')
const css = `${readFileSync(cssTailwind, 'utf8')}\n${cssCalendario}\nbody{font-size:1rem;margin:0}`.replace(/<\/style/gi, '<\\/style')

const html = `<title>Prenotazioni Ilenia</title>
<meta name="description" content="Versione dimostrativa del pannello prenotazioni di Ilenia">
<meta name="theme-color" content="#b3305e">
<style>${css}</style>
<div id="app" class="min-h-dvh antialiased"></div>
<noscript>Per usare il pannello serve JavaScript.</noscript>
<script>${jsSicuro}</script>
`
mkdirSync(dirname(uscita), { recursive: true })
writeFileSync(uscita, html)
console.log(`Demo pronta: ${uscita} (${(html.length / 1024).toFixed(0)} KB)`)
