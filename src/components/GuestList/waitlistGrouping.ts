import { formatTimeOfDay } from '../../utils/time'

// "esperando desde las 10:32 AM" (mismo día) o "esperando desde hace 3 días
// (10:32 AM)" — la hora exacta siempre es útil como referencia, el conteo de
// días es lo que más importa después del primer día. Archivo de solo-valores
// (no de componentes) para no romper Fast Refresh — mismo criterio que
// guestGrouping.ts. Usado por WaitlistEntryRow.tsx y WaitlistEntryDetailSheet.tsx.
export function waitingSince(createdAt: number): string {
  if (!createdAt) return ''
  const days = Math.floor((Date.now() - createdAt) / 86_400_000)
  const time = formatTimeOfDay(createdAt)
  if (days <= 0) return `esperando desde las ${time}`
  return `esperando desde hace ${days} día${days === 1 ? '' : 's'} (${time})`
}
