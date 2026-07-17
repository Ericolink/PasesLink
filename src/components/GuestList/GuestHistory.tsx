import { useEffect, useState } from 'react'
import { getGuestCheckins } from '../../firebase/reports'
import type { CheckinLog } from '../../types'
import { IconClock } from '../Icons'
import { FieldError } from '../FieldError'

function formatCheckinEntryLabel(c: CheckinLog): string {
  if (c.type === 'check_out') return c.exitKind === 'final' ? 'Salida definitiva' : 'Salida temporal'
  return c.reentry ? 'Reingreso' : 'Entrada'
}

export function GuestHistory({ eventId, guestId }: { eventId: string; guestId: string }) {
  const [entries, setEntries] = useState<CheckinLog[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    getGuestCheckins(eventId, guestId)
      .then(setEntries)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [eventId, guestId])

  if (loading) return <p className="text-xs text-gray-400 dark:text-gray-500">Cargando historial…</p>
  if (error) return <FieldError message="No se pudo cargar el historial." />
  if (!entries || entries.length === 0) return <p className="text-xs text-gray-400 dark:text-gray-500">Sin movimientos registrados.</p>

  return (
    <ul className="space-y-1">
      {entries.map((c) => (
        <li key={c.id} className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300 gap-2">
          <span className="inline-flex items-center gap-1.5">
            <IconClock className="w-3 h-3 text-gray-400 shrink-0" />
            {formatCheckinEntryLabel(c)}
            {c.scannedByEmail && <span className="text-gray-400 dark:text-gray-500"> · {c.scannedByEmail}</span>}
          </span>
          <span className="text-gray-400 dark:text-gray-500 shrink-0">
            {new Date(c.timestamp).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </span>
        </li>
      ))}
    </ul>
  )
}
