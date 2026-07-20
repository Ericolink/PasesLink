import { QRCodeCanvas } from 'qrcode.react'
import type { EventData, GuestData, PaymentMethod } from '../types'
import type { useEventPermissions } from '../hooks/useEventPermissions'
import { partySize } from '../firebase/guests'
import { PAYMENT_METHOD_LABELS } from '../utils/paymentMethods'
import { IconAlertTriangle, IconCheckCircle, IconTicket } from './Icons'
import { InvitationCard } from './InvitationCard'
import { InvitationThemeRoot } from './InvitationThemeRoot'
import { ThemeSeal } from './ThemeSeal'
import { QR_QUIET_ZONE_MODULES } from '../utils/qrUrl'

export type CheckInState = 'idle' | 'loading' | 'done' | 'already' | 'payment_required' | 'blocked' | 'not_found'

interface Props {
  event: EventData
  guest: GuestData
  perms: ReturnType<typeof useEventPermissions>
  passUrl: string
  checkInState: CheckInState
  paymentSaving: boolean
  paymentError: string | null
  onCheckIn: () => void
  onMarkPaid: (method?: PaymentMethod) => void
  onMarkUnpaid: () => void
}

// Extraído de GuestPass.tsx (auditoría de escalabilidad, hallazgo F13): la
// rama que ve un organizador/co-organizador que abre el pase de OTRO
// invitado (para hacer check-in manual o revisar un pago) es una pantalla
// completa y autocontenida — a diferencia del resto de GuestPass.tsx (RSVP,
// comprobante de pago propio, descarga, aviso multi-dispositivo), no
// comparte ningún estado con la vista del invitado. Movida tal cual, sin
// cambios de comportamiento — la lógica (handleCheckIn/handleMarkPaid/
// handleMarkUnpaid) y el estado (checkInState/paymentSaving/paymentError)
// siguen viviendo en GuestPassInner, pasados como props.
export function OrganizerPassView({
  event,
  guest,
  perms,
  passUrl,
  checkInState,
  paymentSaving,
  paymentError,
  onCheckIn,
  onMarkPaid,
  onMarkUnpaid,
}: Props) {
  return (
    <InvitationThemeRoot
      templateId={event.templateId}
      accentOverride={event.accentColor}
      className="max-w-sm mx-auto px-4 py-12 text-center"
    >
      <InvitationCard>
        <p className="text-xs uppercase tracking-wide mb-4 text-[var(--invite-text-muted)]">Modo organizador</p>
        <h1 className="text-xl font-semibold">{guest.name}</h1>
        {guest.isGroup ? (
          <p className="text-sm mt-1 text-[var(--invite-text-muted)]">{partySize(guest)} integrantes</p>
        ) : (
          guest.companions.length > 0 && (
            <p className="text-sm mt-1 text-[var(--invite-text-muted)]">+ {guest.companions.length} acompañante(s)</p>
          )
        )}
        <p className="text-sm mt-1 text-[var(--invite-text-muted)]">{event.name}</p>

        {event.requiresPayment && (
          <div className="mt-4 flex flex-col items-center gap-2">
            {guest.paymentStatus === 'paid' && <ThemeSeal templateId={event.templateId} />}
            <span
              className={`inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full font-medium ${
                guest.paymentStatus === 'paid' ? 'invite-badge-positive bg-[var(--invite-accent-soft)] text-[var(--invite-accent-dark)]' : 'bg-amber-100 text-amber-700'
              }`}
            >
              <IconTicket className={`w-4 h-4 ${guest.paymentStatus === 'paid' ? 'text-green-500' : ''}`} />
              {guest.paymentStatus === 'paid'
                ? `Pago confirmado${guest.paymentMethod ? ` (${PAYMENT_METHOD_LABELS[guest.paymentMethod]})` : ''}`
                : guest.paymentStatus === 'pending_confirmation'
                  ? 'Comprobante enviado — a revisar'
                  : `Debe ${event.currency}${(event.ticketPrice * (1 + guest.companions.length)).toLocaleString('es')}${guest.paymentMethod ? ` (${PAYMENT_METHOD_LABELS[guest.paymentMethod]})` : ''}`}
            </span>

            {guest.paymentNote && (
              <div className="w-full rounded-md border px-3 py-2 text-left" style={{ borderColor: 'var(--invite-border)' }}>
                <p className="text-2xs uppercase tracking-wide font-semibold text-[var(--invite-text-muted)]">Número de referencia</p>
                <p className="text-sm font-mono font-medium text-[var(--invite-text)] break-all">{guest.paymentNote}</p>
              </div>
            )}

            {paymentError && <p className="text-xs text-red-600">{paymentError}</p>}

            {perms.confirmPayments && (
              guest.paymentStatus === 'paid' ? (
                <button
                  onClick={() => onMarkUnpaid()}
                  disabled={paymentSaving}
                  className="text-sm font-medium disabled:opacity-50 text-[var(--invite-accent)]"
                >
                  Marcar como no pagado
                </button>
              ) : guest.paymentStatus === 'pending_confirmation' ? (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onMarkPaid(guest.paymentMethod || undefined)}
                    disabled={paymentSaving}
                    className="text-sm font-medium disabled:opacity-50 text-[var(--invite-accent)]"
                  >
                    Aprobar pago
                  </button>
                  <button
                    onClick={() => onMarkUnpaid()}
                    disabled={paymentSaving}
                    className="text-sm font-medium disabled:opacity-50 text-red-600"
                  >
                    Rechazar comprobante
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onMarkPaid(guest.paymentMethod || event.paymentMethods[0])}
                  disabled={paymentSaving}
                  className="text-sm font-medium disabled:opacity-50 text-[var(--invite-accent)]"
                >
                  Confirmar pago
                </button>
              )
            )}
          </div>
        )}

        {checkInState !== 'done' && (
          <div className="flex justify-center my-6">
            <div
              className="invite-qr-frame p-4 border rounded-lg max-w-[250px] max-h-[250px] overflow-hidden flex items-center justify-center"
              style={{ borderColor: 'var(--invite-border)' }}
            >
              <QRCodeCanvas value={passUrl} size={200} marginSize={QR_QUIET_ZONE_MODULES} />
            </div>
          </div>
        )}

        <div className="mt-8">
          {checkInState === 'done' && (
            <div className="flex flex-col items-center gap-3">
              <ThemeSeal templateId={event.templateId} />
              <span className="invite-badge-icon">
                <IconCheckCircle className="w-16 h-16 text-green-500" />
              </span>
              <p className="text-lg font-semibold text-[var(--invite-text)]">¡Entrada registrada!</p>
              {event.welcomeMessage && (
                <p className="text-sm italic text-[var(--invite-text-muted)]">{event.welcomeMessage}</p>
              )}
            </div>
          )}
          {checkInState === 'already' && (
            <div className="flex flex-col items-center gap-3">
              <IconAlertTriangle className="w-14 h-14 text-amber-400" />
              <p className="text-base font-semibold text-amber-600">Ya registrado</p>
              <p className="text-sm text-[var(--invite-text-muted)]">Este invitado ya hizo check-in anteriormente.</p>
            </div>
          )}
          {checkInState === 'payment_required' && (
            <p className="text-sm text-amber-600 mb-3">
              {guest.paymentStatus === 'pending_confirmation'
                ? 'Tiene un comprobante esperando revisión. Aprobalo arriba para poder registrar el ingreso.'
                : 'Cobra la entrada y marcá el pago antes de registrar el ingreso.'}
            </p>
          )}
          {checkInState === 'blocked' && (
            <div className="flex flex-col items-center gap-3 mb-3">
              <IconAlertTriangle className="w-14 h-14 text-red-500" />
              <p className="text-base font-semibold text-red-600">No se pudo registrar el ingreso</p>
              <p className="text-sm text-[var(--invite-text-muted)]">
                Este invitado se retiró definitivamente del evento. Un organizador puede habilitar su reingreso desde la lista de invitados.
              </p>
            </div>
          )}
          {checkInState === 'not_found' && (
            <div className="flex flex-col items-center gap-3 mb-3">
              <IconAlertTriangle className="w-14 h-14 text-red-500" />
              <p className="text-base font-semibold text-red-600">No se pudo registrar el ingreso</p>
              <p className="text-sm text-[var(--invite-text-muted)]">Este pase ya no corresponde a ningún invitado del evento.</p>
            </div>
          )}
          {perms.scanQr && (checkInState === 'idle' || checkInState === 'loading' || checkInState === 'payment_required') && (
            <button
              onClick={onCheckIn}
              disabled={checkInState === 'loading' || (event.requiresPayment && guest.paymentStatus !== 'paid')}
              className="w-full text-white rounded-xl py-4 text-lg font-bold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 bg-[var(--invite-accent)]"
            >
              {checkInState === 'loading' ? 'Registrando…' : 'Registrar entrada'}
            </button>
          )}
        </div>
      </InvitationCard>
    </InvitationThemeRoot>
  )
}
