/**
 * Verifica della firma dei webhook di Meta (intestazione X-Hub-Signature-256):
 * HMAC-SHA256 del corpo grezzo con l'App Secret. Usa Web Crypto, quindi
 * funziona nel Worker Cloudflare, nel browser e in Node.
 */

const codificatore = new TextEncoder()

function esadecimale(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Confronto a tempo costante (non rivela dove differiscono le stringhe). */
function uguali(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function calcolaFirma(corpoGrezzo: string, segreto: string): Promise<string> {
  const chiave = await crypto.subtle.importKey(
    'raw',
    codificatore.encode(segreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const firma = await crypto.subtle.sign('HMAC', chiave, codificatore.encode(corpoGrezzo))
  return `sha256=${esadecimale(firma)}`
}

/** true se l'intestazione X-Hub-Signature-256 corrisponde al corpo. */
export async function firmaValida(corpoGrezzo: string, intestazione: string | null, segreto: string): Promise<boolean> {
  if (!intestazione || !segreto) return false
  const attesa = await calcolaFirma(corpoGrezzo, segreto)
  return uguali(intestazione.trim().toLowerCase(), attesa)
}
