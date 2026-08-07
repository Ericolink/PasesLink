import { useEffect, useState } from 'react'
import { getEventStatsTimeSeries, getUserStatsTimeSeries, type TimeSeriesPoint } from '../firebase/admin'

export function useAdminGrowth(days = 30) {
  const [events, setEvents] = useState<TimeSeriesPoint[]>([])
  const [users, setUsers] = useState<TimeSeriesPoint[]>([])
  const [loading, setLoading] = useState(true)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([getEventStatsTimeSeries(days), getUserStatsTimeSeries(days)])
      .then(([eventsSeries, usersSeries]) => {
        if (cancelled) return
        setEvents(eventsSeries)
        setUsers(usersSeries)
      })
      .catch((err) => console.error('Error al calcular el crecimiento:', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [days])
  /* eslint-enable react-hooks/set-state-in-effect */

  return { events, users, loading }
}
