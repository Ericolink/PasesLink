import { useEffect, useState } from 'react'
import { getPlatformUsageStats, type PlatformUsageStats } from '../firebase/platformUsage'

export function usePlatformUsage() {
  const [stats, setStats] = useState<PlatformUsageStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getPlatformUsageStats()
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch((err) => console.error('Error al calcular la analítica de plataforma:', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { stats, loading }
}
