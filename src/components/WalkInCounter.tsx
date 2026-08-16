import { useEffect, useRef } from 'react'
import type { EventData } from '../types'
import { useAnnouncer } from './accessibility/LiveRegion'

interface Props {
  event: EventData | null
  walkInMsg: 'success' | 'full' | null
  isSubmitting: boolean
  onWalkIn: () => void
  onWalkOut: () => void
}

// Extraído de Scanner.tsx junto con useWalkInCounter (auditoría de
// escalabilidad, hallazgo F13). Se encarga también del gate `entryMode !==
// 'list'` (solo eventos open/hybrid aceptan altas sin QR previo) — el
// llamador puede renderizarlo incondicionalmente.
export function WalkInCounter({ event, walkInMsg, isSubmitting, onWalkIn, onWalkOut }: Props) {
  const { announce } = useAnnouncer()
  // El <p role="status" aria-live="polite"> anterior competía con las 2
  // regiones fijas de AnnouncementProvider (doble canal para el mismo tipo
  // de anuncio) — se consolida acá, con guard de ref para no re-anunciar el
  // mismo mensaje si el componente vuelve a renderizar sin que walkInMsg
  // cambie de valor.
  const previousMsg = useRef<'success' | 'full' | null>(null)
  useEffect(() => {
    if (walkInMsg && walkInMsg !== previousMsg.current) {
      announce(walkInMsg === 'full' ? '¡Cupo máximo alcanzado!' : 'Ingreso registrado')
    }
    previousMsg.current = walkInMsg
  }, [walkInMsg, announce])

  if (!event || event.entryMode === 'list') return null

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Contador walk-in</p>
      <div className="flex items-center gap-3">
        <button onClick={onWalkOut} disabled={isSubmitting} aria-label="Registrar salida" className="min-h-12 flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-md py-3 text-lg font-bold transition-colors disabled:opacity-50">−</button>
        <div className="text-center min-w-[60px]">
          <span className="text-2xl font-bold text-white">{event.checkedInCount}</span>
          {event.capacity && <p className="text-xs text-gray-400">/ {event.capacity}</p>}
        </div>
        <button onClick={onWalkIn} disabled={isSubmitting} aria-label="Registrar entrada" className="min-h-12 flex-1 bg-primary hover:bg-primary-dark text-white rounded-md py-3 text-lg font-bold transition-colors disabled:opacity-50">+</button>
      </div>
      {walkInMsg && (
        <p className={`text-sm text-center mt-2 font-medium ${walkInMsg === 'full' ? 'text-red-400' : 'text-green-400'}`}>
          {walkInMsg === 'full' ? '¡Cupo máximo alcanzado!' : 'Ingreso registrado'}
        </p>
      )}
    </div>
  )
}
