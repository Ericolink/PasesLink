import { useEffect, useState } from 'react'
import { getCheckins } from '../../firebase/reports'
import { useLoadingAnnouncement } from '../../hooks/useLoadingAnnouncement'
import { LoadingInline } from '../LoadingInline'
import { IconCheck, IconCornerUpLeft } from '../accessibility/AccessibleIcon'
import type { CheckinLog } from '../../types'

const CHECKIN_TIMELINE_PAGE_SIZE = 50

interface Props {
  eventId: string
}

// Extraído de Reports.tsx: historial COMPLETO de check-ins (getCheckins, a
// diferencia del feed acotado de LiveArrivalsFeed) — antes se cargaba
// siempre al entrar a la pantalla, ahora solo al expandir esta sección (ver
// comentario de GuestDetailPanel, mismo patrón).
export function CheckinTimelinePanel({ eventId }: Props) {
  const [checkins, setCheckins] = useState<CheckinLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [visibleCount, setVisibleCount] = useState(CHECKIN_TIMELINE_PAGE_SIZE)
  const [refreshToken, setRefreshToken] = useState(0)
  useLoadingAnnouncement(loading, 'Check-ins cargados')

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    getCheckins(eventId)
      .then((data) => {
        if (cancelled) return
        setCheckins(data)
        setVisibleCount(CHECKIN_TIMELINE_PAGE_SIZE)
      })
      .catch((err) => {
        console.error('Error loading checkins:', err)
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [eventId, refreshToken])
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900 dark:text-white">Línea de tiempo</h3>
        <button
          onClick={() => setRefreshToken((n) => n + 1)}
          disabled={loading}
          className="text-sm text-primary font-medium disabled:opacity-50"
        >
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-500">No se pudo cargar el historial de check-ins. Intenta actualizar de nuevo.</p>
      ) : loading ? (
        <LoadingInline label="Cargando asistentes…" />
      ) : checkins.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Aún no hay check-ins registrados.</p>
      ) : (
        <>
          {/* checkins viene ordenado ascendente (más viejo primero, ver
              getCheckins) — se muestran los últimos N (más recientes) y
              este botón revela más hacia atrás en el tiempo. */}
          {checkins.length > visibleCount && (
            <button
              onClick={() => setVisibleCount((c) => c + CHECKIN_TIMELINE_PAGE_SIZE)}
              className="w-full text-sm text-primary font-medium py-2 hover:underline"
            >
              Cargar check-ins anteriores ({checkins.length - visibleCount} restantes)
            </button>
          )}
          <ul className="text-sm space-y-1.5">
            {checkins.slice(Math.max(0, checkins.length - visibleCount)).map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2 text-gray-700 dark:text-gray-300">
                <span className="inline-flex items-start gap-1.5 min-w-0 flex-1">
                  {c.type === 'check_out' ? (
                    <IconCornerUpLeft className="w-3.5 h-3.5 mt-0.5 text-gray-400 dark:text-gray-500 shrink-0" />
                  ) : (
                    <IconCheck className="w-3.5 h-3.5 mt-0.5 text-green-600 dark:text-green-400 shrink-0" />
                  )}
                  <span className="break-words">
                    {c.guestName}
                    {c.type === 'check_out' && (
                      <span className="text-gray-400 dark:text-gray-500"> · {c.exitKind === 'final' ? 'salida definitiva' : 'salida temporal'}</span>
                    )}
                    {c.type === 'check_in' && c.reentry && <span className="text-gray-400 dark:text-gray-500"> · reingreso</span>}
                    {c.scannedByEmail && <span className="text-gray-400 dark:text-gray-500"> · {c.scannedByEmail}</span>}
                  </span>
                </span>
                <span className="text-gray-400 dark:text-gray-500 shrink-0">{new Date(c.timestamp).toLocaleTimeString('es-MX')}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
