const DATE_FORMATTER = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const DATE_TIME_MEDIUM_FORMATTER = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
const TIME_OF_DAY_FORMATTER = new Intl.DateTimeFormat('es-MX', { timeStyle: 'short' })

/** Convierte un timestamp (ms) a solo la hora, "6:20 p. m." — usado por el recordatorio de salida. */
export function formatTimeOfDay(ms: number): string {
  return TIME_OF_DAY_FORMATTER.format(ms)
}

/** Convierte una fecha/timestamp a "31 dic 2025" — usado en tablas admin (feedback, reportes). */
export function formatShortDate(date: Date | number): string {
  return SHORT_DATE_FORMATTER.format(date)
}

/** Convierte una fecha/timestamp a "31 dic 2025, 3:45 p.m." — usado en detalle admin y notificaciones. */
export function formatDateTimeMedium(date: Date | number): string {
  return DATE_TIME_MEDIUM_FORMATTER.format(date)
}

/** Convierte una fecha ISO 'YYYY-MM-DD' o un Date a "Sábado 31 de diciembre, 2025". */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date
  if (isNaN(d.getTime())) return String(date)
  const parts = DATE_FORMATTER.formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const weekday = get('weekday')
  const day = get('day')
  const month = get('month')
  const year = get('year')
  const result = `${weekday} ${day} de ${month}, ${year}`
  return result.charAt(0).toUpperCase() + result.slice(1)
}

// Convierte 'HH:MM' (24h, formato de <input type="time">) a 12h con AM/PM
// (ej. '15:00' -> '3 PM', '22:30' -> '10:30 PM'). Omite los minutos cuando son ':00'.
export function formatTime12h(time?: string): string {
  if (!time) return ''
  const [hoursStr, minutesStr = '00'] = time.split(':')
  const hours = Number(hoursStr)
  if (Number.isNaN(hours)) return time
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return minutesStr === '00' ? `${displayHours} ${period}` : `${displayHours}:${minutesStr} ${period}`
}

// true si la fecha (YYYY-MM-DD) ya quedó atrás respecto de "hoy" (comparando
// solo el día, sin hora) — un evento de hoy nunca cuenta como pasado acá,
// aunque su horario ya haya ocurrido. `now` es opcional (default `new Date()`)
// solo para poder fijar "hoy" en tests deterministas.
export function isEventPast(date: string, now: Date = new Date()): boolean {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  return new Date(date + 'T00:00:00') < today
}

// true si la fecha (YYYY-MM-DD) es exactamente "hoy" — usado por
// getDashboardStage para decidir si el evento ya está en curso (ver
// eventDashboardStage.ts).
export function isEventToday(date: string, now: Date = new Date()): boolean {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  return new Date(date + 'T00:00:00').getTime() === today.getTime()
}

// Timestamp (ms) de fecha+hora del evento, para ordenar. Sin startTime válido
// se asume 00:00 — suficiente para ordenar por día cuando no hay hora cargada.
function eventDateTimeMs(event: { date: string; startTime?: string }): number {
  const time = event.startTime && /^\d{2}:\d{2}$/.test(event.startTime) ? event.startTime : '00:00'
  const ms = new Date(`${event.date}T${time}:00`).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

// Orden por relevancia para el organizador: próximos primero (del más cercano
// al más lejano, por fecha+hora), y al final los que ya ocurrieron (del más
// reciente al más antiguo) — así lo que requiere atención inmediata queda
// arriba sin importar cuándo se creó el evento en Firestore.
export function compareEventsByRelevance(
  a: { date: string; startTime?: string },
  b: { date: string; startTime?: string },
): number {
  const aFuture = !isEventPast(a.date)
  const bFuture = !isEventPast(b.date)
  if (aFuture !== bFuture) return aFuture ? -1 : 1
  const aMs = eventDateTimeMs(a)
  const bMs = eventDateTimeMs(b)
  return aFuture ? aMs - bMs : bMs - aMs
}

export type EventLifecycleBucket = 'active' | 'cancelled' | 'expired'

// Clasificación derivada para el panel de administración: `status` por sí
// solo no alcanza para saber si un evento "ya pasó", porque el archivado a
// `'archived'` no es automático a nivel de plataforma — solo ocurre cuando el
// propio dueño abre su Dashboard después de la fecha del evento (ver
// Dashboard.tsx). Por eso acá se combina con `isEventPast`, sin agregar
// ningún valor nuevo a `EventStatus`.
export function getEventLifecycleBucket(event: { status: 'active' | 'cancelled' | 'archived'; date: string }): EventLifecycleBucket {
  if (event.status === 'cancelled') return 'cancelled'
  if (event.status === 'archived') return 'expired'
  return isEventPast(event.date) ? 'expired' : 'active'
}
