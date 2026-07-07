import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useModalA11y } from '../../hooks/useModalA11y'
import { guestPresence, partySize } from '../../firebase/guests'
import type { GuestData, PaymentMethod } from '../../types'
import { isHoldExpired } from '../../utils/reservation'
import {
  IconAlertTriangle,
  IconCheck,
  IconCheckCircle,
  IconClock,
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
  copiedId,
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
  copiedId: string | null
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
            <GuestEditForm eventId={eventId} guest={guest} onDone={() => setEditing(false)} />
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
                  {guest.lockToken && <Pill tone="amber" icon={<IconLock className="w-3.5 h-3.5" />}>Pase bloqueado</Pill>}
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
                      <Pill tone="amber" icon={<IconTicket className="w-3.5 h-3.5" />}>Pendiente · {currency}{amount.toLocaleString('es')}</Pill>
                    )}
                    {(guest.paymentStatus === 'unpaid' || guest.paymentStatus === 'pending_confirmation') && guest.holdExpiresAt !== null && (
                      <Pill tone={isHoldExpired(guest) ? 'red' : 'blue'} icon={isHoldExpired(guest) ? <IconAlertTriangle className="w-3.5 h-3.5" /> : <IconClock className="w-3.5 h-3.5" />}>
                        {isHoldExpired(guest)
                          ? guest.paymentStatus === 'pending_confirmation' ? 'Plazo de revisión vencido' : 'Reserva vencida'
                          : `${guest.paymentStatus === 'pending_confirmation' ? 'Revisar antes de' : 'Reservado hasta'} ${new Date(guest.holdExpiresAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`}
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
                <ActionButton icon={<IconEdit className="w-4 h-4" />} onClick={() => setEditing(true)}>
                  Editar datos
                </ActionButton>

                {requiresPayment && guest.paymentStatus === 'paid' && (
                  <ActionButton tone="subtle" icon={<IconRotateCcw className="w-4 h-4" />} onClick={() => onMarkUnpaid(guest)}>
                    Marcar como no pagado
                  </ActionButton>
                )}
                {requiresPayment && guest.paymentStatus === 'pending_confirmation' && (
                  <>
                    <ActionButton icon={<IconCheck className="w-4 h-4" />} onClick={() => onMarkPaid(guest, guest.paymentMethod || undefined)}>
                      Aprobar pago
                    </ActionButton>
                    <ActionButton tone="danger" icon={<IconX className="w-4 h-4" />} onClick={() => onMarkUnpaid(guest)}>
                      Rechazar comprobante
                    </ActionButton>
                  </>
                )}
                {requiresPayment && (guest.paymentStatus === 'unpaid' || guest.paymentStatus === 'expired') && (
                  paymentMethods.length > 1 ? (
                    paymentMethods.map((m) => (
                      <ActionButton key={m} icon={<IconTicket className="w-4 h-4" />} onClick={() => onMarkPaid(guest, m)}>
                        Marcar pagado ({PAYMENT_METHOD_LABELS[m]})
                      </ActionButton>
                    ))
                  ) : (
                    <ActionButton icon={<IconTicket className="w-4 h-4" />} onClick={() => onMarkPaid(guest, paymentMethods[0])}>
                      Marcar como pagado
                    </ActionButton>
                  )
                )}

                {guest.lockToken && (
                  <ActionButton icon={<IconLock className="w-4 h-4" />} onClick={() => onRequestUnlock(guest)}>
                    Desbloquear pase
                  </ActionButton>
                )}
                {guest.rsvpStatus === 'no' && (
                  <ActionButton icon={<IconRotateCcw className="w-4 h-4" />} onClick={() => onReactivate(guest)}>
                    Reactivar invitación
                  </ActionButton>
                )}
                {presence === 'final_out' && (
                  <ActionButton icon={<IconRotateCcw className="w-4 h-4" />} onClick={() => onRequestReentry(guest)}>
                    Permitir reingreso
                  </ActionButton>
                )}

                <div className="h-px bg-gray-100 dark:bg-gray-700 my-2" />
                <ActionButton tone="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => onRequestDelete(guest)}>
                  Eliminar invitado
                </ActionButton>
              </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
