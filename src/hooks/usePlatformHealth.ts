import { useEffect, useState } from 'react'
import { subscribeToPlatformHealth, type PlatformHealth } from '../firebase/platformHealth'

export function usePlatformHealth() {
  const [health, setHealth] = useState<PlatformHealth | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return subscribeToPlatformHealth(
      (data) => {
        setHealth(data)
        setLoading(false)
      },
      (err) => {
        console.error('Error al leer la salud de la plataforma:', err)
        setLoading(false)
      },
    )
  }, [])

  return { health, loading }
}
