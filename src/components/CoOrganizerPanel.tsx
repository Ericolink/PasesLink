import { useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import type { EventData } from '../types'
import type { useCoOrganizers } from '../hooks/useCoOrganizers'
import { LEGACY_COORG_DEFAULTS } from '../types/coOrganizerPermissions'
import { QR_QUIET_ZONE_MODULES } from '../utils/qrUrl'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { ConfirmDialog } from './ConfirmDialog'
import { CoOrganizerPermissionsEditor } from './CoOrganizerPermissionsEditor'
import { IconCheck, IconCopy, IconShare, IconX } from './accessibility/AccessibleIcon'

// Copiar/compartir el enlace generado — mismo patrón que PublicLink
// (src/pages/EventDetail.tsx), reescrito acá porque ese helper es local a
// ese archivo y no vale la pena exportarlo por un solo caso de reuso más.
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
        await navigator.share({ title: 'Invitación de coorganizador', url })
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
  const { handleRemoveCoOrg, handleUpdatePermissions, invite, inviteLoading, inviteError, handleGenerateInvite } = coOrg

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
                    <AccessibleButton
                      iconOnly
                      onClick={() => setRemovingCoOrg({ uid, email })}
                      aria-label={`Quitar a ${email} como co-organizador`}
                      className="text-gray-400 hover:text-red-500 shrink-0 -my-2.5 -mr-2.5"
                    >
                      <IconX className="w-4 h-4" />
                    </AccessibleButton>
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
        {/* Única vía de alta: enlace/QR de un solo uso — no requiere que la
            otra persona ya tenga cuenta ni que el organizador sepa su correo
            de antemano (rediseño del Dashboard del Evento: se quitó el alta
            directa por correo). */}
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          {invite ? (
            <div className="space-y-3">
              <InviteLink url={invite.url} />
              <div className="flex justify-center bg-white p-3 rounded-lg w-fit mx-auto">
                <QRCodeCanvas value={invite.url} size={128} marginSize={QR_QUIET_ZONE_MODULES} title="Código QR de la invitación" />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                Válido por 7 días o hasta que alguien lo use, lo que pase primero.
              </p>
              <button
                type="button"
                onClick={() => void handleGenerateInvite()}
                disabled={inviteLoading}
                className="w-full text-xs text-primary font-medium hover:underline text-center"
              >
                {inviteLoading ? 'Generando…' : 'Generar un enlace nuevo'}
              </button>
            </div>
          ) : (
            <AccessibleButton onClick={() => void handleGenerateInvite()} disabled={inviteLoading} className="w-full">
              {inviteLoading ? 'Generando…' : 'Generar enlace de invitación'}
            </AccessibleButton>
          )}
          {inviteError && <p className="text-xs text-red-500 mt-1.5">{inviteError}</p>}
        </div>
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
