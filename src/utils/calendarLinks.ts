// Genera las URLs/archivos necesarios para agregar un evento a distintos
// calendarios. No requiere backend ni OAuth — Google y Outlook usan URLs
// directas; Apple/otros usan un archivo .ics descargado localmente.

export interface CalendarEvent {
  title: string
  date: string       // 'YYYY-MM-DD'
  startTime?: string // 'HH:MM'
  endTime?: string   // 'HH:MM'
  location?: string
  description?: string
}

// Convierte 'YYYY-MM-DD' + 'HH:MM' a 'YYYYMMDDTHHmmss' (formato iCal/Google).
// Si no hay hora, devuelve 'YYYYMMDD' (all-day event).
function toCalDate(date: string, time?: string): string {
  const d = date.replace(/-/g, '')
  if (!time) return d
  const t = time.replace(':', '') + '00'
  return `${d}T${t}`
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

export function googleCalendarUrl(ev: CalendarEvent): string {
  const start = toCalDate(ev.date, ev.startTime)
  const end = ev.endTime
    ? toCalDate(ev.date, ev.endTime)
    : ev.startTime
    ? toCalDate(ev.date, addMinutes(ev.startTime, 60))
    : toCalDate(ev.date)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${start}/${end}`,
    ...(ev.location ? { location: ev.location } : {}),
    ...(ev.description ? { details: ev.description } : {}),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function outlookCalendarUrl(ev: CalendarEvent): string {
  const start = toCalDate(ev.date, ev.startTime)
  const end = ev.endTime
    ? toCalDate(ev.date, ev.endTime)
    : ev.startTime
    ? toCalDate(ev.date, addMinutes(ev.startTime, 60))
    : toCalDate(ev.date)
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: ev.title,
    startdt: start,
    enddt: end,
    ...(ev.location ? { location: ev.location } : {}),
    ...(ev.description ? { body: ev.description } : {}),
  })
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`
}

// Genera y descarga un archivo .ics compatible con Apple Calendar, Outlook
// desktop y cualquier cliente iCal. No requiere backend.
export function downloadICS(ev: CalendarEvent): void {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@paselink`
  const start = toCalDate(ev.date, ev.startTime)
  const end = ev.endTime
    ? toCalDate(ev.date, ev.endTime)
    : ev.startTime
    ? toCalDate(ev.date, addMinutes(ev.startTime, 60))
    : toCalDate(ev.date)
  const now = toCalDate(new Date().toISOString().slice(0, 10), new Date().toTimeString().slice(0, 5))

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PaseLink//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${ev.title.replace(/\n/g, '\\n')}`,
    ev.location ? `LOCATION:${ev.location.replace(/\n/g, '\\n')}` : '',
    ev.description ? `DESCRIPTION:${ev.description.replace(/\n/g, '\\n')}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')

  const blob = new Blob([lines], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${ev.title.replace(/\s+/g, '_').slice(0, 60)}.ics`
  a.click()
  URL.revokeObjectURL(url)
}
