// Percorso completo della Fase 1 nel browser, contro il finto Supabase.
import { createRequire } from 'node:module'
const { chromium, devices } = createRequire(import.meta.url)('playwright')
const { DateTime } = createRequire(new URL('../../web/package.json', import.meta.url))('luxon')

// date relative alla settimana prossima, così la prova non dipende dal giorno in cui si lancia
const lunediProssimo = DateTime.now().setZone('Europe/Rome').startOf('week').plus({ weeks: 1 })
const GIO = lunediProssimo.plus({ days: 3 }).toISODate()
const VEN = lunediProssimo.plus({ days: 4 }).toISODate()
const LUN = lunediProssimo.toISODate()
const annoNatale = DateTime.now().month === 12 && DateTime.now().day > 23 ? DateTime.now().year + 1 : DateTime.now().year
const NATALE = DateTime.fromISO(`${annoNatale}-12-24`, { zone: 'Europe/Rome' }).setLocale('it-IT')
const NATALE_TESTO = `dal ${NATALE.toFormat('ccc d/LL')} al ${NATALE.plus({ days: 2 }).toFormat('ccc d/LL')}`
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
const FOTO = new URL('./foto/', import.meta.url).pathname
mkdirSync(FOTO, { recursive: true })

const errori = []
const browser = await chromium.launch()

async function nuovaPagina(opzioni) {
  const ctx = await browser.newContext({ locale: 'it-IT', timezoneId: 'Europe/Rome', ...opzioni })
  const page = await ctx.newPage()
  page.on('console', (m) => {
    // 400 = password sbagliata, 409 = sovrapposizione/duplicato/in uso: provocati apposta
    if (m.type() === 'error' && !/status of (400|409)/.test(m.text())) errori.push('console: ' + m.text())
  })
  page.on('pageerror', (e) => errori.push('pagina: ' + e.message))
  return page
}

const passo = (t) => console.log('•', t)
// nasconde (senza toccare il DOM di React) gli avvisi a comparsa per 2 secondi, il tempo della foto
const senzaAvvisi = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[aria-live]')
    if (!el) return
    el.style.visibility = 'hidden'
    setTimeout(() => (el.style.visibility = ''), 2000)
  })
const avviso = async (page, testo) => {
  try {
    await page.getByRole('status').filter({ hasText: testo }).first().waitFor({ timeout: 5000 })
  } catch (e) {
    await page.screenshot({ path: FOTO + 'ERRORE.png' })
    const testoDialog = await page.locator('dialog[open]').innerText().catch(() => '')
    console.log('Dialog aperto:', testoDialog)
    console.log('Errori finora:', errori)
    throw e
  }
}

// ------------------------------------------------------------- computer
const page = await nuovaPagina({ viewport: { width: 1280, height: 860 } })

passo('login: password sbagliata')
await page.goto(BASE + '/login/')
await page.getByLabel('Email').fill('ilenia@example.com')
await page.getByLabel('Password').fill('sbagliata')
await page.getByRole('button', { name: 'Accedi' }).click()
await page.getByText('Email o password non corretti.').waitFor()
await page.screenshot({ path: FOTO + '01-login.png' })

passo('login corretto → agenda')
await page.getByLabel('Password').fill('prova1234')
await page.getByRole('button', { name: 'Accedi' }).click()
await page.waitForURL('**/agenda/')
await page.getByText('Non hai ancora impostato').waitFor()

