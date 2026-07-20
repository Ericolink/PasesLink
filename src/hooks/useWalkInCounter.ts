import { useState } from 'react'
import confetti from 'canvas-confetti'
import { walkIn, walkOut } from '../firebase/capacity'
import { captureException } from '../lib/sentry'

// Extraído de Scanner.tsx (auditoría de escalabilidad, hallazgo F13): el
// contador de walk-in/walk-out (eventos open/hybrid, altas sin QR previo)
// es el único cluster de Scanner.tsx que no comparte estado con el resto del
// escáner — solo necesita `eventId` y una forma de avisar un error al mismo
// feedback visual que ya usa el resto de la pantalla (ScanResultModal).
export function useWalkInCounter(eventId: string | undefined, onError: (detail: string) => void) {
  const [walkInMsg, setWalkInMsg] = useState<'success' | 'full' | null>(null)

  async function handleWalkIn() {
    if (!eventId) return
    try {
      const result = await walkIn(eventId)
      setWalkInMsg(result)
      if (result === 'success') confetti({ particleCount: 50, spread: 60, origin: { y: 0.5 } })
      setTimeout(() => setWalkInMsg(null), 2000)
    } catch (err) {
      console.error('Error registrando walk-in:', err)
      captureException(err, { tags: { component: 'scanner', action: 'walk_in' } })
      onError('No se pudo registrar el ingreso. Intenta de nuevo.')
    }
  }

  async function handleWalkOut() {
    if (!eventId) return
    try {
      await walkOut(eventId)
    } catch (err) {
      console.error('Error registrando walk-out:', err)
      captureException(err, { tags: { component: 'scanner', action: 'walk_out' } })
      onError('No se pudo registrar la salida. Intenta de nuevo.')
    }
  }

  return { walkInMsg, handleWalkIn, handleWalkOut }
}
