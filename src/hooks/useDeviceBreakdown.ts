import { useEffect, useState } from 'react'
import { getDeviceBreakdown, type DeviceBucket } from '../firebase/deviceStats'

export function useDeviceBreakdown() {
  const [buckets, setBuckets] = useState<DeviceBucket[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getDeviceBreakdown()
      .then((data) => {
        if (!cancelled) setBuckets(data)
      })
      .catch((err) => console.error('Error al leer el desglose de dispositivos:', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { buckets, loading }
}
