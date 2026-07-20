import type { EventData } from '../types'

interface Props {
  event: EventData | null
  walkInMsg: 'success' | 'full' | null
  onWalkIn: () => void
  onWalkOut: () => void
}

// Extraído de Scanner.tsx junto con useWalkInCounter (auditoría de
// escalabilidad, hallazgo F13). Se encarga también del gate `entryMode !==
// 'list'` (solo eventos open/hybrid aceptan altas sin QR previo) — el
// llamador puede renderizarlo incondicionalmente.
export function WalkInCounter({ event, walkInMsg, onWalkIn, onWalkOut }: Props) {
  if (!event || event.entryMode === 'list') return null

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Contador walk-in</p>
      <div className="flex items-center gap-3">
        <button onClick={onWalkOut} aria-label="Registrar salida" className="min-h-12 flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-md py-3 text-lg font-bold transition-colors">−</button>
        <div className="text-center min-w-[60px]">
          <span className="text-2xl font-bold text-white">{event.checkedInCount}</span>
          {event.capacity && <p className="text-xs text-gray-400">/ {event.capacity}</p>}
        </div>
        <button onClick={onWalkIn} aria-label="Registrar entrada" className="min-h-12 flex-1 bg-primary hover:bg-primary-dark text-white rounded-md py-3 text-lg font-bold transition-colors">+</button>
      </div>
      {walkInMsg && (
        <p className={`text-sm text-center mt-2 font-medium ${walkInMsg === 'full' ? 'text-red-400' : 'text-green-400'}`}>
          {walkInMsg === 'full' ? '¡Cupo máximo alcanzado!' : 'Ingreso registrado'}
        </p>
      )}
    </div>
  )
}
