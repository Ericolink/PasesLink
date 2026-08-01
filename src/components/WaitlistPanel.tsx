import { useEffect, useState } from 'react'
import {
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

function relativeWaiting(createdAt: number): string {
  if (!createdAt) return ''
  const days = Math.floor((Date.now() - createdAt) / 86_400_000)
  if (days <= 0) return 'hoy'
  return `hace ${days} día${days === 1 ? '' : 's'}`
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
      setError('No se pudo completar la acción. Intentá de nuevo.')
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
        {entries.map((entry) => (
          <li key={entry.id} className="py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {entry.name}
                {entry.partySize > 1 && <span className="text-gray-400 dark:text-gray-500"> · {entry.partySize} personas</span>}
              </p>
              <p className={`text-xs ${entry.status === 'offered' ? 'text-warning-ink font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                {entry.status === 'offered' ? 'OFERTA · esperando respuesta' : `esperando · ${relativeWaiting(entry.createdAt)}`}
              </p>
            </div>
            {canManage && entry.status === 'waiting' && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busyEntryId === entry.id}
                  onClick={() => runAction(entry.id, () => moveWaitlistEntryToFront(eventId, entry.id))}
                  className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-primary disabled:opacity-40"
                >
                  ↑ Primero
                </button>
                <button
                  type="button"
                  disabled={busyEntryId === entry.id}
                  onClick={() => runAction(entry.id, () => promoteWaitlistEntryManually(eventId, entry.id))}
                  className="text-xs font-medium text-primary hover:underline disabled:opacity-40"
                >
                  Asignar lugar
                </button>
                <button
                  type="button"
                  disabled={busyEntryId === entry.id}
                  onClick={() => setRemoveTarget(entry)}
                  className="text-xs font-medium text-red-500 hover:underline disabled:opacity-40"
                >
                  Quitar
                </button>
              </div>
            )}
            {canManage && entry.status === 'offered' && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busyEntryId === entry.id}
                  onClick={() => runAction(entry.id, () => cancelWaitlistOffer(eventId, entry.id))}
                  className="text-xs font-medium text-red-500 hover:underline disabled:opacity-40"
                >
                  Cancelar oferta
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={!!removeTarget}
        title="¿Quitar de la lista de espera?"
        message={`${removeTarget?.name} ya no va a poder confirmar un lugar desde este link. Podés dejar que se vuelva a anotar si querés.`}
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
    </div>
  )
}
