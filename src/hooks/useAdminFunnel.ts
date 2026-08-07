import { useEffect, useState } from 'react'
import { getFunnelStats, type FunnelStats } from '../firebase/platformFunnel'

export function useAdminFunnel() {
  const [stats, setStats] = useState<FunnelStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getFunnelStats()
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch((err) => console.error('Error al calcular el funnel:', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { stats, loading }
}
