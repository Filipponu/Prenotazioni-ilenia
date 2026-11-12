#!/usr/bin/env node
// Disegna le icone dell'app (web/public/icone) da un SVG, con il Chromium di Playwright.
//   node strumenti/genera-icone.mjs
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const { chromium } = createRequire(import.meta.url)('playwright') // installato globalmente
import { fileURLToPath } from 'node:url'

const CARTELLA = fileURLToPath(new URL('../web/public/icone/', import.meta.url))
const BRAND = '#b3305e'

// forbici stilizzate, in un riquadro 512×512; `scala` le rimpicciolisce attorno al centro
const forbici = (colore, scala = 1) => `
  <g transform="translate(256 256) scale(${scala}) translate(-256 -256)" fill="none" stroke="${colore}" stroke-width="30" stroke-linecap="round">
    <circle cx="172" cy="362" r="54"/>
    <circle cx="340" cy="362" r="54"/>
    <path d="M206 320 L372 104"/>
    <path d="M306 320 L140 104"/>
    <circle cx="256" cy="252" r="10" fill="${colore}" stroke="none"/>
  </g>`

const icone = [
  // icona normale: angoli arrotondati
  { nome: 'icona-192.png', lato: 192, svg: `<rect width="512" height="512" rx="112" fill="${BRAND}"/>${forbici('#fff', 0.92)}` },
  { nome: 'icona-512.png', lato: 512, svg: `<rect width="512" height="512" rx="112" fill="${BRAND}"/>${forbici('#fff', 0.92)}` },
  // "maskable" (Android ritaglia a cerchio/goccia): sfondo pieno, disegno nella zona sicura
  { nome: 'icona-maskable-512.png', lato: 512, svg: `<rect width="512" height="512" fill="${BRAND}"/>${forbici('#fff', 0.72)}` },
  // iPhone: quadrata piena, gli angoli li arrotonda iOS
  { nome: 'apple-touch-icon.png', lato: 180, svg: `<rect width="512" height="512" fill="${BRAND}"/>${forbici('#fff', 0.8)}` },
  // piccola icona monocromatica nella barra delle notifiche di Android
  { nome: 'badge-96.png', lato: 96, svg: forbici('#fff', 1.05) },
  // scheda del browser
  { nome: 'favicon-32.png', lato: 32, svg: `<rect width="512" height="512" rx="112" fill="${BRAND}"/>${forbici('#fff', 0.95)}` },
]

const browser = await chromium.launch()
const pagina = await browser.newPage({ deviceScaleFactor: 1 })
for (const { nome, lato, svg } of icone) {
  await pagina.setViewportSize({ width: lato, height: lato })
  await pagina.setContent(
    `<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${lato}" height="${lato}">${svg}</svg></body></html>`,
  )
  writeFileSync(CARTELLA + nome, await pagina.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: lato, height: lato } }))
  console.log('✓', nome)
}
await browser.close()
