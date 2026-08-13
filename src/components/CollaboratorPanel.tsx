import { useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import type { EventData } from '../types'
import type { useCollaborators } from '../hooks/useCollaborators'
import {
  COLLABORATOR_ROLE_DESCRIPTIONS,
  COLLABORATOR_ROLE_LABELS,
  type CollaboratorRole,
} from '../types/collaboratorPermissions'
import { QR_QUIET_ZONE_MODULES } from '../utils/qrUrl'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { ConfirmDialog } from './ConfirmDialog'
import { RadioGroup, RadioGroupOption } from './accessibility/AccessibleField'
import { IconCheck, IconCopy, IconShare, IconX } from './accessibility/AccessibleIcon'

const ROLES: CollaboratorRole[] = ['administrador', 'recepcion', 'caja', 'ventas', 'preparacion', 'comunidad']

// Mismo patrón de copiar/compartir que CoOrganizerPanel.tsx — no se extrajo a
// un helper compartido por un solo caso de reuso más (mismo criterio ya
// documentado ahí).
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

interface Props {
  event: EventData
  open: boolean
  collab: ReturnType<typeof useCollaborators>
}

// Sistema unificado de colaboradores (ROLES_PERMISSIONS_REDESIGN.md Fase 4) —
// reemplazo GRADUAL de CoOrganizerPanel.tsx/ConcessionStaffPanel.tsx para
// ALTAS NUEVAS: el anfitrión elige un rol (no un conjunto de permisos
// sueltos, ni dos sistemas separados de coorganizador/encargado de ventas) y
// genera un enlace/QR de un solo uso. Los coorganizadores y encargados de
// ventas ya existentes siguen viviendo en sus paneles legacy — no se
// migraron automáticamente (ver ROLES_PERMISSIONS_REDESIGN.md §3).
export function CollaboratorPanel({ event, open, collab }: Props) {
  const [role, setRole] = useState<CollaboratorRole>('recepcion')
  const [removing, setRemoving] = useState<{ uid: string; email: string } | null>(null)
  const { handleRemoveCollaborator, invite, inviteLoading, inviteError, handleGenerateInvite } = collab

  if (!open) return null

  const collaborators = event.collaborators || {}

  return (
    <>
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-5 animate-fade-in-up">
        <h2 className="font-medium text-gray-900 dark:text-white mb-1">Colaboradores</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Invita a alguien con un rol específico — solo va a ver las herramientas que necesita.
        </p>

        {Object.entries(collaborators).length > 0 && (
          <div className="space-y-2 mb-3">
            {Object.entries(collaborators).map(([uid, entry]) => (
              <div key={uid} className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{entry.email}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{COLLABORATOR_ROLE_LABELS[entry.role]}</p>
                </div>
                <AccessibleButton
                  iconOnly
                  onClick={() => setRemoving({ uid, email: entry.email })}
                  aria-label={`Quitar a ${entry.email} como colaborador`}
                  className="text-gray-400 hover:text-red-500 shrink-0"
                >
                  <IconX className="w-4 h-4" />
                </AccessibleButton>
              </div>
            ))}
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
        message={`¿Quitar a ${removing?.email} como colaborador? Ya no va a tener acceso a este evento.`}
        confirmLabel="Quitar"
        danger
        onConfirm={() => { if (removing) handleRemoveCollaborator(removing.uid); setRemoving(null) }}
        onCancel={() => setRemoving(null)}
      />
    </>
  )
}
