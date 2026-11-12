import type { Notifica } from '@ilenia/shared/bot/motore'

/** Avvisi per Ilenia: per ora nei log del Worker (Fase 5: notifiche push / email). */
export const notificaIlenia = (n: Notifica) => console.log('Notifica per Ilenia:', JSON.stringify(n))
