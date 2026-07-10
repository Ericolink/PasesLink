import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import confetti from 'canvas-confetti'
import { getEvent, subscribeToEvent } from '../firebase/events'
import { canSubmitPaymentProof, checkInGuest, claimGuestPass, findGuestByToken, partySize, setGuestPaymentStatus, setGuestRsvp, submitPaymentProof } from '../firebase/guests'
import { GuestEditModal } from '../components/GuestEditModal'
import { saveUserInvitation } from '../firebase/userProfile'
import { useAuth } from '../hooks/useAuth'
import { useEventPermissions } from '../hooks/useEventPermissions'
import { resolveEventPermissions } from '../types/coOrganizerPermissions'
import type { EventData, GuestData, PaymentMethod, RsvpStatus } from '../types'
import { IconAlertTriangle, IconCheckCircle, IconClock, IconDownload, IconEdit, IconHeart, IconTicket, IconWhatsApp, IconX } from '../components/Icons'
import { WallSection } from '../components/WallSection'
import { EventMap } from '../components/EventMap'
import { InvitationCard } from '../components/InvitationCard'
import { InvitationThemeRoot } from '../components/InvitationThemeRoot'
import { ThemeOrnament } from '../components/ThemeOrnament'
import { ThemeSeal } from '../components/ThemeSeal'
import { InviteDivider } from '../components/InviteDivider'
import { EventCountdown } from '../components/EventCountdown'
import { TimelineDisplay } from '../components/TimelineDisplay'
import { PassSecurityNotice } from '../components/PassSecurityNotice'
import { InAppBrowserBanner } from '../components/InAppBrowserBanner'
import { SkeletonBlock } from '../components/Skeleton'
import { PerforatedDivider } from '../components/PerforatedDivider'
import { PassInfoCell } from '../components/PassInfoCell'
import { GuestPassTicket } from '../components/GuestPassTicket'
import { formatDate, formatTime12h } from '../utils/time'
import { optimizedImageUrl } from '../utils/cloudinary'
import { downloadPassImage } from '../utils/downloadPass'
import { getTemplate } from '../templates/registry'
import { buildPassUrl } from '../utils/qrUrl'

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  transfer: 'Transferencia',
  cash: 'Efectivo',
}

// Mismo canal (WhatsApp) que ya se usa para "compartir pase con
// acompañantes" más abajo en este archivo — reutiliza wa.me en vez de sumar
// un proveedor nuevo (EmailJS ya está en su tope de plantillas gratis, ver
// memoria del proyecto). `context` arma el mensaje prellenado según lo que el
// invitado necesita resolver (enviar comprobante, consultar, pedir
// devolución o reportar un problema de acceso — todo el mismo canal, pedido
// explícito).
function organizerWhatsappUrl(phone: string, message: string): string {
  const digits = phone.replace(/[^\d+]/g, '')
  return `https://wa.me/${digits.replace(/^\+/, '')}?text=${encodeURIComponent(message)}`
}

// El navegador reutiliza la misma instancia de GuestPass al navegar entre dos
// URLs /pass/:eventId/:qrToken distintas (mismo patrón de ruta) — sin esta key,
// el estado de check-in del invitado anterior queda pegado al escanear el
// siguiente QR, mostrando "ya registrado" sin haber hecho el check-in real.
export function GuestPass() {
  const { qrToken } = useParams<{ qrToken: string }>()
  return <GuestPassInner key={qrToken} />
}