passo('servizi')
await page.getByRole('link', { name: 'Servizi' }).click()
await page.getByText('Nessun servizio').waitFor()
for (const [nome, durata, prezzo] of [
  ['Piega', '45', '25'],
  ['Taglio donna', '30', '30'],
  ['Colore + piega', '120', '65,50'],
]) {
  await page.getByRole('button', { name: '+ Nuovo servizio' }).click()
  await page.getByLabel('Nome').fill(nome)
  await page.getByLabel('Durata (minuti)').fill(durata)
  await page.getByLabel('Prezzo (facoltativo)').fill(prezzo)
  await page.locator('dialog').getByRole('button', { name: 'Salva' }).click()
  await avviso(page, 'Servizio aggiunto')
}
await page.getByText('2 h · 65,50 €').waitFor()
// riordino: Colore + piega su di una posizione
await page.getByRole('button', { name: 'Sposta su Colore + piega' }).click()
await page.waitForTimeout(300)
const ordine = await page.locator('main li p.font-medium').allTextContents()
if (ordine.join('|') !== 'Piega|Colore + piega|Taglio donna') errori.push('ordine servizi errato: ' + ordine.join('|'))
await senzaAvvisi(page)
await page.screenshot({ path: FOTO + '02-servizi.png' })

passo('orari settimanali')
await page.getByRole('link', { name: 'Orari' }).click()
const riga = (giorno) => page.locator('li').filter({ has: page.locator('p', { hasText: new RegExp(`^${giorno}$`) }) })
await riga('martedì').getByRole('button', { name: '+ Aggiungi fascia' }).click()
await riga('martedì').getByRole('button', { name: '+ Aggiungi fascia' }).click()
await page.getByLabel('martedì fascia 2 inizio').fill('14:30')
await page.getByLabel('martedì fascia 2 fine').fill('19:00')
for (const g of ['mercoledì', 'giovedì', 'venerdì', 'sabato']) {
  await riga(g).getByRole('button', { name: /^Come / }).click()
}
// sabato solo mattina
await riga('sabato').getByRole('button', { name: 'Rimuovi fascia' }).nth(1).click()
// prova errore: fascia sovrapposta il venerdì
await page.getByLabel('venerdì fascia 1 fine').fill('15:00')
await page.getByRole('button', { name: 'Salva orario' }).click()
await page.getByRole('alert').filter({ hasText: 'venerdì: Due fasce si sovrappongono' }).waitFor()
await page.getByLabel('venerdì fascia 1 fine').fill('13:00')
await page.getByRole('button', { name: 'Salva orario' }).click()
await avviso(page, 'Orario salvato')

passo('chiusura per Natale')
await page.getByRole('button', { name: '+ Aggiungi chiusura' }).click()
await page.getByLabel('Dal').fill(NATALE.toISODate())
await page.getByLabel('Al (compreso)').fill(NATALE.plus({ days: 2 }).toISODate())
await page.getByLabel('Motivo (facoltativo)').fill('Ferie di Natale')
await page.locator('dialog').getByRole('button', { name: 'Salva' }).click()
await avviso(page, 'Chiusura aggiunta')
await page.getByText(NATALE_TESTO).waitFor()
await senzaAvvisi(page)
await page.screenshot({ path: FOTO + '03-orari.png', fullPage: true })

passo('clienti')
await page.getByRole('link', { name: 'Clienti' }).click()
for (const [nome, tel] of [
  ['Maria Bianchi', '333 123 4567'],
  ['Giulia Verdi', '+39 347-765.4321'],
  ['Sara Neri', '3289998877'],
]) {
  await page.getByRole('button', { name: '+ Nuova cliente' }).click()
  await page.getByLabel('Nome').fill(nome)
  await page.getByLabel('Numero WhatsApp').fill(tel)
  await page.locator('dialog').getByRole('button', { name: 'Salva' }).click()
  await avviso(page, 'Cliente aggiunta')
}
// numero duplicato
await page.getByRole('button', { name: '+ Nuova cliente' }).click()
await page.getByLabel('Nome').fill('Doppione')
await page.getByLabel('Numero WhatsApp').fill('3331234567')
await page.locator('dialog').getByRole('button', { name: 'Salva' }).click()
await page.getByRole('alert').filter({ hasText: 'Esiste già una cliente con questo numero' }).waitFor()
await page.locator('dialog').getByRole('button', { name: 'Annulla' }).click()
// numero non valido
await page.getByRole('button', { name: '+ Nuova cliente' }).click()
await page.getByLabel('Numero WhatsApp').fill('12')
await page.locator('dialog').getByRole('button', { name: 'Salva' }).click()
await page.getByText('Numero non valido').waitFor()
await page.locator('dialog').getByRole('button', { name: 'Annulla' }).click()
await page.getByText('+39 347 765 4321').waitFor()
await senzaAvvisi(page)
await page.screenshot({ path: FOTO + '04-clienti.png' })

