import { useState } from 'react'
import { AccessibleModal } from '../accessibility/AccessibleModal'
import type { CustomField, PaymentMethod, WaitlistEntryData } from '../../types'
import {
  IconCheck,
  IconClock,
  IconEdit,
  IconMail,
  IconShare,
  IconTicket,
  IconTrash,
  IconTrendingUp,
  IconWhatsApp,
  IconX,
} from '../accessibility/AccessibleIcon'
import { GuestAvatar } from './GuestAvatar'
import { WaitlistEntryEditForm } from './WaitlistEntryEditForm'
import { formatCustomFieldValue } from '../../utils/customFieldInput'
import { ActionButton, Pill } from './ActionSheetKit'
import { waitingSince } from './waitlistGrouping'

// Hoja de detalle + acciones de una entrada de Waitlist — mismo patrón que
// GuestDetailSheet.tsx (un AccessibleModal que hace de menú, no un dropdown
// separado), reusando ActionButton/Pill de ActionSheetKit.tsx para verse
// idéntica. Las acciones que necesitan confirmación (pasar a lista normal,
// marcar pagado, eliminar) delegan al padre (WaitlistPanel) vía los
// `onRequest*`, que es quien muestra el ConfirmDialog — mismo criterio que
// GuestDetailSheet/GuestList.
export function WaitlistEntryDetailSheet({
  eventId,
  entry,
  position,
  canManage,
  busy,
  requiresPayment,
  paymentMethods,
  customFields = [],
  maxCompanions,
  copiedId,
  onClose,
  onShare,
  onResendWhatsApp,
  onMoveToFront,
  onCancelOffer,
  onRequestPromote,
  onRequestMarkPaid,
  onRequestRemove,
}: {
  eventId: string
  entry: WaitlistEntryData | null
  position: number
  /** Gatea todas las acciones de gestión (mismo permiso `addGuests` que ya exigen las rules de esta colección) — "Compartir invitación" queda afuera, igual que en GuestDetailSheet. */
  canManage: boolean
  /** true mientras `onMoveToFront`/`onCancelOffer` de ESTA entrada están en curso — las únicas dos acciones del menú que no pasan por un ConfirmDialog primero (el resto cierra la hoja antes de ejecutar). */
  busy: boolean
  requiresPayment: boolean
  paymentMethods: PaymentMethod[]
  customFields?: CustomField[]
  maxCompanions: number
  copiedId: string | null
  onClose: () => void
  onShare: (entry: WaitlistEntryData) => void
  onResendWhatsApp: (entry: WaitlistEntryData) => void
  onMoveToFront: (entry: WaitlistEntryData) => void
  onCancelOffer: (entry: WaitlistEntryData) => void
  onRequestPromote: (entry: WaitlistEntryData) => void
  onRequestMarkPaid: (entry: WaitlistEntryData) => void
  onRequestRemove: (entry: WaitlistEntryData) => void
}) {
  const [editing, setEditing] = useState(false)

  function handleClose() {
    setEditing(false)
    onClose()
  }

  if (!entry) return null

  const isWaiting = entry.status === 'waiting'
  const isOffered = entry.status === 'offered'

  return (
    <AccessibleModal open={!!entry} onClose={handleClose} label={`Detalle de ${entry.name}`} maxWidth="sm:max-w-md">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4 shrink-0 border-b border-gray-100 dark:border-gray-700">
        <GuestAvatar guest={{ name: entry.name, lastName: '', isGroup: false, guestPhotoURL: null }} size={46} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-gray-900 dark:text-white truncate">
            #{position} {entry.name}
          </p>
          {entry.phone && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{entry.phone}</p>}
        </div>
        <button
          onClick={handleClose}
          aria-label="Cerrar"
          className="-m-2 min-w-11 min-h-11 inline-flex items-center justify-center shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <IconX className="w-5 h-5" />
        </button>
      </div>

      <div className="px-5 py-4 overflow-y-auto space-y-5">
        {editing ? (
          <WaitlistEntryEditForm
            eventId={eventId}
            entry={entry}
            customFields={customFields}
            maxCompanions={maxCompanions}
            onDone={() => setEditing(false)}
          />
        ) : (
          <>
            <section className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Estado</p>
              <div className="flex flex-wrap gap-2">
                <Pill tone={isOffered ? 'amber' : 'violet'} icon={<IconClock className="w-3.5 h-3.5" />}>
                  {isOffered ? 'Oferta enviada · esperando respuesta' : 'EN ESPERA · Sin lugar confirmado'}
                </Pill>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {entry.partySize > 1 ? `${entry.partySize} personas · ` : ''}
                {isOffered ? 'Se le avisó que hay un lugar disponible.' : waitingSince(entry.createdAt)}
              </p>
            </section>

            {customFields.some((field) => entry.customData?.[field.id]) && (
              <section className="space-y-1">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Datos adicionales</p>
                <dl className="space-y-1">
                  {customFields.map((field) => {
                    const value = entry.customData?.[field.id]
                    if (!value) return null
                    return (
                      <div key={field.id} className="flex justify-between gap-3 text-sm">
                        <dt className="text-gray-500 dark:text-gray-400">{field.label}</dt>
                        <dd className="text-gray-900 dark:text-white font-medium text-right truncate">{formatCustomFieldValue(field, value)}</dd>
                      </div>
                    )
                  })}
                </dl>
              </section>
            )}

            <section className="space-y-1 pt-1 border-t border-gray-100 dark:border-gray-700">
              <ActionButton icon={copiedId === entry.id ? <IconCheck className="w-4 h-4" /> : <IconShare className="w-4 h-4" />} onClick={() => onShare(entry)}>
                {copiedId === entry.id ? 'Copiado!' : 'Compartir invitación'}
              </ActionButton>
              {canManage && entry.phone?.trim() && (
                <ActionButton icon={<IconWhatsApp className="w-4 h-4" />} onClick={() => onResendWhatsApp(entry)}>
                  Reenviar por WhatsApp
                </ActionButton>
              )}
              {canManage && isWaiting && (
                <ActionButton icon={<IconEdit className="w-4 h-4" />} onClick={() => setEditing(true)}>
                  Modificar pase
                </ActionButton>
              )}

              {canManage && (
                <ActionButton icon={<IconMail className="w-4 h-4" />} onClick={() => onRequestPromote(entry)}>
                  Pasar a la lista normal
                </ActionButton>
              )}
              {canManage && requiresPayment && (
                <ActionButton icon={<IconTicket className="w-4 h-4" />} onClick={() => onRequestMarkPaid(entry)} disabled={paymentMethods.length === 0}>
                  Marcar como pagado
                </ActionButton>
              )}

              {canManage && isWaiting && (
                <ActionButton tone="subtle" icon={<IconTrendingUp className="w-4 h-4" />} onClick={() => onMoveToFront(entry)} disabled={busy}>
                  Mover al frente de la fila
                </ActionButton>
              )}
              {canManage && isOffered && (
                <ActionButton tone="subtle" icon={<IconX className="w-4 h-4" />} onClick={() => onCancelOffer(entry)} disabled={busy}>
                  Cancelar oferta
                </ActionButton>
              )}

              {canManage && isWaiting && (
                <>
                  <div className="h-px bg-gray-100 dark:bg-gray-700 my-2" />
                  <ActionButton tone="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => onRequestRemove(entry)}>
                    Eliminar invitado
                  </ActionButton>
                </>
              )}
            </section>
          </>
        )}
      </div>
    </AccessibleModal>
  )
}
