import { EntryModeSelector } from '../EntryModeSelector'
import type { EntryMode } from '../../../types'

interface StepEventTypeProps {
  entryMode: EntryMode
  onEntryModeChange: (mode: EntryMode) => void
}

// Extraído de lo que antes era StepInvitationMethod (Fase 2 del rediseño del
// wizard, ver EventCreate.tsx): el tipo de evento es una decisión de forma,
// no de contenido — no lleva preview (ver showPreviewPanel) y merece su
// propio paso en vez de compartir pantalla con capacidad/pago (ver
// StepCapacityAndPayment).
export function StepEventType({ entryMode, onEntryModeChange }: StepEventTypeProps) {
  return (
    <>
      <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2.5 mb-6">
        ⚠️ El tipo de evento no se puede cambiar después de crearlo — elegilo con cuidado.
      </p>
      <EntryModeSelector value={entryMode} onChange={onEntryModeChange} />
    </>
  )
}
