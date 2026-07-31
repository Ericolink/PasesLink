import { useState } from 'react'
import type { EventData } from '../../types'
import { useConcessionsStaff } from '../../hooks/useConcessionsStaff'
import { AccessibleButton } from '../accessibility/AccessibleButton'
import { ConfirmDialog } from '../ConfirmDialog'
import { IconCheck, IconCopy, IconShare, IconX } from '../accessibility/AccessibleIcon'

interface Props {
  event: EventData
}

// Un Menu Manager no es coorganizador (no aparece en coOrganizersMap), así
// que nunca ve este evento en su Dashboard ni tiene forma propia de
// encontrar /kitchen — la única vía es que el organizador le pase el link
// directo, por eso el copiar/compartir vive acá mismo, junto al alta.
function KitchenLinkSharer({ eventId }: { eventId: string }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/events/${eventId}/kitchen`

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Cocina — panel del encargado del menú', url })
        return
      } catch {
        return
      }
    }
    copy()
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mb-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">Link de la cocina</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Compartíselo a cada encargado ya agregado abajo.</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <AccessibleButton iconOnly size="sm" variant="secondary" onClick={copy} aria-label="Copiar link de la cocina">
          {copied ? <IconCheck className="w-4 h-4 text-primary" /> : <IconCopy className="w-4 h-4" />}
        </AccessibleButton>
        <AccessibleButton iconOnly size="sm" onClick={share} aria-label="Compartir link de la cocina">
          <IconShare className="w-4 h-4" />
        </AccessibleButton>
      </div>
    </div>
  )
}

// Alta/baja de Menu Managers — mismo layout que CoOrganizerPanel pero sin
// editor de permisos: el Menu Manager no tiene permisos granulares, solo
// pertenece o no pertenece al staff del módulo (ver RFC §8.2).
export function ConcessionStaffPanel({ event }: Props) {
  const staffMap = event.concessions?.concessionsStaffMap || {}
  const { staffEmail, setStaffEmail, staffLoading, staffError, setStaffError, handleAddStaff, handleRemoveStaff } =
    useConcessionsStaff(event.id, event.ownerId, staffMap)
  const [removing, setRemoving] = useState<{ uid: string; email: string } | null>(null)

  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Un Menu Manager solo ve pedidos ya pagados y puede marcarlos como preparados/entregados — nunca ve dinero, comprobantes ni el resto del evento.
      </p>

      <KitchenLinkSharer eventId={event.id} />

      {Object.entries(staffMap).length > 0 && (
        <div className="space-y-2 mb-3">
          {Object.entries(staffMap).map(([uid, email]) => (
            <div key={uid} className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/40 rounded-lg">
              <span className="text-sm text-gray-700 dark:text-gray-300">{email}</span>
              <AccessibleButton
                iconOnly
                size="sm"
                variant="text"
                onClick={() => setRemoving({ uid, email })}
                aria-label={`Quitar a ${email} como encargado del menú`}
                className="text-gray-400 hover:text-red-500"
              >
                <IconX className="w-4 h-4" />
              </AccessibleButton>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAddStaff} className="flex gap-2">
        <input
          type="email"
          value={staffEmail}
          onChange={(e) => { setStaffEmail(e.target.value); setStaffError('') }}
          placeholder="email@ejemplo.com"
          className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white dark:focus:bg-gray-800 transition-colors"
        />
        <AccessibleButton type="submit" size="sm" disabled={staffLoading || !staffEmail.trim()}>
          {staffLoading ? '…' : 'Agregar'}
        </AccessibleButton>
      </form>
      {staffError && <p className="text-xs text-red-500 mt-1.5">{staffError}</p>}

      <ConfirmDialog
        open={!!removing}
        title="Quitar encargado del menú"
        message={`¿Quitar a ${removing?.email} como encargado del menú? Ya no podrá ver ni preparar pedidos.`}
        confirmLabel="Quitar"
        danger
        onConfirm={() => { if (removing) handleRemoveStaff(removing.uid); setRemoving(null) }}
        onCancel={() => setRemoving(null)}
      />
    </div>
  )
}
