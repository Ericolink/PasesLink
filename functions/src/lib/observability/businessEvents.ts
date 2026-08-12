// Métricas de negocio: eventos importantes para armar dashboards después
// (no técnicos — "qué pasó", no "cómo fue la ejecución"). Se loguean en
// INFO con `type: 'business_event'` fijo, filtrable en Cloud Logging con
// `jsonPayload.type="business_event"`.
//
// Alcance: solo se instrumentan operaciones que hoy pasan por una Cloud
// Function. Evento creado/publicado/cancelado e invitación enviada ocurren
// hoy vía escritura directa del frontend a Firestore — no están cubiertos
// acá (ver docs/backend-observability.md, sección "Brechas conocidas").
// Invitado agregado desde la UI normal (individual/lista/CSV) sí está
// cubierto desde la migración a Cloud Functions de addGuest/addGuestsBulk/
// addGuestsFromRows (ver functions/src/capacity/createGuests.ts).
import type { Logger, LogFields } from './logger.js'

export const BUSINESS_EVENTS = {
  CHECKIN_SUCCESS: 'checkin_success',
  CHECKIN_REJECTED: 'checkin_rejected',
  PAYMENT_REGISTERED: 'payment_registered',
  PAYMENT_CONFIRMED: 'payment_confirmed',
  GUEST_ADDED_WALKIN: 'guest_added_walkin',
  GUEST_ADDED_MANUAL: 'guest_added_manual',
  GUEST_ADDED_BULK: 'guest_added_bulk',
  GUEST_PROMOTED_FROM_WAITLIST: 'guest_promoted_from_waitlist',
  CONCESSION_ORDER_CREATED: 'concession_order_created',
  CONCESSION_ORDER_CANCELLED: 'concession_order_cancelled',
  CO_ORGANIZER_INVITE_ACCEPTED: 'co_organizer_invite_accepted',
  CONCESSIONS_STAFF_INVITE_ACCEPTED: 'concessions_staff_invite_accepted',
} as const

export type BusinessEventName = typeof BUSINESS_EVENTS[keyof typeof BUSINESS_EVENTS]

export function logBusinessEvent(logger: Logger, event: BusinessEventName, fields: LogFields = {}): void {
  logger.info(`Evento de negocio: ${event}`, { type: 'business_event', event, ...fields })
}
