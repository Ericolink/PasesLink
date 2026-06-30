const DATE_FORMATTER = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

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
