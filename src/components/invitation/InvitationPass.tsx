import { useState, type CSSProperties, type RefObject } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { partySize, presentIndicesOf } from '../../firebase/guests'
import { getAccentContrastText } from '../../utils/contrastColor'
import { organizerWhatsappUrl } from '../../utils/phone'
import { isEventPast } from '../../utils/time'
import { getTemplate } from '../../templates/registry'
import { QR_QUIET_ZONE_MODULES } from '../../utils/qrUrl'
import { optimizedImageUrl } from '../../utils/cloudinary'
import { useAccountConfirmGate } from '../../hooks/useAccountConfirmGate'
import type { usePaymentProof } from '../../hooks/usePaymentProof'
import type { EventData, GuestData, RsvpStatus } from '../../types'
import {
  IconAlertTriangle,
  IconCalendar,
  IconCheckCircle,
  IconClock,
  IconDownload,
  IconEdit,
  IconHeart,
  IconTicket,
  IconWhatsApp,
} from '../accessibility/AccessibleIcon'
import { AccessibleModal } from '../accessibility/AccessibleModal'
import { PassSecurityNotice } from '../PassSecurityNotice'
import { PaymentProofForm } from '../PaymentProofForm'
import { TransferInfoDisplay } from './TransferInfoDisplay'
import { GuestEditModal } from '../GuestEditModal'
import { GuestSignupPrompt } from '../GuestSignupPrompt'
import { ConfirmDialog } from '../ConfirmDialog'
import { GuestPassTicket } from '../GuestPassTicket'
import { ThemeSeal } from '../ThemeSeal'

interface Props {
  event: EventData
  guest: GuestData
  eventId: string
  passUrl: string
  deviceToken: string | null
  hasAccount: boolean
  ticketRef: RefObject<HTMLDivElement | null>
  downloaded: boolean
  onDownload: () => void
  onAddToCalendar: () => void
  rsvpSaving: boolean
  rsvpError: string | null
  onRsvp: (status: RsvpStatus, opts?: { skipSignupPrompt?: boolean }) => void
  proof: ReturnType<typeof usePaymentProof>
  cancelSaving: boolean
  cancelError: string | null
  onCancelAttendance: () => void
  onGuestSaved: (patch: Partial<GuestData>) => void
}

