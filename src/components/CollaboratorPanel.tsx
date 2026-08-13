import { useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import type { EventData } from '../types'
import type { useCoOrganizers } from '../hooks/useCoOrganizers'
import type { useCollaborators } from '../hooks/useCollaborators'
import { LEGACY_COORG_DEFAULTS, type CoOrganizerPermissions } from '../types/coOrganizerPermissions'
import {
  COLLABORATOR_ROLE_DESCRIPTIONS,
  COLLABORATOR_ROLE_LABELS,
  type CollaboratorRole,
} from '../types/collaboratorPermissions'
import { QR_QUIET_ZONE_MODULES } from '../utils/qrUrl'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { ConfirmDialog } from './ConfirmDialog'
import { CoOrganizerPermissionsEditor } from './CoOrganizerPermissionsEditor'
import { RadioGroup, RadioGroupOption } from './accessibility/AccessibleField'
import { IconCheck, IconCopy, IconShare, IconX } from './accessibility/AccessibleIcon'

const ROLES: CollaboratorRole[] = ['administrador', 'recepcion', 'caja', 'ventas', 'preparacion', 'comunidad']

function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Invitación de colaborador', url })
        return
      } catch {
        return
      }
    }
    copy()
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
      <p className="text-sm text-gray-700 dark:text-gray-300 truncate min-w-0">{url}</p>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={copy}
          aria-label="Copiar enlace"
          title="Copiar enlace"
          className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-600 transition-colors"
        >
          {copied ? <IconCheck className="w-4 h-4 text-primary" /> : <IconCopy className="w-4 h-4" />}
        </button>
        <button
          onClick={share}
          aria-label="Compartir enlace"
          title="Compartir enlace"
          className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg bg-primary text-white hover:opacity-90 transition-colors"
        >
          <IconShare className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// Una fila de la lista, unificada: viene del mapa legacy (coOrganizersMap,
// siempre rol 'administrador', con editor de permisos fino) o del mapa
// nuevo (collaborators, cualquiera de los 6 roles, sin editor — cambiar el
// rol de alguien ya aceptado exige revocar y reinvitar, ver
// ROLES_PERMISSIONS_REDESIGN.md Fase 4).
type MergedEntry =
  | { source: 'legacy'; uid: string; email: string; role: 'administrador'; permissions: CoOrganizerPermissions }
  | { source: 'new'; uid: string; email: string; role: CollaboratorRole }

interface Props {
  event: EventData
  open: boolean
  coOrg: ReturnType<typeof useCoOrganizers>
  collab: ReturnType<typeof useCollaborators>
}