passo('agenda: nuovi appuntamenti')
await page.getByRole('link', { name: 'Agenda' }).click()
async function nuovoAppuntamento(cliente, servizio, giorno, ora) {
  await page.getByRole('button', { name: '+ Nuovo' }).click()
  await page.getByLabel('Cerca cliente').fill(cliente)
  await page.locator('dialog').getByRole('button', { name: new RegExp('^' + cliente) }).first().click()
  await page.getByLabel('Servizio').selectOption({ label: servizio })
  await page.getByLabel('Giorno').fill(giorno)
  await page.getByLabel('Ora').fill(ora)
  await page.locator('dialog').getByRole('button', { name: 'Salva' }).click()
}
await nuovoAppuntamento('Maria', 'Piega (45 min)', GIO, '10:00')
await avviso(page, 'Appuntamento creato')
await nuovoAppuntamento('Giulia', 'Taglio donna (30 min)', GIO, '11:00')
await avviso(page, 'Appuntamento creato')
await nuovoAppuntamento('Sara', 'Colore + piega (2 h)', VEN, '15:00')
await avviso(page, 'Appuntamento creato')

passo('agenda: sovrapposizione rifiutata')
await nuovoAppuntamento('Sara', 'Colore + piega (2 h)', GIO, '10:30')
await page.getByText('Quell\'orario si sovrappone a un altro appuntamento.').waitFor()
await page.screenshot({ path: FOTO + '05-sovrapposizione.png' })
await page.locator('dialog').getByRole('button', { name: 'Annulla' }).click()

passo('agenda: fuori orario → avviso')
await nuovoAppuntamento('Sara', 'Piega (45 min)', LUN, '10:00') // lunedì: chiuso
await page.getByText('fuori dal tuo orario di lavoro').waitFor()
await page.screenshot({ path: FOTO + '06-fuori-orario.png' })
await page.locator('dialog').getByRole('button', { name: 'Annulla' }).click()

passo('agenda: chiusura natalizia → avviso')
await nuovoAppuntamento('Sara', 'Piega (45 min)', NATALE.toISODate(), '10:00')
await page.getByText('risulti chiusa (Ferie di Natale)').waitFor()
await page.locator('dialog').getByRole('button', { name: 'Annulla' }).click()

await page.getByRole('button', { name: 'Periodo successivo' }).click()
await page.getByText('Maria Bianchi · Piega').first().waitFor()
await page.getByText('Sara Neri · Colore + piega').first().waitFor()
await senzaAvvisi(page)
await page.screenshot({ path: FOTO + '07-agenda-settimana.png', fullPage: true })

passo('agenda: apri e disdici')
await page.getByText('Giulia Verdi · Taglio donna').first().click()
await page.locator('dialog').getByText('Inserito dal pannello').waitFor()
await page.screenshot({ path: FOTO + '08-dettaglio.png' })
await page.locator('dialog[open]').getByRole('button', { name: 'Disdici' }).click()
await page
  .locator('dialog[open]')
  .filter({ hasText: "Disdire l'appuntamento?" })
  .getByRole('button', { name: 'Disdici' })
  .click()
await avviso(page, 'Appuntamento disdetto')
await page.waitForTimeout(500)
if (await page.getByText('Giulia Verdi · Taglio donna').count()) errori.push('appuntamento disdetto ancora visibile')
await page.getByRole('switch', { name: 'Mostra disdetti e rifiutati' }).click()
await page.getByText('Giulia Verdi · Taglio donna').first().waitFor()

