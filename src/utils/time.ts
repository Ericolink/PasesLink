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
