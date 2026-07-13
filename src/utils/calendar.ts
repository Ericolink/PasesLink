// Genera un archivo .ics (RFC 5545) mínimo para "Agregar al calendario" —
// no se agregó ninguna librería para esto: el formato que necesitamos (un
// solo VEVENT, sin recurrencia ni asistentes) es un puñado de líneas de
// texto, no justifica el peso de una dependencia.
//
// Hora "flotante" a propósito (sin sufijo Z ni TZID): la app no guarda la
// zona horaria del evento, solo fecha/hora tal como las tipeó el
// organizador — un DTSTART flotante hace que cada calendario lo interprete
// en SU propia zona local, que es lo más cercano a "la hora que dice la
// invitación" sin inventar una zona que no tenemos.
function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function stripPunctuation(isoDate: string): string {
  return isoDate.replace(/-/g, '')
}

function addDaysToIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

// Vía Date real (no aritmética manual de módulo 24): sin esto, sumar horas
// cerca de medianoche (ej. 22:30 + 2h) da la hora correcta pero se queda en
// la fecha del día anterior — un DTEND "antes" del DTSTART, que la mayoría
// de los calendarios rechaza o interpreta mal.
function addHoursToDateTime(isoDate: string, time: string, hours: number): { date: string; time: string } {
  const d = new Date(`${isoDate}T${time}:00`)
  d.setHours(d.getHours() + hours)
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

function formatDateTime(isoDate: string, time: string): string {
  return `${stripPunctuation(isoDate)}T${time.replace(':', '')}00`
}

// Texto plano dentro de un VEVENT: coma/punto y coma/salto de línea son
// caracteres reservados en ICS y rompen el parseo si no se escapan.
function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export interface IcsEventInput {
  uid: string
  name: string
  date: string
  startTime?: string
  endTime?: string
  location?: string
  description?: string
}

export function buildIcsFile(input: IcsEventInput): string {
  let dtStartLine: string
  let dtEndLine: string
  if (input.startTime) {
    dtStartLine = `DTSTART:${formatDateTime(input.date, input.startTime)}`
    if (input.endTime) {
      dtEndLine = `DTEND:${formatDateTime(input.date, input.endTime)}`
    } else {
      const end = addHoursToDateTime(input.date, input.startTime, 2)
      dtEndLine = `DTEND:${formatDateTime(end.date, end.time)}`
    }
  } else {
    // Evento de todo el día — DTEND es EXCLUSIVO en ICS, así que apunta al
    // día siguiente (si no, el evento aparecería con duración 0).
    dtStartLine = `DTSTART;VALUE=DATE:${stripPunctuation(input.date)}`
    dtEndLine = `DTEND;VALUE=DATE:${addDaysToIsoDate(input.date, 1)}`
  }

  const now = new Date()
  const dtStamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PaseLink//ES',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${dtStamp}`,
    dtStartLine,
    dtEndLine,
    `SUMMARY:${escapeIcsText(input.name)}`,
  ]
  if (input.location) lines.push(`LOCATION:${escapeIcsText(input.location)}`)
  if (input.description) lines.push(`DESCRIPTION:${escapeIcsText(input.description)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')

  // CRLF: el separador de línea que exige RFC 5545 (varios clientes de
  // calendario son laxos con esto, pero no todos).
  return lines.join('\r\n')
}

/** Dispara la descarga del .ics — mismo patrón que exportCsv (Reports.tsx) y downloadPass: Blob + link temporal. */
export function downloadIcsFile(input: IcsEventInput, filenameBase: string) {
  const blob = new Blob([buildIcsFile(input)], { type: 'text/calendar;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filenameBase.replace(/\s+/g, '_')}.ics`
  a.click()
  URL.revokeObjectURL(url)
}