function GuestPassInner() {
  const { eventId, qrToken } = useParams<{ eventId: string; qrToken: string }>()
  const { user, loading: authLoading } = useAuth()
  const [event, setEvent] = useState<EventData | null>(null)
  const [guest, setGuest] = useState<GuestData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [deviceToken, setDeviceToken] = useState<string | null>(null)
  const [multiDevice, setMultiDevice] = useState(false)
  const [multiDeviceDismissed, setMultiDeviceDismissed] = useState(false)
  const [rsvpSaving, setRsvpSaving] = useState(false)
  const [rsvpError, setRsvpError] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  const [showMaybeMessage, setShowMaybeMessage] = useState(false)
  const [showDeclineModal, setShowDeclineModal] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [checkInState, setCheckInState] = useState<'idle' | 'loading' | 'done' | 'already' | 'payment_required' | 'blocked' | 'not_found'>('idle')
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [proofNote, setProofNote] = useState('')
  const [proofFormOpen, setProofFormOpen] = useState(false)
  const [proofSubmitting, setProofSubmitting] = useState(false)
  const [proofError, setProofError] = useState<string | null>(null)
  const perms = useEventPermissions(event, user)
  const qrWrapperRef = useRef<HTMLDivElement>(null)
  const ticketRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Esperar a que useAuth() confirme la sesión antes de decidir si el visor
    // es organizador o invitado público — si no, una carga fresca de la página
    // puede tratar momentáneamente al organizador como invitado anónimo
    // (auth.currentUser todavía no resuelto) y aplicarle el flujo de RSVP/lock
    // en vez del de check-in.
    if (!eventId || !qrToken || authLoading) return
    Promise.all([getEvent(eventId), findGuestByToken(eventId, qrToken)])
      .then(async ([eventData, guestData]) => {
        if (!eventData || !guestData) {
          setError(true)
          return
        }
        setEvent(eventData)

        // Si el visor es organizador o co-org, no aplicar lock — solo cargar el guest
        const viewerPerms = resolveEventPermissions(eventData, user?.uid)
        if (viewerPerms.isOwner || viewerPerms.isCoOrg) {
          setGuest(guestData)
          if (guestData.status === 'checked_in') setCheckInState('already')
          return
        }

        // Vincula (o revincula) este pase a "Mis invitaciones" cada vez que su
        // dueño lo abre logueado — cubre tanto al que se autoregistró sin
        // cuenta y la creó después (EventJoin.tsx solo guarda esto si YA
        // estaba logueado al registrarse, así que ese caso nunca queda
        // guardado si no se repite acá) como a cualquier invitado de lista
        // que recién ahora abre sesión. `saveUserInvitation` es un upsert
        // (merge:true), así que repetirlo en cada vista es inofensivo.
        if (user) {
          void saveUserInvitation(user.uid, {
            eventId,
            eventName: eventData.name,
            eventDate: eventData.date,
            eventLocation: eventData.location,
            eventCoverImage: eventData.coverImage,
            eventTemplateId: eventData.templateId,
            eventAccentColor: eventData.accentColor,
            guestName: guestData.isGroup ? guestData.name : `${guestData.name} ${guestData.lastName || ''}`.trim(),
            qrToken: guestData.qrToken,
            type: 'walkin',
          })
        }

        // Reconoce este dispositivo/navegador para el pase (ver
        // claimGuestPass) — ya no "compite" por un único lock: se suma a la
        // lista de dispositivos reconocidos (con tope y rotación LRU), así
        // que esta llamada nunca deja al invitado bloqueado.
        const storageKey = `paselink_lock_${eventId}_${qrToken}`
        const localToken = localStorage.getItem(storageKey) || crypto.randomUUID()
        localStorage.setItem(storageKey, localToken)
        const devices = await claimGuestPass(eventId, guestData.id, localToken)
        setDeviceToken(localToken)
        setMultiDevice(devices.length > 1)
        setGuest({ ...guestData, lockToken: localToken, lockTokens: devices })
      })
      .catch((err) => {
        console.error('Error loading guest pass:', err)
        setError(true)
      })
      .finally(() => setLoading(false))
  }, [eventId, qrToken, user, authLoading])

  // Suscripción en vivo al evento, aparte del bootstrap de arriba (que hace
  // el claim del pase una sola vez): un pase ya emitido y abierto debe
  // reflejar los cambios que el organizador guarde después (horario,
  // portada, instrucciones de pago, plantilla, etc.), no solo los pases que
  // se generen de ahí en adelante.
  useEffect(() => {
    if (!eventId) return
    const unsubscribe = subscribeToEvent(eventId, (ev) => {
      if (ev) setEvent(ev)
    })
    return unsubscribe
  }, [eventId])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <SkeletonBlock className="w-full h-40 rounded-2xl mb-4" />
          <SkeletonBlock className="h-5 w-2/3 mx-auto mb-2" />
          <SkeletonBlock className="h-4 w-1/2 mx-auto mb-6" />
          <SkeletonBlock className="w-40 h-40 mx-auto rounded-xl mb-4" />
          <SkeletonBlock className="h-11 w-full rounded-md" />
        </div>
      </div>
    )
  }
  if (error || !event || !guest || !eventId || !qrToken) {
    return (
      <div className="text-center mt-16 px-4">
        <p className="text-gray-500">Pase no encontrado.</p>
        <Link to="/dashboard" className="inline-block mt-4 bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors">
          ← Volver al Dashboard
        </Link>
      </div>
    )
  }

  const isOrg = perms.isOwner || perms.isCoOrg
  const passUrl = buildPassUrl(eventId, qrToken)

  async function handleCheckIn() {
    if (!eventId || !qrToken || !user) return
    setCheckInState('loading')
    const result = await checkInGuest(eventId, qrToken, user.uid, user.email)
    if (result.status === 'success') {
      setGuest((g) => g ? { ...g, status: 'checked_in' } : g)
      setCheckInState('done')
      const tpl = getTemplate(event!.templateId).vars
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.5 },
        colors: [event!.accentColor || tpl.accent, tpl.accentDark, tpl.accentSoft],
        shapes: tpl.confettiShape ? [tpl.confettiShape] : undefined,
      })
    } else if (result.status === 'already_checked_in') {
      setCheckInState('already')
    } else if (result.status === 'payment_required') {
      setCheckInState('payment_required')
    } else if (result.status === 'blocked_final_exit') {
      setCheckInState('blocked')
    } else {
      setCheckInState('not_found')
    }
  }

  async function handleMarkPaid(method?: PaymentMethod) {
    if (!eventId || !guest) return
    setPaymentSaving(true)
    setPaymentError(null)
    try {
      await setGuestPaymentStatus(eventId, guest.id, 'paid', method)
      setGuest((g) => g ? { ...g, paymentStatus: 'paid', paymentMethod: method ?? g.paymentMethod } : g)
      if (checkInState === 'payment_required') setCheckInState('idle')
    } catch (err) {
      console.error('Error marking guest as paid:', err)
      setPaymentError(err instanceof Error ? err.message : 'No se pudo actualizar el estado de pago. Intenta de nuevo.')
    } finally {
      setPaymentSaving(false)
    }
  }

  // Deshace un pago confirmado, o rechaza un comprobante en revisión — en
  // ambos casos el invitado queda en 'unpaid' (ver setGuestPaymentStatus),
  // sin ningún efecto sobre guestCount/peopleCount: el invitado ya contaba
  // desde que se registró, pague o no.
  async function handleMarkUnpaid() {
    if (!eventId || !guest) return
    setPaymentSaving(true)
    setPaymentError(null)
    try {
      await setGuestPaymentStatus(eventId, guest.id, 'unpaid')
      setGuest((g) => g ? { ...g, paymentStatus: 'unpaid' } : g)
    } catch (err) {
      console.error('Error marking guest as unpaid:', err)
      setPaymentError('No se pudo actualizar el estado de pago. Intenta de nuevo.')
    } finally {
      setPaymentSaving(false)
    }
  }

  // Acción del invitado: "Ya pagué / Comprobante enviado" — pasa a esperar
  // que el organizador lo apruebe o lo rechace (ver submitPaymentProof en
  // firebase/guests.ts). Sin límite de tiempo.
  async function handleSubmitProof() {
    if (!eventId || !guest) return
    if (!proofNote.trim()) {
      setProofError('Ingresá el número de referencia de tu transferencia.')
      return
    }
    setProofSubmitting(true)
    setProofError(null)
    try {
      await submitPaymentProof(eventId, guest.id, proofNote)
      setGuest((g) => g ? { ...g, paymentStatus: 'pending_confirmation', paymentNote: proofNote.trim() } : g)
      setProofFormOpen(false)
    } catch (err) {
      console.error('Error submitting payment proof:', err)
      setProofError('No se pudo enviar. Intenta de nuevo.')
    } finally {
      setProofSubmitting(false)
    }
  }

  // Vista del organizador: solo check-in, sin lock ni RSVP
  if (isOrg) {
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
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-[var(--invite-text-muted)]">Número de referencia</p>
                  <p className="text-sm font-mono font-medium text-[var(--invite-text)] break-all">{guest.paymentNote}</p>
                </div>
              )}

              {paymentError && <p className="text-xs text-red-600">{paymentError}</p>}

              {perms.confirmPayments && (
                guest.paymentStatus === 'paid' ? (
                  <button
                    onClick={() => handleMarkUnpaid()}
                    disabled={paymentSaving}
                    className="text-sm font-medium disabled:opacity-50 text-[var(--invite-accent)]"
                  >
                    Marcar como no pagado
                  </button>
                ) : guest.paymentStatus === 'pending_confirmation' ? (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleMarkPaid(guest.paymentMethod || undefined)}
                      disabled={paymentSaving}
                      className="text-sm font-medium disabled:opacity-50 text-[var(--invite-accent)]"
                    >
                      Aprobar pago
                    </button>
                    <button
                      onClick={() => handleMarkUnpaid()}
                      disabled={paymentSaving}
                      className="text-sm font-medium disabled:opacity-50 text-red-600"
                    >
                      Rechazar comprobante
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleMarkPaid(guest.paymentMethod || event.paymentMethods[0])}
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
                <QRCodeCanvas value={passUrl} size={200} marginSize={2} />
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
                onClick={handleCheckIn}
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

  async function handleRsvp(rsvpStatus: RsvpStatus) {
    if (!guest) return
    setRsvpSaving(true)
    setRsvpError(null)
    try {
      await setGuestRsvp(eventId!, qrToken!, rsvpStatus)
      // Solo se actualiza el estado local después de confirmar que Firestore
      // guardó el cambio — si la escritura falla, el invitado se queda en el
      // estado anterior y ve el error en vez de una confirmación falsa.
      setGuest({ ...guest, rsvpStatus })
    } catch (err) {
      console.error('Error guardando RSVP:', err)
      setRsvpError('No se guardó. Intenta de nuevo.')
    } finally {
      setRsvpSaving(false)
    }
  }

  async function handleDownload() {
    if (!ticketRef.current || !guest) return
    const filename = `pase-${guest.name.replace(/\s+/g, '_').slice(0, 30)}.png`
    await downloadPassImage(ticketRef.current, filename)
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 2000)
  }

  const timeLabel = event.startTime
    ? `${formatTime12h(event.startTime)}${event.endTime ? ` – ${formatTime12h(event.endTime)}` : ''}`
    : null

  return (
    <InvitationThemeRoot
      templateId={event.templateId}
      accentOverride={event.accentColor}
      className="max-w-sm mx-auto px-4 py-12 text-center"
    >
      {/* ── BOARDING PASS CARD ───────────────────────────────────────────
          Sin overflow-hidden en el wrapper para que el divisor perforado
          pueda extenderse de borde a borde con sus semicírculos notch. */}
      <div
        className="invite-card border bg-[var(--invite-surface)] text-[var(--invite-text)] [font-family:var(--invite-font)] [border-radius:var(--invite-radius)]"
        style={{
          boxShadow: 'var(--invite-shadow)',
          borderColor: 'var(--invite-border)',
          borderTopColor: 'var(--invite-accent)',
          borderTopWidth: '4px',
        }}
      >
        {/* Cover image */}
        {event.coverImage && (
          <div
            className="invite-cover w-full overflow-hidden"
            style={{ borderRadius: 'var(--invite-radius) var(--invite-radius) 0 0' }}
          >
            <img
              src={optimizedImageUrl(event.coverImage, 800)}
              alt={event.name}
              loading="lazy"
              crossOrigin="anonymous"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* ── SECCIÓN SUPERIOR: Detalles del evento ── */}
        <div className="px-6 pt-5 pb-4 text-center">
          <h1 className="text-xl font-semibold text-[var(--invite-text)]">{event.name}</h1>
          <ThemeOrnament templateId={event.templateId} className="w-16 h-6 mx-auto mt-1.5 text-[var(--invite-accent)]" />

          {/* Info grid estilo boarding pass */}
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-left">
            <PassInfoCell label="Fecha" value={formatDate(event.date)} />
            {timeLabel && <PassInfoCell label="Hora" value={timeLabel} />}
            <PassInfoCell
              label="Lugar"
              value={event.location}
              className={!timeLabel ? 'col-span-2' : ''}
            />
            {event.dressCode && (
              <PassInfoCell
                label="Vestimenta"
                value={event.dressCode}
                className={!timeLabel ? '' : 'col-span-2'}
              />
            )}
          </div>

          <EventCountdown
            date={event.date}
            startTime={event.startTime}
            endTime={event.endTime}
            className="mt-3 mx-auto"
          />

          {event.description && (
            <p className="mt-4 text-sm text-[var(--invite-text-muted)] leading-relaxed whitespace-pre-line text-left">
              {event.description}
            </p>
          )}
        </div>

        <PerforatedDivider />

        {/* ── SECCIÓN INFERIOR: Invitado + QR ── */}
        <div className="px-6 pb-6 pt-4 text-center">
          <InAppBrowserBanner />

          {/* Aviso informativo, no bloqueante: el invitado sigue viendo su
              QR y puede seguir operando su pase con normalidad (ver
              claimGuestPass) — solo le avisamos por si no reconoce el otro
              acceso. */}
          {multiDevice && !multiDeviceDismissed && (
            <div
              className="mb-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-sm"
              style={{ borderColor: 'var(--invite-border)', background: 'var(--invite-surface)' }}
            >
              <IconAlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-400" />
              <div className="flex-1">
                <p className="text-[var(--invite-text)]">Este pase también se abrió desde otro dispositivo o navegador.</p>
                <p className="mt-0.5 text-[var(--invite-text-muted)]">
                  Si fuiste tú (por ejemplo, al cambiar de Instagram/WhatsApp a Chrome o Safari), no hace falta hacer
                  nada. Si no reconoces ese acceso, contacta al organizador.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMultiDeviceDismissed(true)}
                aria-label="Cerrar aviso"
                className="text-[var(--invite-text-muted)] hover:text-[var(--invite-text)]"
              >
                <IconX className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {guest.rsvpStatus === 'no' && (
            <div className="py-8">
              <IconHeart className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Qué lástima, ¡te vamos a extrañar!</p>
              <p className="text-sm mt-2 text-[var(--invite-text-muted)]">
                Registramos que no podrás asistir. Si cambias de opinión, contacta al organizador del evento para que
                te genere un nuevo pase.
              </p>
            </div>
          )}

          {/* QR siempre visible para el invitado — borroso si RSVP pendiente
              (incentivo visual para confirmar), claro una vez que confirma. */}
          {guest.rsvpStatus !== 'no' && (
            <>
              <p className="text-lg font-semibold text-[var(--invite-text)] mb-0.5">{guest.name}</p>
              {guest.isGroup ? (
                <p className="text-sm text-[var(--invite-text-muted)] mb-3">{partySize(guest)} integrantes</p>
              ) : (
                guest.companions.length > 0 && (
                  <p className="text-sm text-[var(--invite-text-muted)] mb-3">+ {guest.companions.length} acompañante(s)</p>
                )
              )}

              {!guest.isGroup && (
                <button
                  data-pass-exclude="true"
                  onClick={() => setEditOpen(true)}
                  className="inline-flex items-center gap-1 text-xs mb-3 text-[var(--invite-text-muted)] hover:text-[var(--invite-text)] underline underline-offset-2"
                >
                  <IconEdit className="w-3 h-3" /> Editar mis datos
                </button>
              )}

              <div className="relative flex justify-center my-5" ref={qrWrapperRef}>
                <div
                  className="invite-qr-frame p-4 border rounded-xl inline-flex items-center justify-center transition-all duration-500"
                  style={{
                    borderColor: 'var(--invite-border)',
                    filter: guest.rsvpStatus === 'pending' ? 'blur(6px)' : 'none',
                    background: 'var(--invite-surface)',
                  }}
                >
                  <QRCodeCanvas value={passUrl} size={200} marginSize={2} />
                </div>

                {guest.rsvpStatus === 'pending' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
                    <IconAlertTriangle className="w-8 h-8 text-[var(--invite-accent)]" />
                    <p className="text-xs font-semibold text-[var(--invite-text)] text-center px-6 leading-snug">
                      Confirma tu asistencia para desbloquear tu pase
                    </p>
                  </div>
                )}
              </div>

              {guest.rsvpStatus === 'yes' && (
                <>
                  {guest.status === 'checked_in' ? (
                    <span className="inline-flex items-center gap-2 mb-3">
                      <ThemeSeal templateId={event.templateId} />
                      <p className="invite-badge-positive inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full font-medium bg-[var(--invite-accent-soft)] text-[var(--invite-accent-dark)]">
                        <IconCheckCircle className="w-4 h-4 text-green-500" /> Entrada registrada
                      </p>
                    </span>
                  ) : (
                    <p className="text-sm text-[var(--invite-text-muted)] mb-3">Presenta este código QR en la entrada</p>
                  )}

                  <div data-pass-exclude="true" className="flex flex-col sm:flex-row gap-2 justify-center flex-wrap">
                    <button
                      onClick={handleDownload}
                      className="inline-flex items-center justify-center gap-2 text-white rounded-md px-4 py-3 sm:py-2 text-sm font-medium hover:opacity-90 transition-opacity bg-[var(--invite-accent)]"
                    >
                      {downloaded ? <IconCheckCircle className="w-4 h-4" /> : <IconDownload className="w-4 h-4" />}
                      {downloaded ? 'Descargado' : 'Descargar pase'}
                    </button>
                    {guest.companions.length > 0 && (
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(`Aquí está mi pase para ${event.name}: ${passUrl}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Comparte con tus acompañantes"
                        className="inline-flex items-center justify-center gap-2 bg-[#25D366] text-white rounded-md px-4 py-3 sm:py-2 text-sm font-medium hover:opacity-90 transition-opacity"
                      >
                        <IconWhatsApp className="w-4 h-4" /> Compartir
                      </a>
                    )}
                  </div>
                  <PassSecurityNotice />
                </>
              )}

              {/* RSVP — solo si pendiente */}
              {guest.rsvpStatus === 'pending' && !showMaybeMessage && (
                <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--invite-border)' }}>
                  <p className="text-sm font-medium mb-3">¿Asistirás a este evento?</p>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleRsvp('yes')}
                      disabled={rsvpSaving}
                      className="text-white rounded-md px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 bg-[var(--invite-accent)]"
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

                  {showDeclineModal && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                      <div className="bg-[var(--invite-surface)] rounded-2xl shadow-2xl w-full max-w-sm p-6 text-left">
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
                            onClick={() => { setShowDeclineModal(false); void handleRsvp('no') }}
                            disabled={rsvpSaving}
                            className="w-full text-white rounded-md px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 bg-[var(--invite-accent)]"
                          >
                            Sí, no asistiré
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
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

          {/* ── Información adicional ── */}
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

              {(guest.paymentMethod === 'transfer' || (!guest.paymentMethod && event.paymentInstructions)) && event.paymentInstructions && (
                <p className="text-sm whitespace-pre-line text-[var(--invite-text-muted)]">{event.paymentInstructions}</p>
              )}
              {guest.paymentMethod === 'cash' && (
                <p className="text-sm text-[var(--invite-text-muted)]">Pagás en efectivo, presencialmente, el día del evento.</p>
              )}

              {/* "Ya pagué" — solo transferencia, y solo mientras tenga algo
                  que confirmar (ver canSubmitPaymentProof). Independiente del
                  botón de WhatsApp de abajo: este marca el estado en la app
                  (pausa el cronómetro), WhatsApp sigue siendo el canal para
                  mandar la imagen real del comprobante. */}
              {canSubmitPaymentProof(guest) && (
                <div className="mt-3">
                  {!proofFormOpen ? (
                    <button
                      onClick={() => setProofFormOpen(true)}
                      className="w-full border rounded-md px-4 py-3 text-sm font-semibold hover:opacity-80 transition-opacity text-[var(--invite-accent)]"
                      style={{ borderColor: 'var(--invite-accent)' }}
                    >
                      Ya pagué / Comprobante enviado
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-[var(--invite-text-muted)]">
                        Número de referencia de tu transferencia *
                      </label>
                      <input
                        type="text"
                        required
                        value={proofNote}
                        onChange={(e) => setProofNote(e.target.value)}
                        maxLength={300}
                        placeholder="Ej: op. 123456789"
                        className="w-full rounded-md border px-3 py-2 text-sm bg-[var(--invite-surface)] text-[var(--invite-text)]"
                        style={{ borderColor: 'var(--invite-border)' }}
                      />
                      <p className="text-xs text-[var(--invite-text-muted)]">
                        Lo va a ver el organizador para poder cotejarlo con su resumen bancario.
                      </p>
                      {proofError && <p className="text-xs text-red-600">{proofError}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={handleSubmitProof}
                          disabled={proofSubmitting || !proofNote.trim()}
                          className="flex-1 text-white rounded-md px-4 py-3 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 bg-[var(--invite-accent)]"
                        >
                          {proofSubmitting ? 'Enviando…' : 'Confirmar'}
                        </button>
                        <button
                          onClick={() => setProofFormOpen(false)}
                          disabled={proofSubmitting}
                          className="border rounded-md px-4 py-3 text-sm font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
                          style={{ borderColor: 'var(--invite-border)' }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {event.organizerContactPhone && (
                <a
                  href={organizerWhatsappUrl(
                    event.organizerContactPhone,
                    guest.paymentStatus === 'paid' || guest.paymentStatus === 'pending_confirmation'
                      ? `Hola! Tengo una consulta sobre mi pago de "${event.name}" (invitado: ${guest.name} ${guest.lastName || ''}).`
                      : `Hola! Te envío mi comprobante de pago para "${event.name}" (invitado: ${guest.name} ${guest.lastName || ''}).`,
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

          {event.timeline && event.timeline.length > 0 && (
            <div className="mt-4 pt-4 text-left border-t" style={{ borderColor: 'var(--invite-border)' }}>
              <TimelineDisplay entries={event.timeline} />
            </div>
          )}

          {event.welcomeMessage && (
            <p className="mt-4 pt-4 text-sm font-medium italic border-t text-[var(--invite-accent)]" style={{ borderColor: 'var(--invite-border)' }}>
              {event.welcomeMessage}
            </p>
          )}
        </div>
      </div>
      {/* Boleto exclusivo para exportar (GuestPassTicket) — montado siempre
          que el botón "Descargar pase" existe (mismo gate), fuera de
          pantalla vía position:fixed (nunca display:none/visibility:hidden,
          que impiden el pintado necesario para toPng). Se mantiene montado
          en vez de crearse recién al hacer click para que el QR (SVG,
          síncrono) ya esté pintado y estable en el momento de la captura. */}
      {guest.rsvpStatus === 'yes' && (
        <div aria-hidden="true" className="fixed top-0 pointer-events-none" style={{ left: '-9999px' }}>
          <GuestPassTicket ref={ticketRef} event={event} guest={guest} passUrl={passUrl} />
        </div>
      )}
      {/* ── Secciones externas al boarding pass ── */}
      {event.mapsUrl && (
        <>
          <InviteDivider templateId={event.templateId} />
          <EventMap mapsUrl={event.mapsUrl} />
        </>
      )}
      {/* Muro del evento — Historias + fotos ya viven dentro de WallSection */}
      {eventId && (
        guest.rsvpStatus === 'yes' ? (
          <WallSection eventId={eventId} eventName={event?.name} guestName={guest.name} guestToken={qrToken} templateId={event.templateId} />
        ) : (
          <div className="mt-8 pt-6 border-t text-center" style={{ borderColor: 'var(--invite-border)' }}>
            <p className="text-sm text-[var(--invite-text-muted)]">Confirma tu asistencia para ver el muro del evento.</p>
          </div>
        )
      )}
      {editOpen && eventId && (
        <GuestEditModal
          eventId={eventId}
          event={event}
          guest={guest}
          lockToken={deviceToken}
          onClose={() => setEditOpen(false)}
          onSaved={(patch) => setGuest((g) => (g ? { ...g, ...patch } : g))}
        />
      )}
    </InvitationThemeRoot>
  )
}