passo('agenda: trascinamento (sposta Maria di circa un\'ora)')
const evento = page.locator('.calendario').getByText('Maria Bianchi · Piega').first()
await evento.scrollIntoViewIfNeeded()
await page.mouse.wheel(0, -150) // un po' di margine sopra
await page.waitForTimeout(200)
const box = await evento.boundingBox()
const x = box.x + box.width / 2
const y = box.y + box.height / 2
await page.mouse.move(x, y)
await page.mouse.down()
for (let i = 1; i <= 20; i++) {
  await page.mouse.move(x, y + i * 5)
  await page.waitForTimeout(16)
}
await page.mouse.up()
await page.getByRole('status').filter({ hasText: /Spostato alle/ }).first().waitFor({ timeout: 5000 }).catch(() => errori.push('trascinamento: nessuna conferma'))
await senzaAvvisi(page)
await page.screenshot({ path: FOTO + '09-agenda-dopo-spostamento.png', fullPage: true })

passo('clienti: storico')
await page.getByRole('link', { name: 'Clienti' }).click()
await page.getByRole('button', { name: /Maria Bianchi/ }).click()
await page.locator('dialog').getByText('In programma').waitFor()
await page.screenshot({ path: FOTO + '10-scheda-cliente.png' })
await page.locator('dialog').getByRole('button', { name: 'Annulla' }).click()

passo('servizio usato: non eliminabile')
await page.getByRole('link', { name: 'Servizi' }).click()
await page.getByRole('button', { name: /^Piega/ }).click()
await page.locator('dialog[open]').getByRole('button', { name: 'Elimina' }).click()
await page.locator('dialog[open]').filter({ hasText: 'Eliminare il servizio?' }).getByRole('button', { name: 'Elimina' }).click()
await page
  .locator('dialog[open]')
  .filter({ hasText: 'è usato in alcuni appuntamenti' })
  .getByRole('button', { name: 'Annulla' })
  .click()
  .catch(() => errori.push('manca avviso servizio in uso'))
await page.locator('dialog[open]').getByRole('button', { name: 'Annulla' }).click()

passo('impostazioni')
await page.getByRole('link', { name: 'Impostazioni' }).click()
await page.getByText('Automatica', { exact: true }).click()
await page.getByLabel('Telefono del salone').fill('0123 456789')
await page.getByRole('button', { name: 'Salva', exact: true }).click()
await avviso(page, 'Impostazioni salvate')
await page.screenshot({ path: FOTO + '11-impostazioni.png', fullPage: true })

// ------------------------------------------------------------- telefono
passo('telefono: agenda giorno')
const tel = await nuovaPagina({ ...devices['iPhone 13'] })
await tel.goto(BASE + '/login/')
await tel.getByLabel('Email').fill('ilenia@example.com')
await tel.getByLabel('Password').fill('prova1234')
await tel.getByRole('button', { name: 'Accedi' }).click()
await tel.waitForURL('**/agenda/')
await tel.getByRole('button', { name: 'Settimana', exact: true }).click()
await tel.getByRole('button', { name: 'Periodo successivo' }).click()
await tel.getByText('Maria Bianchi · Piega').first().waitFor()
await tel.screenshot({ path: FOTO + '12-telefono-agenda.png' })
await tel.getByRole('button', { name: '+ Nuovo' }).click()
await tel.locator('dialog').getByText('Nuovo appuntamento').waitFor()
await tel.screenshot({ path: FOTO + '13-telefono-nuovo.png' })
await tel.locator('dialog').getByRole('button', { name: 'Annulla' }).click()
await tel.getByRole('button', { name: 'Altro' }).click()
await tel.locator('dialog[open]').getByRole('link', { name: 'Servizi' }).click()
await tel.getByText('Colore + piega').waitFor()
await tel.screenshot({ path: FOTO + '14-telefono-servizi.png' })

await browser.close()
console.log(errori.length ? '\nPROBLEMI:\n' + errori.join('\n') : '\nNessun problema.')
process.exit(errori.length ? 1 : 0)
