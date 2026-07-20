import { useState } from 'react'
import type { EventData } from '../types'
import type { useCoOrganizers } from '../hooks/useCoOrganizers'
import { LEGACY_COORG_DEFAULTS } from '../types/coOrganizerPermissions'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import { CoOrganizerPermissionsEditor } from './CoOrganizerPermissionsEditor'
import { IconX } from './Icons'

interface Props {
  event: EventData
  open: boolean
  coOrg: ReturnType<typeof useCoOrganizers>
}

// Extraído de EventDetail.tsx (auditoría de escalabilidad, hallazgo F13):
// panel inline "Coorganizadores" (lista + editor de permisos + alta), visible
// al hacer clic en el ícono junto al lápiz de edición — ese botón (y el
// estado `open` que controla) siguen en EventDetail.tsx porque conviven en
// la misma fila con otros controles del encabezado. `expandedCoOrgUid`
// (qué fila tiene el editor de permisos abierto) y `removingCoOrg` (a quién
// se está por quitar) son puramente locales a este panel — nada fuera de acá
// los necesitaba, así que pasaron a vivir adentro en vez de en EventDetail.
export function CoOrganizerPanel({ event, open, coOrg }: Props) {
  const [expandedCoOrgUid, setExpandedCoOrgUid] = useState<string | null>(null)
  const [removingCoOrg, setRemovingCoOrg] = useState<{ uid: string; email: string } | null>(null)
  const { coOrgEmail, setCoOrgEmail, coOrgLoading, coOrgError, setCoOrgError, handleAddCoOrg, handleRemoveCoOrg, handleUpdatePermissions } = coOrg

  if (!open) return null

  const coOrgsMap = event.coOrganizersMap || {}

  return (
    <>
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-5 animate-fade-in-up">
        <h2 className="font-medium text-gray-900 dark:text-white mb-1">Coorganizadores</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Cada persona puede tener sus propios permisos — toca su email para ajustarlos.
        </p>
        {Object.entries(coOrgsMap).length > 0 && (
          <div className="space-y-2 mb-3">
            {Object.entries(coOrgsMap).map(([uid, email]) => {
              const uidPermissions = { ...LEGACY_COORG_DEFAULTS, ...event.coOrganizerPermissions?.[uid] }
              const expanded = expandedCoOrgUid === uid
              return (
                <div key={uid} className="bg-gray-50 dark:bg-gray-700/40 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setExpandedCoOrgUid(expanded ? null : uid)}
                      className="flex-1 text-left text-sm text-gray-700 dark:text-gray-300 hover:text-primary transition-colors"
                    >
                      {email}
                    </button>
                    <button
                      onClick={() => setRemovingCoOrg({ uid, email })}
                      aria-label={`Quitar a ${email} como co-organizador`}
                      className="text-gray-400 hover:text-red-500 transition-colors shrink-0 ml-2"
                    >
                      <IconX className="w-4 h-4" />
                    </button>
                  </div>
                  {expanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-gray-200 dark:border-gray-600">
                      <CoOrganizerPermissionsEditor
                        value={uidPermissions}
                        onChange={(next) => handleUpdatePermissions(uid, next)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <form onSubmit={handleAddCoOrg} className="flex gap-2">
          <input
            type="email"
            value={coOrgEmail}
            onChange={(e) => { setCoOrgEmail(e.target.value); setCoOrgError('') }}
            placeholder="email@ejemplo.com"
            className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white dark:focus:bg-gray-800 transition-colors"
          />
          <Button type="submit" size="sm" disabled={coOrgLoading || !coOrgEmail.trim()}>
            {coOrgLoading ? '…' : 'Agregar'}
          </Button>
        </form>
        {coOrgError && <p className="text-xs text-red-500 mt-1.5">{coOrgError}</p>}
      </div>

      <ConfirmDialog
        open={!!removingCoOrg}
        title="Quitar co-organizador"
        message={`¿Quitar a ${removingCoOrg?.email} como co-organizador? Ya no podrá escanear pases ni ver este evento.`}
        confirmLabel="Quitar"
        danger
        onConfirm={() => { if (removingCoOrg) handleRemoveCoOrg(removingCoOrg.uid); setRemovingCoOrg(null) }}
        onCancel={() => setRemovingCoOrg(null)}
      />
    </>
  )
}
