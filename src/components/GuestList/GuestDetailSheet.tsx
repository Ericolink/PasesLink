import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useModalA11y } from '../../hooks/useModalA11y'
import { guestPresence, partySize } from '../../firebase/guests'
import type { CustomField, GuestData, PaymentMethod } from '../../types'
import {
  IconCheck,
  IconCheckCircle,
  IconEdit,
  IconHelpCircle,
  IconLock,
  IconLogOut,
  IconRotateCcw,
  IconShare,
  IconTicket,
  IconTrash,
  IconX,
} from '../Icons'
import { GuestAvatar } from './GuestAvatar'
import { GuestEditForm } from './GuestEditForm'
import { GuestHistory } from './GuestHistory'
import { PAYMENT_METHOD_LABELS, guestDisplayName } from './guestGrouping'

function Pill({ tone, icon, children }: { tone: 'amber' | 'green' | 'gray' | 'red' | 'blue'; icon?: React.ReactNode; children: React.ReactNode }) {
  const classes: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    green: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    gray: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300',
    red: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${classes[tone]}`}>
      {icon}
      {children}
    </span>
  )
}

function ActionButton({
  tone = 'default',
  icon,
  onClick,
  children,
}: {
  tone?: 'default' | 'subtle' | 'danger'
  icon: React.ReactNode
  onClick: () => void
  children: React.ReactNode
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'subtle'
        ? 'text-gray-500 dark:text-gray-400 font-medium'
        : 'text-gray-900 dark:text-white'
  const iconWrapClass =
    tone === 'danger'
      ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
      : tone === 'subtle'
        ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
        : 'bg-primary/10 text-primary'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-semibold text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${toneClass}`}
    >
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconWrapClass}`}>{icon}</span>
      {children}
    </button>
  )
}

export function GuestDetailSheet({
  eventId,
  guest,
  requiresPayment,
  paymentMethods,
  ticketPrice,
  currency,
  customFields = [],
  copiedId,
  canEditGuests = true,
  canConfirmPayments = true,
  canDeleteGuests = true,
  onClose,
  onShare,
  onMarkPaid,
  onMarkUnpaid,
  onRequestDelete,
  onRequestUnlock,
  onRequestReentry,
  onReactivate,
}: {
  eventId: string
  guest: GuestData | null
  requiresPayment: boolean
  paymentMethods: PaymentMethod[]
  ticketPrice: number
  currency: string
  customFields?: CustomField[]
  copiedId: string | null
  // Defaults en `true` para no romper a ningún caller que todavía no pasa
  // estos props (mismo criterio de compatibilidad que el resto de esta
  // feature: sin entrada de permisos = acceso amplio, como antes).
  canEditGuests?: boolean
  canConfirmPayments?: boolean
  canDeleteGuests?: boolean
  onClose: () => void
  onShare: (guest: GuestData) => void
  onMarkPaid: (guest: GuestData, method?: PaymentMethod) => void
  onMarkUnpaid: (guest: GuestData) => void
  onRequestDelete: (guest: GuestData) => void
  onRequestUnlock: (guest: GuestData) => void
  onRequestReentry: (guest: GuestData) => void
  onReactivate: (guest: GuestData) => void
}) {
  const [editing, setEditing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const dialogRef = useModalA11y<HTMLDivElement>(!!guest, () => { setEditing(false); setHistoryOpen(false); onClose() })

  if (!guest) return null

  const presence = guestPresence(guest)
  const amount = ticketPrice * partySize(guest)

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 pb-[env(safe-area-inset-bottom)] sm:pb-0 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) { setEditing(false); setHistoryOpen(false); onClose() } }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${guestDisplayName(guest)}`}
        className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[88vh] flex flex-col animate-bounce-in"
      >
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 shrink-0 border-b border-gray-100 dark:border-gray-700">
          <GuestAvatar guest={guest} size={46} />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-gray-900 dark:text-white truncate">
              {guest.isGroup ? `${guest.name} · ${partySize(guest)} integrantes` : guestDisplayName(guest)}
            </p>
            {guest.phone && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{guest.phone}</p>}
          </div>
          <button
            onClick={() => { setEditing(false); setHistoryOpen(false); onClose() }}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-5">
          {editing ? (
            <GuestEditForm eventId={eventId} guest={guest} customFields={customFields} onDone={() => setEditing(false)} />
          ) : (
            <>
              <section className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Estado</p>
                <div className="flex flex-wrap gap-2">
                  {guest.rsvpStatus === 'yes' && <Pill tone="green" icon={<IconCheckCircle className="w-3.5 h-3.5" />}>Asistirá</Pill>}
                  {guest.rsvpStatus === 'no' && <Pill tone="gray" icon={<IconX className="w-3.5 h-3.5" />}>No asistirá</Pill>}
                  {guest.rsvpStatus === 'pending' && <Pill tone="amber" icon={<IconHelpCircle className="w-3.5 h-3.5" />}>Sin responder</Pill>}
                  {presence === 'inside' && <Pill tone="blue" icon={<IconCheckCircle className="w-3.5 h-3.5" />}>Adentro</Pill>}
                  {presence === 'temp_out' && <Pill tone="amber" icon={<IconLogOut className="w-3.5 h-3.5" />}>Salida temporal</Pill>}
                  {presence === 'final_out' && <Pill tone="gray" icon={<IconLogOut className="w-3.5 h-3.5" />}>Fuera del evento</Pill>}
                  {/* Informativo, no urgente — ver needsAttention en guestGrouping.ts.
                      Más de un dispositivo reconocido en un pase individual es una señal
                      (no una alarma) de que tal vez se compartió de más — ver
                      claimGuestPass en src/firebase/guests.ts. En pases familiares es
                      esperable que varios integrantes lo abran cada uno por su cuenta. */}
                  {guest.lockToken && (
                    (guest.lockTokens?.length ?? 1) > 1 && !guest.isGroup ? (
                      <Pill tone="amber" icon={<IconLock className="w-3.5 h-3.5" />}>
                        Abierto en {guest.lockTokens!.length} dispositivos
                      </Pill>
                    ) : (
                      <Pill tone="gray" icon={<IconLock className="w-3.5 h-3.5" />}>Pase abierto</Pill>
                    )
                  )}
                </div>
                {!guest.isGroup && guest.companions.length > 0 && (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {guest.companions.length} acompañante{guest.companions.length > 1 ? 's' : ''}
                    {guest.companions.some((c) => c.name) && (
                      <>: {guest.companions.map((c) => c.name || 'Sin nombre').join(', ')}</>
                    )}
                  </p>
                )}
                {guest.status === 'checked_in' && (
                  <button
                    onClick={() => setHistoryOpen((v) => !v)}
                    className="text-xs text-gray-500 dark:text-gray-400 font-medium underline underline-offset-2"
                  >
                    {historyOpen ? 'Ocultar historial de accesos' : 'Ver historial de accesos'}
                  </button>
                )}
                {historyOpen && <GuestHistory eventId={eventId} guestId={guest.id} />}
              </section>

              {customFields.some((field) => guest.customData?.[field.id]) && (
                <section className="space-y-1">
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Datos adicionales</p>
                  <dl className="space-y-1">
                    {customFields.map((field) => {
                      const value = guest.customData?.[field.id]
                      if (!value) return null
                      return (
                        <div key={field.id} className="flex justify-between gap-3 text-sm">
                          <dt className="text-gray-500 dark:text-gray-400">{field.label}</dt>
                          <dd className="text-gray-900 dark:text-white font-medium text-right truncate">{value}</dd>
                        </div>
                      )
                    })}
                  </dl>
                </section>
              )}

              {requiresPayment && (
                <section className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Pago</p>
                  <div className="flex flex-wrap gap-2">
                    {guest.paymentStatus === 'paid' ? (
                      <Pill tone="green" icon={<IconTicket className="w-3.5 h-3.5" />}>
                        Pagó{guest.paymentMethod ? ` (${PAYMENT_METHOD_LABELS[guest.paymentMethod]})` : ''}
                      </Pill>
                    ) : guest.paymentStatus === 'pending_confirmation' ? (
                      <Pill tone="amber" icon={<IconTicket className="w-3.5 h-3.5" />}>Comprobante enviado — a revisar</Pill>
                    ) : (
                      <Pill tone="amber" icon={<IconTicket className="w-3.5 h-3.5" />}>
                        Pendiente · {currency}{amount.toLocaleString('es')}
                        {guest.paymentMethod ? ` · ${PAYMENT_METHOD_LABELS[guest.paymentMethod]}` : ''}
                      </Pill>
                    )}
                    {guest.paymentNote && <Pill tone="gray">Ref: {guest.paymentNote}</Pill>}
                  </div>
                </section>
              )}

              <section className="space-y-1 pt-1 border-t border-gray-100 dark:border-gray-700">
                <ActionButton icon={copiedId === guest.id ? <IconCheck className="w-4 h-4" /> : <IconShare className="w-4 h-4" />} onClick={() => onShare(guest)}>
                  {copiedId === guest.id ? 'Copiado!' : 'Compartir invitación'}
                </ActionButton>
                {canEditGuests && (
                  <ActionButton icon={<IconEdit className="w-4 h-4" />} onClick={() => setEditing(true)}>
                    Editar datos
                  </ActionButton>
                )}

                {canConfirmPayments && requiresPayment && guest.paymentStatus === 'paid' && (
                  <ActionButton tone="subtle" icon={<IconRotateCcw className="w-4 h-4" />} onClick={() => onMarkUnpaid(guest)}>
                    Marcar como no pagado
                  </ActionButton>
                )}
                {canConfirmPayments && requiresPayment && guest.paymentStatus === 'pending_confirmation' && (
                  <>
                    <ActionButton icon={<IconCheck className="w-4 h-4" />} onClick={() => onMarkPaid(guest, guest.paymentMethod || undefined)}>
                      Aprobar pago
                    </ActionButton>
                    <ActionButton tone="danger" icon={<IconX className="w-4 h-4" />} onClick={() => onMarkUnpaid(guest)}>
                      Rechazar comprobante
                    </ActionButton>
                  </>
                )}
                {canConfirmPayments && requiresPayment && guest.paymentStatus !== 'paid' && guest.paymentStatus !== 'pending_confirmation' && (
                  <ActionButton icon={<IconTicket className="w-4 h-4" />} onClick={() => onMarkPaid(guest, guest.paymentMethod || paymentMethods[0])}>
                    Confirmar pago
                  </ActionButton>
                )}

                {canEditGuests && guest.lockToken && (
                  <ActionButton icon={<IconLock className="w-4 h-4" />} onClick={() => onRequestUnlock(guest)}>
                    Desbloquear pase
                  </ActionButton>
                )}
                {canEditGuests && guest.rsvpStatus === 'no' && (
                  <ActionButton icon={<IconRotateCcw className="w-4 h-4" />} onClick={() => onReactivate(guest)}>
                    Reactivar invitación
                  </ActionButton>
                )}
                {canEditGuests && presence === 'final_out' && (
                  <ActionButton icon={<IconRotateCcw className="w-4 h-4" />} onClick={() => onRequestReentry(guest)}>
                    Permitir reingreso
                  </ActionButton>
                )}

                {canDeleteGuests && (
                  <>
                    <div className="h-px bg-gray-100 dark:bg-gray-700 my-2" />
                    <ActionButton tone="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => onRequestDelete(guest)}>
                      Eliminar invitado
                    </ActionButton>
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
