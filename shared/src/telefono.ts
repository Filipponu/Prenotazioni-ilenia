/**
 * Numeri di telefono nel formato usato da WhatsApp (wa_id): solo cifre,
 * con prefisso internazionale e senza "+", es. 393331234567.
 */

const FORMATO_WA = /^[1-9][0-9]{7,14}$/

/**
 * Normalizza un numero scritto a mano ("333 123 4567", "+39 333-1234567",
 * "0039 3331234567", "06 1234567"). Senza prefisso si assume l'Italia.
 * Restituisce null se il numero non è valido.
 */
export function normalizzaTelefono(input: string): string | null {
  let s = input.trim()
  if (!s) return null
  const internazionale = s.startsWith('+')
  s = s.replace(/[\s\-./()]/g, '').replace(/^\+/, '')
  if (!/^\d+$/.test(s)) return null

  if (s.startsWith('00')) {
    s = s.slice(2)
  } else if (!internazionale) {
    // cellulare italiano (3xx) o fisso italiano (0x): aggiungo +39
    if (/^3\d{8,9}$/.test(s) || /^0\d{5,10}$/.test(s)) s = `39${s}`
  }
  return FORMATO_WA.test(s) ? s : null
}

/** 393331234567 → "+39 333 123 4567" (solo per la visualizzazione). */
export function formattaTelefono(wa: string | null | undefined): string {
  if (!wa) return ''
  if (wa.startsWith('39') && wa.length >= 11) {
    const n = wa.slice(2)
    if (n.startsWith('3') && n.length === 10) {
      return `+39 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`
    }
    return `+39 ${n}`
  }
  return `+${wa}`
}

/** Link wa.me per aprire una chat (opzionalmente con testo già scritto). */
export function linkWhatsApp(wa: string, testo?: string): string {
  const base = `https://wa.me/${wa}`
  return testo ? `${base}?text=${encodeURIComponent(testo)}` : base
}
