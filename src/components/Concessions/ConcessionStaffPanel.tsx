import { useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import type { EventData } from '../../types'
import { resolveConcessionsStaffEntry } from '../../types/concessions'
import { removeConcessionsStaff } from '../../firebase/concessions'
import {
  buildConcessionsStaffInviteUrl,
  createConcessionsStaffInvite,
  type ConcessionsStaffRole,
} from '../../firebase/concessionsStaffInvites'
import { AccessibleButton } from '../accessibility/AccessibleButton'
import { ConfirmDialog } from '../ConfirmDialog'
import { QR_QUIET_ZONE_MODULES } from '../../utils/qrUrl'
import { IconCheck, IconCopy, IconShare, IconX } from '../accessibility/AccessibleIcon'

interface Props {
  event: EventData
}

const ROLE_LABELS: Record<ConcessionsStaffRole, string> = {
  cashier: 'Caja',
  prep: 'Preparación',
}

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
        await navigator.share({ title: 'Invitación de encargado — Ventas del evento', url })
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
        <AccessibleButton iconOnly size="sm" variant="secondary" onClick={copy} aria-label="Copiar enlace">
          {copied ? <IconCheck className="w-4 h-4 text-primary" /> : <IconCopy className="w-4 h-4" />}
        </AccessibleButton>
        <AccessibleButton iconOnly size="sm" onClick={share} aria-label="Compartir enlace">
          <IconShare className="w-4 h-4" />
        </AccessibleButton>
      </div>
    </div>
  )
}

// Genera y muestra el enlace/QR de invitación para un rol puntual (caja o
// preparación) — mismo patrón que CollaboratorPanel.tsx, pero acá cada botón
// invita a un rol específico en vez de dejarlo elegir de una lista.
function InviteButton({ eventId, staffRole }: { eventId: string; staffRole: ConcessionsStaffRole }) {
  const [invite, setInvite] = useState<{ url: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleGenerate() {
    setLoading(true)
    setError('')
    try {
      const result = await createConcessionsStaffInvite(eventId, staffRole)
      if (result.status === 'full') {
        setError('Llegaste al máximo de invitaciones pendientes para este rol.')
        return
      }
      setInvite({ url: buildConcessionsStaffInviteUrl(eventId, result.token) })
    } catch (err) {
      console.error('Error al generar invitación de encargado:', err)
      setError('No se pudo generar el enlace. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (invite) {
    return (
      <div className="space-y-3">
        <InviteLink url={invite.url} />
        <div className="flex justify-center bg-white p-3 rounded-lg w-fit mx-auto">
          <QRCodeCanvas value={invite.url} size={112} marginSize={QR_QUIET_ZONE_MODULES} title={`Código QR — invitación de ${ROLE_LABELS[staffRole]}`} />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">Válido por 7 días o hasta que alguien lo use.</p>
        <button type="button" onClick={handleGenerate} disabled={loading} className="w-full text-xs text-primary font-medium hover:underline text-center">
          {loading ? 'Generando…' : 'Generar un enlace nuevo'}
        </button>
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
      </div>
    )
  }

  return (
    <div>
      <AccessibleButton variant="secondary" size="sm" onClick={handleGenerate} disabled={loading} className="w-full">
        {loading ? 'Generando…' : `Invitar encargado de ${ROLE_LABELS[staffRole].toLowerCase()}`}
      </AccessibleButton>
      {error && <p className="text-xs text-red-500 mt-1.5 text-center">{error}</p>}
    </div>
  )
}

// Alta/baja de encargados de "Ventas del evento" — reemplaza el alta por
// email (exigía cuenta ya creada) por invitación con enlace/QR, mismo
// mecanismo que ya usa CollaboratorPanel.tsx para colaboradores. El
// encargado sigue sin ser coorganizador/Administrador ni tener permisos
// granulares: solo pertenece o no a cada rol (caja/preparación).
export function ConcessionStaffPanel({ event }: Props) {
  const staffMap = event.concessions?.concessionsStaffMap || {}
  const [removing, setRemoving] = useState<{ uid: string; email: string } | null>(null)
  const [removeError, setRemoveError] = useState('')

  async function handleRemove() {
    if (!removing) return
    try {
      await removeConcessionsStaff(event.id, removing.uid)
    } catch (err) {
      console.error('Error al quitar un encargado de ventas del evento:', err)
      setRemoveError('No se pudo quitar al encargado. Intenta de nuevo.')
    } finally {
      setRemoving(null)
    }
  }

  const entries = Object.entries(staffMap)
    .map(([uid, raw]) => ({ uid, entry: resolveConcessionsStaffEntry(raw) }))
    .filter((x): x is { uid: string; entry: NonNullable<typeof x.entry> } => x.entry != null)

  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Un encargado de caja valida pagos, sin ver qué preparar. Un encargado de preparación ve qué preparar y
        entregar, sin ver dinero ni comprobantes. Ninguno de los dos es coorganizador ni ve el resto del evento.
      </p>

      {entries.length > 0 && (
        <div className="space-y-2 mb-4">
          {entries.map(({ uid, entry }) => (
            <div key={uid} className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/40 rounded-lg">
              <div className="min-w-0">
                <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{entry.email}</p>
                <p className="text-xs text-gray-400">
                  {[entry.roles.cashier && 'Caja', entry.roles.prep && 'Preparación'].filter(Boolean).join(' · ') || 'Sin rol'}
                </p>
              </div>
              <AccessibleButton
                iconOnly
                size="sm"
                variant="text"
                onClick={() => setRemoving({ uid, email: entry.email })}
                aria-label={`Quitar a ${entry.email} como encargado`}
                className="text-gray-400 hover:text-red-500 shrink-0"
              >
                <IconX className="w-4 h-4" />
              </AccessibleButton>
            </div>
          ))}
        </div>
      )}
      {removeError && <p className="text-xs text-red-500 mb-3">{removeError}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <InviteButton eventId={event.id} staffRole="cashier" />
        <InviteButton eventId={event.id} staffRole="prep" />
      </div>

      <ConfirmDialog
        open={!!removing}
        title="Quitar encargado"
        message={`¿Quitar a ${removing?.email} como encargado de ventas del evento? Ya no podrá acceder a caja ni a preparación.`}
        confirmLabel="Quitar"
        danger
        onConfirm={handleRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  )
}