// Fusión de CoOrganizerPanel.tsx + el sistema unificado de colaboradores
// (ROLES_PERMISSIONS_REDESIGN.md) — un solo panel "Colaboradores", agrupado
// por rol. Un coorganizador YA vale exactamente lo mismo que un colaborador
// de rol Administrador (mismo FULL_ACCESS/LEGACY_COORG_DEFAULTS, ver
// resolveCollaboratorPermissions), así que dejaron de mostrarse como dos
// conceptos separados en la UI: acá conviven en el mismo grupo
// "Administrador". Toda alta NUEVA (para cualquiera de los 6 roles,
// Administrador incluido) pasa por el sistema unificado — el flujo legacy de
// generar enlaces de coorganizador se retiró de la UI (sigue funcionando del
// lado servidor para enlaces ya compartidos antes de esta fusión, ver
// useCoOrganizers.ts). Encargados de "Ventas del evento" dados de alta por
// el sistema legacy (concessions.concessionsStaffMap) NO están acá — siguen
// viviendo en ConcessionStaffPanel.tsx, un concepto de gestión aparte.
export function CollaboratorPanel({ event, open, coOrg, collab }: Props) {
  const [role, setRole] = useState<CollaboratorRole>('administrador')
  const [removing, setRemoving] = useState<{ entry: MergedEntry } | null>(null)
  const [expandedUid, setExpandedUid] = useState<string | null>(null)
  const { handleRemoveCoOrg, handleUpdatePermissions } = coOrg
  const { handleRemoveCollaborator, invite, inviteLoading, inviteError, handleGenerateInvite } = collab

  if (!open) return null

  const coOrgsMap = event.coOrganizersMap || {}
  const collaboratorsMap = event.collaborators || {}

  const merged: MergedEntry[] = [
    ...Object.entries(coOrgsMap).map(([uid, email]): MergedEntry => ({
      source: 'legacy',
      uid,
      email,
      role: 'administrador',
      permissions: { ...LEGACY_COORG_DEFAULTS, ...event.coOrganizerPermissions?.[uid] },
    })),
    ...Object.entries(collaboratorsMap).map(([uid, entry]): MergedEntry => ({
      source: 'new',
      uid,
      email: entry.email,
      role: entry.role,
    })),
  ]

  function handleRemove(entry: MergedEntry) {
    if (entry.source === 'legacy') handleRemoveCoOrg(entry.uid)
    else handleRemoveCollaborator(entry.uid)
  }

  return (
    <>
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-5 animate-fade-in-up">
        <h2 className="font-medium text-gray-900 dark:text-white mb-1">Colaboradores</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Invita a alguien con un rol específico — solo va a ver las herramientas que necesita.
        </p>

        {merged.length > 0 && (
          <div className="space-y-3 mb-3">
            {ROLES.map((r) => {
              const inRole = merged.filter((m) => m.role === r)
              if (inRole.length === 0) return null
              return (
                <div key={r}>
                  <h3 className="text-2xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">
                    {COLLABORATOR_ROLE_LABELS[r]} ({inRole.length})
                  </h3>
                  <div className="space-y-2">
                    {inRole.map((entry) => {
                      const expanded = entry.source === 'legacy' && expandedUid === entry.uid
                      return (
                        <div key={entry.uid} className="bg-gray-50 dark:bg-gray-700/40 rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 gap-3">
                            {entry.source === 'legacy' ? (
                              <button
                                type="button"
                                onClick={() => setExpandedUid(expanded ? null : entry.uid)}
                                className="flex-1 text-left text-sm text-gray-700 dark:text-gray-300 hover:text-primary transition-colors truncate min-w-0"
                              >
                                {entry.email}
                              </button>
                            ) : (
                              <p className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate min-w-0">{entry.email}</p>
                            )}
                            <AccessibleButton
                              iconOnly
                              onClick={() => setRemoving({ entry })}
                              aria-label={`Quitar a ${entry.email} como colaborador`}
                              className="text-gray-400 hover:text-red-500 shrink-0 -my-2.5 -mr-2.5"
                            >
                              <IconX className="w-4 h-4" />
                            </AccessibleButton>
                          </div>
                          {expanded && entry.source === 'legacy' && (
                            <div className="px-3 pb-3 pt-1 border-t border-gray-200 dark:border-gray-600">
                              <CoOrganizerPermissionsEditor
                                value={entry.permissions}
                                onChange={(next) => handleUpdatePermissions(entry.uid, next)}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          {invite ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Invitación de <span className="font-semibold">{COLLABORATOR_ROLE_LABELS[invite.role]}</span> generada:
              </p>
              <InviteLink url={invite.url} />
              <div className="flex justify-center bg-white p-3 rounded-lg w-fit mx-auto">
                <QRCodeCanvas value={invite.url} size={128} marginSize={QR_QUIET_ZONE_MODULES} title="Código QR de la invitación" />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                Válido por 7 días o hasta que alguien lo use, lo que pase primero.
              </p>
              <button
                type="button"
                onClick={() => void handleGenerateInvite(role)}
                disabled={inviteLoading}
                className="w-full text-xs text-primary font-medium hover:underline text-center"
              >
                {inviteLoading ? 'Generando…' : 'Generar un enlace nuevo'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <RadioGroup label="Rol del colaborador" className="flex flex-wrap gap-2">
                {ROLES.map((r) => (
                  <RadioGroupOption
                    key={r}
                    selected={role === r}
                    onSelect={() => setRole(r)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      role === r
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {COLLABORATOR_ROLE_LABELS[r]}
                  </RadioGroupOption>
                ))}
              </RadioGroup>
              <ul className="text-xs text-gray-500 dark:text-gray-400 list-disc list-inside space-y-0.5">
                {COLLABORATOR_ROLE_DESCRIPTIONS[role].map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <AccessibleButton onClick={() => void handleGenerateInvite(role)} disabled={inviteLoading} className="w-full">
                {inviteLoading ? 'Generando…' : `Generar enlace de invitación (${COLLABORATOR_ROLE_LABELS[role]})`}
              </AccessibleButton>
            </div>
          )}
          {inviteError && <p className="text-xs text-red-500 mt-1.5">{inviteError}</p>}
        </div>
      </div>

      <ConfirmDialog
        open={!!removing}
        title="Quitar colaborador"
        message={`¿Quitar a ${removing?.entry.email} como colaborador? Ya no va a tener acceso a este evento.`}
        confirmLabel="Quitar"
        danger
        onConfirm={() => { if (removing) handleRemove(removing.entry); setRemoving(null) }}
        onCancel={() => setRemoving(null)}
      />
    </>
  )
}
