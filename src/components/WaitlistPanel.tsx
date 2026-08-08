import { useEffect, useState } from 'react'
import {
  assignWaitlistSpot,
  cancelWaitlistOffer,
  moveWaitlistEntryToFront,
  promoteWaitlistEntryManually,
  removeFromWaitlist,
  subscribeToWaitlist,
} from '../firebase/waitlist'
import type { WaitlistEntryData } from '../types'
import { MetricTile } from './MetricTile'
import { ConfirmDialog } from './ConfirmDialog'
import { captureException } from '../lib/sentry'
import { formatTimeOfDay } from '../utils/time'
import { getFunctionsErrorMessage } from '../utils/firebaseErrorMessages'

// "Esperando desde: 10:32 AM" (mismo día) o "esperando desde hace 3 días
// (10:32 AM)" — la hora exacta siempre es útil como referencia (§5 del
// issue de lista de espera), el conteo de días es lo que más importa
// después del primer día.
function waitingSince(createdAt: number): string {
  if (!createdAt) return ''
  const days = Math.floor((Date.now() - createdAt) / 86_400_000)
  const time = formatTimeOfDay(createdAt)
  if (days <= 0) return `esperando desde las ${time}`
  return `esperando desde hace ${days} día${days === 1 ? '' : 's'} (${time})`
}

interface WaitlistPanelProps {
  eventId: string
  /** Gatea las acciones (mover/asignar/quitar) — igual criterio que addGuests para GuestAddForm. */
  canManage: boolean
}

// Sección apilada, no una pestaña: EventDetail.tsx no tiene un patrón de
// Tabs hoy y agregar uno solo para esto no se justifica (ver
// WAITLIST_RECONFIRMATION_ARCHITECTURE.md Fase 6) — mismo criterio visual
// que el bloque de capacidad que ya vive arriba de esta card.
export function WaitlistPanel({ eventId, canManage }: WaitlistPanelProps) {
  const [entries, setEntries] = useState<WaitlistEntryData[]>([])
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [removeTarget, setRemoveTarget] = useState<WaitlistEntryData | null>(null)
  const [assignTarget, setAssignTarget] = useState<WaitlistEntryData | null>(null)

  useEffect(() => {
    return subscribeToWaitlist(eventId, setEntries, (err) => captureException(err, { tags: { flow: 'waitlist-panel' } }))
  }, [eventId])

  if (entries.length === 0) return null

  const waitingCount = entries.filter((e) => e.status === 'waiting').length
  const offeredCount = entries.filter((e) => e.status === 'offered').length

  async function runAction(entryId: string, action: () => Promise<void>) {
    setBusyEntryId(entryId)
    setError('')
    try {
      await action()
    } catch (err) {
      console.error('Error managing waitlist entry:', err)
      setError(getFunctionsErrorMessage(err, 'No se pudo completar la acción. Intenta de nuevo.'))
    } finally {
      setBusyEntryId(null)
    }
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 p-4 mb-5">
      <div className="grid grid-cols-2 gap-2 mb-4">
        <MetricTile label="En espera" value={waitingCount} align="start" />
        <MetricTile label="Ofertas activas" value={offeredCount} align="start" accent={offeredCount > 0 ? 'warning' : 'gray'} />
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
        {entries.map((entry, index) => (
          <li key={entry.id} className="py-2.5 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                <span className="text-gray-400 dark:text-gray-500 font-normal">{index + 1}. </span>
                {entry.name}
                {entry.partySize > 1 && <span className="text-gray-400 dark:text-gray-500"> · {entry.partySize} personas</span>}
              </p>
              <p className={`text-xs ${entry.status === 'offered' ? 'text-warning-ink font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                {entry.status === 'offered' ? 'OFERTA enviada · esperando respuesta' : waitingSince(entry.createdAt)}
              </p>
            </div>
            {canManage && (entry.status === 'waiting' || entry.status === 'offered') && (
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                {entry.status === 'waiting' && (
                  <button
                    type="button"
                    disabled={busyEntryId === entry.id}
                    onClick={() => runAction(entry.id, () => moveWaitlistEntryToFront(eventId, entry.id))}
                    className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-primary disabled:opacity-40"
                  >
                    ↑ Primero
                  </button>
                )}
                {/* Instantáneo: crea el guest confirmado de una — sin pasar
                    por oferta/correo. Botón primario, es la acción que más
                    se espera usar ("asignar lugar" en el sentido literal). */}
                <button
                  type="button"
                  disabled={busyEntryId === entry.id}
                  onClick={() => setAssignTarget(entry)}
                  className="text-xs font-semibold text-primary hover:underline disabled:opacity-40"
                >
                  Asignar lugar
                </button>
                {entry.status === 'waiting' ? (
                  <button
                    type="button"
                    disabled={busyEntryId === entry.id}
                    onClick={() => runAction(entry.id, () => promoteWaitlistEntryManually(eventId, entry.id))}
                    className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-primary disabled:opacity-40"
                  >
                    Enviar oferta por correo
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyEntryId === entry.id}
                    onClick={() => runAction(entry.id, () => cancelWaitlistOffer(eventId, entry.id))}
                    className="text-xs font-medium text-red-500 hover:underline disabled:opacity-40"
                  >
                    Cancelar oferta
                  </button>
                )}
                {entry.status === 'waiting' && (
                  <button
                    type="button"
                    disabled={busyEntryId === entry.id}
                    onClick={() => setRemoveTarget(entry)}
                    className="text-xs font-medium text-red-500 hover:underline disabled:opacity-40"
                  >
                    Quitar
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={!!removeTarget}
        title="¿Quitar de la lista de espera?"
        message={`${removeTarget?.name} ya no va a poder confirmar un lugar desde este link. Puedes dejar que se vuelva a anotar si quieres.`}
        confirmLabel="Quitar"
        danger
        onConfirm={() => {
          if (!removeTarget) return
          const target = removeTarget
          setRemoveTarget(null)
          runAction(target.id, () => removeFromWaitlist(eventId, target.id))
        }}
        onCancel={() => setRemoveTarget(null)}
      />

      <ConfirmDialog
        open={!!assignTarget}
        title="¿Asignar lugar?"
        message={`${assignTarget?.name} (${assignTarget?.partySize ?? 1} persona${(assignTarget?.partySize ?? 1) === 1 ? '' : 's'}) va a quedar confirmado de inmediato, sin pedirle que confirme por correo. Se le va a avisar por correo que ya tiene su pase.`}
        confirmLabel="Asignar lugar"
        onConfirm={() => {
          if (!assignTarget) return
          const target = assignTarget
          setAssignTarget(null)
          runAction(target.id, async () => { await assignWaitlistSpot(eventId, target.id) })
        }}
        onCancel={() => setAssignTarget(null)}
      />
    </div>
  )
}
