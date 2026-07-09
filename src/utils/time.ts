const DATE_FORMATTER = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const DATE_SHORT_FORMATTER = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

// Versión compacta para controles de UI (DateField) — "2 ago 2026" en vez
// del formato largo de formatDate ("Sábado 2 de agosto, 2026").
export function formatDateShort(date: string): string {
  const d = new Date(date + 'T00:00:00')
  if (isNaN(d.getTime())) return date
  return DATE_SHORT_FORMATTER.format(d)
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
// aunque su horario ya haya ocurrido.
export function isEventPast(date: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(date + 'T00:00:00') < today
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