// "Pase confirmado" de Fiesta Improvisada — nombre del evento, QR y
// identidad primero (a diferencia de las otras 6 plantillas, que priorizan
// el QR sobre el título por diseño deliberado, ver GuestPass.tsx). Reutiliza
// toda la lógica de negocio recibida por props (RSVP, pago, cancelación,
// edición) de GuestPassInner; lo único nuevo acá es el gate de cuenta antes
// de confirmar "Sí, asistiré" (ver useAccountConfirmGate).
export function InvitationPass({
  event,
  guest,
  eventId,
  passUrl,
  deviceToken,
  hasAccount,
  ticketRef,
  downloaded,
  onDownload,
  onAddToCalendar,
  rsvpSaving,
  rsvpError,
  onRsvp,
  proof,
  cancelSaving,
  cancelError,
  onCancelAttendance,
  onGuestSaved,
}: Props) {
  const [showMaybeMessage, setShowMaybeMessage] = useState(false)
  const [showDeclineModal, setShowDeclineModal] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const accountGate = useAccountConfirmGate(hasAccount)

  function handleConfirmYes() {
    accountGate.requestConfirm(() => onRsvp('yes', { skipSignupPrompt: true }))
  }

  function handleConfirmNo() {
    setShowDeclineModal(false)
    onRsvp('no')
  }

  return (
    <div
      className="invite-card invite-pass border bg-[var(--invite-surface)] text-[var(--invite-text)] [font-family:var(--invite-font)] [border-radius:var(--invite-radius)] text-center"
      style={{
        boxShadow: 'var(--invite-shadow)',
        borderColor: 'var(--invite-border)',
        borderTopColor: 'var(--invite-accent)',
        borderTopWidth: '4px',
      }}
    >
      {/* Foto de portada del evento, de borde a borde (fuera del padding de
          la tarjeta) — misma pieza que ya tenía el pase clásico
          (GuestPass.tsx), ahora arriba del todo, antes del título. */}
      {event.coverImage && (
        <div className="invite-cover w-full overflow-hidden" style={{ borderRadius: 'var(--invite-radius) var(--invite-radius) 0 0' }}>
          <img
            src={optimizedImageUrl(event.coverImage, 800)}
            alt={event.name}
            fetchPriority="high"
            crossOrigin="anonymous"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="px-6 pt-6 pb-6">
      <h1 className="invite-pass-title text-2xl font-bold text-[var(--invite-text)] mb-4">{event.name}</h1>

      {guest.rsvpStatus === 'no' && (
        <div className="py-8">
          <IconHeart className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Qué lástima, ¡te vamos a extrañar!</p>
          <p className="text-sm mt-2 text-[var(--invite-text-muted)]">
            Registramos que no podrás asistir. Si cambias de opinión, contacta al organizador del evento para que te
            genere un nuevo pase.
          </p>
        </div>
      )}

      {guest.rsvpStatus !== 'no' && (
        <>
          {guest.rsvpStatus === 'pending' && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-lg text-left bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <IconAlertTriangle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 leading-snug">
                Tu código ya es válido — confirma tu asistencia abajo para avisarle al organizador
              </p>
            </div>
          )}

          <div className="relative flex justify-center mb-5">
            <div
              className="invite-qr-frame p-4 border rounded-xl inline-flex items-center justify-center"
              style={{ borderColor: 'var(--invite-border)', background: 'var(--invite-surface)' }}
            >
              <QRCodeCanvas value={passUrl} size={200} marginSize={QR_QUIET_ZONE_MODULES} title="Código QR de tu pase" />
            </div>
          </div>

          <p className="text-lg font-semibold text-[var(--invite-text)] mb-0.5">{guest.name}</p>
          {guest.isGroup ? (
            <p className="text-sm text-[var(--invite-text-muted)] mb-3">{partySize(guest)} integrantes</p>
          ) : (
            <p className="text-sm text-[var(--invite-text-muted)] mb-3">
              Acompañantes: {guest.companions.length}
            </p>
          )}

          {!guest.isGroup && (
            <button
              data-pass-exclude="true"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 min-h-11 mb-3 text-sm font-medium text-[var(--invite-text-muted)] hover:text-[var(--invite-text)] active:text-[var(--invite-text)] underline underline-offset-2 rounded-lg"
            >
              <IconEdit className="w-4 h-4" /> Editar mis datos
            </button>
          )}

          {!guest.isGroup && guest.rsvpStatus === 'yes' && !guest.menuSelection
            && event.menu && (event.menu.options.length > 0 || event.menu.restrictions.length > 0) && (
            <button
              data-pass-exclude="true"
              onClick={() => setEditOpen(true)}
              className="w-full text-left mb-3 px-3 py-2.5 rounded-lg text-sm bg-[var(--invite-accent-soft)] text-[var(--invite-accent)]"
            >
              Todavía no elegiste tu menú — toca acá para elegirlo.
            </button>
          )}

          {guest.rsvpStatus === 'yes' && (
            <>
              {guest.status === 'checked_in' ? (
                <span className="inline-flex flex-col items-center gap-1.5 mb-3">
                  <span className="inline-flex items-center gap-2">
                    <ThemeSeal templateId={event.templateId} />
                    <p className="invite-badge-positive inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full font-medium bg-[var(--invite-accent-soft)] text-[var(--invite-accent-dark)]">
                      <IconCheckCircle className="w-4 h-4 text-green-500" /> Entrada registrada
                    </p>
                  </span>
                  {presentIndicesOf(guest).length < partySize(guest) && (
                    <p className="text-xs text-[var(--invite-text-muted)]">
                      {presentIndicesOf(guest).length} de {partySize(guest)} personas ingresaron
                    </p>
                  )}
                </span>
              ) : (
                <p className="text-sm text-[var(--invite-text-muted)] mb-3">Presenta este código QR en la entrada</p>
              )}

              <div data-pass-exclude="true" className="flex flex-col sm:flex-row gap-2 justify-center flex-wrap">
                <button
                  onClick={onDownload}
                  className="inline-flex items-center justify-center gap-2 text-white rounded-md px-4 py-3 sm:py-2 text-sm font-medium hover:opacity-90 transition-opacity bg-[var(--invite-accent)]"
                >
                  {downloaded ? <IconCheckCircle className="w-4 h-4" /> : <IconDownload className="w-4 h-4" />}
                  {downloaded ? 'Descargado' : 'Descargar pase'}
                </button>
                <button
                  onClick={onAddToCalendar}
                  className="inline-flex items-center justify-center gap-2 border border-[var(--invite-border)] text-[var(--invite-text)] rounded-md px-4 py-3 sm:py-2 text-sm font-medium hover:bg-[var(--invite-accent-soft)] transition-colors"
                >
                  <IconCalendar className="w-4 h-4" /> Agregar al calendario
                </button>
              </div>
              <PassSecurityNotice />

              {guest.status !== 'checked_in' && !isEventPast(event.date) && (
                <button
                  type="button"
                  data-pass-exclude="true"
                  onClick={() => setShowCancelDialog(true)}
                  className="mt-4 text-xs text-[var(--invite-text-muted)] hover:text-red-500 active:text-red-500 underline underline-offset-2 transition-colors"
                >
                  Cancelar mi asistencia
                </button>
              )}
            </>
          )}

          {guest.rsvpStatus === 'pending' && !showMaybeMessage && (
            <fieldset className="mt-4 pt-4 border-0 border-t p-0 m-0" style={{ borderColor: 'var(--invite-border)' }}>
              <legend className="text-sm font-medium mb-3 p-0">¿Asistirás a este evento?</legend>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleConfirmYes}
                  disabled={rsvpSaving}
                  className="invite-btn-primary rounded-md px-4 py-3 text-sm font-medium transition-opacity disabled:opacity-50"
                  style={{ '--invite-btn-text': getAccentContrastText(event.accentColor || getTemplate(event.templateId).vars.accent) } as CSSProperties}
                >
                  Sí, asistiré
                </button>
                <button
                  onClick={() => setShowMaybeMessage(true)}
                  disabled={rsvpSaving}
                  className="border rounded-md px-4 py-3 text-sm font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
                  style={{ borderColor: 'var(--invite-border)' }}
                >
                  No estoy seguro
                </button>
                <button
                  onClick={() => setShowDeclineModal(true)}
                  disabled={rsvpSaving}
                  className="text-sm py-2 transition-colors disabled:opacity-50 text-[var(--invite-text-muted)] hover:text-[var(--invite-text)] underline underline-offset-2 mt-1"
                >
                  No podré asistir
                </button>
              </div>
              {rsvpError && <p className="text-sm text-red-500 mt-3">{rsvpError}</p>}

              <AccessibleModal
                open={showDeclineModal}
                onClose={() => setShowDeclineModal(false)}
                label="¿Seguro que no podrás asistir?"
                surfaceClassName="bg-[var(--invite-surface)]"
                className="p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 text-left"
              >
                <h2 className="text-base font-semibold mb-2 text-[var(--invite-text)]">¿Seguro que no podrás asistir?</h2>
                <p className="text-sm text-[var(--invite-text-muted)] mb-5">
                  Si cambias de opinión, contáctale al organizador.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setShowDeclineModal(false)}
                    className="w-full border rounded-md px-4 py-3 text-sm font-medium hover:opacity-80 transition-opacity"
                    style={{ borderColor: 'var(--invite-border)' }}
                  >
                    Volver
                  </button>
                  <button
                    onClick={handleConfirmNo}
                    disabled={rsvpSaving}
                    className="w-full text-white rounded-md px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 bg-[var(--invite-accent)]"
                  >
                    Sí, no asistiré
                  </button>
                </div>
              </AccessibleModal>
            </fieldset>
          )}

          {guest.rsvpStatus === 'pending' && showMaybeMessage && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--invite-border)' }}>
              <IconClock className="w-8 h-8 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Ok, tómate tu tiempo</p>
              <p className="text-sm mt-2 mb-4 text-[var(--invite-text-muted)]">
                Tu invitación queda pendiente. Vuelve a este enlace cuando quieras para confirmar tu asistencia.
              </p>
              <button onClick={() => setShowMaybeMessage(false)} className="text-sm font-medium text-[var(--invite-accent)]">
                Responder ahora
              </button>
            </div>
          )}
        </>
      )}

      {event.requiresPayment && guest.rsvpStatus !== 'no' && (
        <div className="mt-4 pt-4 text-left border-t" style={{ borderColor: 'var(--invite-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 text-[var(--invite-text-muted)]">Pago de entrada</p>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-sm">
              Monto a pagar: <strong>{event.currency}{(event.ticketPrice * (1 + guest.companions.length)).toLocaleString('es')}</strong>
            </span>
            <span className="inline-flex items-center gap-2 shrink-0">
              {guest.paymentStatus === 'paid' && <ThemeSeal templateId={event.templateId} />}
              <span
                className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                  guest.paymentStatus === 'paid' ? 'invite-badge-positive bg-[var(--invite-accent-soft)] text-[var(--invite-accent-dark)]' : 'bg-amber-100 text-amber-700'
                }`}
              >
                <IconTicket className={`w-3.5 h-3.5 ${guest.paymentStatus === 'paid' ? 'text-green-500' : ''}`} />
                {guest.paymentStatus === 'paid' ? 'Pagado' : guest.paymentStatus === 'pending_confirmation' ? 'En revisión' : 'Pendiente'}
              </span>
            </span>
          </div>

          {guest.paymentStatus === 'pending_confirmation' && (
            <p className="text-sm font-medium mb-2 text-amber-700">
              Comprobante recibido — el organizador lo va a revisar pronto.
            </p>
          )}

          <TransferInfoDisplay event={event} className="mb-2" />
          <PaymentProofForm guest={guest} eventPaymentMethods={event.paymentMethods} proof={proof} />

          {event.organizerContactPhone && (
            <a
              href={organizerWhatsappUrl(
                event.organizerContactPhone,
                guest.paymentStatus === 'paid' || guest.paymentStatus === 'pending_confirmation'
                  ? `Hola! Tengo una consulta sobre mi pago de "${event.name}" (invitado: ${guest.name} ${guest.lastName || ''}).`
                  : `Hola! Te envío mi comprobante de pago para "${event.name}" (invitado: ${guest.name} ${guest.lastName || ''}).`,
                event.organizerContactPhoneCountry,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center justify-center gap-2 w-full bg-[#25D366] text-white rounded-md px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <IconWhatsApp className="w-4 h-4" />
              {guest.paymentStatus === 'paid' || guest.paymentStatus === 'pending_confirmation' ? 'Contactar al organizador' : 'Enviar comprobante por WhatsApp'}
            </a>
          )}
        </div>
      )}
      </div>

      {guest.rsvpStatus === 'yes' && (
        <div aria-hidden="true" className="fixed top-0 pointer-events-none" style={{ left: '-9999px' }}>
          <GuestPassTicket ref={ticketRef} event={event} guest={guest} passUrl={passUrl} />
        </div>
      )}

      {editOpen && (
        <GuestEditModal
          eventId={eventId}
          event={event}
          guest={guest}
          lockToken={deviceToken}
          onClose={() => setEditOpen(false)}
          onSaved={(patch) => { onGuestSaved(patch); setEditOpen(false) }}
        />
      )}

      {accountGate.gateOpen && (
        <GuestSignupPrompt
          eventId={eventId}
          guest={guest}
          source="guest_pass"
          gateMode
          onContinueWithoutAccount={accountGate.resolve}
          onDismiss={accountGate.cancel}
          onSuccess={accountGate.resolve}
        />
      )}

      <ConfirmDialog
        open={showCancelDialog}
        title="Cancelar mi asistencia"
        message={
          <>
            ¿Estás seguro de que deseas cancelar tu asistencia? Serás eliminado de la lista de invitados y perderás el
            acceso a esta invitación.
            {cancelError && <p className="text-red-500 mt-2">{cancelError}</p>}
            <p className="mt-2">
              Si deseas asistir nuevamente, deberás registrarte otra vez (si el evento lo permite) o solicitar una
              nueva invitación al organizador.
            </p>
          </>
        }
        confirmLabel={cancelSaving ? 'Cancelando…' : 'Sí, cancelar mi asistencia'}
        cancelLabel="Volver"
        danger
        onConfirm={() => { if (!cancelSaving) onCancelAttendance() }}
        onCancel={() => setShowCancelDialog(false)}
      />
    </div>
  )
}
