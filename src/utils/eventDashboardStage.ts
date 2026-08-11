import type { EventData } from '../types'
import { isEventPast, isEventToday } from './time'

// Etapa del dashboard fusionado (Reportes + Anfitrión en Vivo, ver
// project_dashboard_reports_split_v1 → esta reversión unifica de nuevo,
// pero ahora la pantalla se adapta sola). Todo derivado de campos que
// `useEventOnly` ya trae — sin I/O propio.
export type DashboardStage = 'empty' | 'open' | 'full' | 'waiting_first_checkin' | 'live' | 'ended'

type StageInput = Pick<
  EventData,
  'status' | 'date' | 'guestCount' | 'peopleCount' | 'capacity' | 'attendeeLimitEnabled' | 'checkedInCount'
>

// No existe un campo "publicado/borrador" en EventData — `guestCount === 0`
// cumple el mismo rol narrativo de "recién creado" con una señal real, sin
// inventar un estado que no está en el modelo de datos.
export function getDashboardStage(event: StageInput, now: Date = new Date()): DashboardStage {
  if (event.status === 'cancelled' || isEventPast(event.date, now)) return 'ended'
  if (isEventToday(event.date, now)) {
    return event.checkedInCount > 0 ? 'live' : 'waiting_first_checkin'
  }
  if (event.attendeeLimitEnabled && event.capacity > 0 && event.peopleCount >= event.capacity) return 'full'
  if (event.guestCount === 0) return 'empty'
  return 'open'
}
