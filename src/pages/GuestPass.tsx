import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import confetti from 'canvas-confetti'
import { getEvent } from '../firebase/events'
import { checkInGuest, claimGuestOwnership, claimGuestPass, deleteGuest, findGuestByToken, partySize, setGuestPaymentStatus, setGuestRsvp } from '../firebase/guests'
import { GuestEditModal } from '../components/GuestEditModal'
import { GuestSignupPrompt } from '../components/GuestSignupPrompt'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { saveUserInvitation, deleteUserInvitation } from '../firebase/userProfile'
import { useAuth } from '../hooks/useAuth'
import { useEventPermissions } from '../hooks/useEventPermissions'
import { resolveEventPermissions } from '../types/coOrganizerPermissions'
import type { EventData, GuestData, PaymentMethod, RsvpStatus } from '../types'
import { IconAlertTriangle, IconCalendar, IconCheckCircle, IconClock, IconDownload, IconEdit, IconHeart, IconTicket, IconUserPlus, IconWhatsApp } from '../components/Icons'
import { WallSection } from '../components/WallSection'
import { EventMap } from '../components/EventMap'
import { InvitationThemeRoot } from '../components/InvitationThemeRoot'
import { ThemeOrnament } from '../components/ThemeOrnament'
import { ThemeSeal } from '../components/ThemeSeal'
import { toWhatsAppPhone } from '../utils/phone'
import { InviteDivider } from '../components/InviteDivider'
import { EventCountdown } from '../components/EventCountdown'
import { TimelineDisplay } from '../components/TimelineDisplay'
import { PassSecurityNotice } from '../components/PassSecurityNotice'
import { InAppBrowserBanner } from '../components/InAppBrowserBanner'
import { InlineNotice } from '../components/InlineNotice'
import { NoticeStack } from '../components/NoticeStack'
import { useInAppBrowserNotice } from '../hooks/useInAppBrowserNotice'
import { Modal } from '../components/Modal'
import { ErrorFallbackCTA } from '../components/ErrorFallbackCTA'
import { SkeletonBlock } from '../components/Skeleton'
import { PerforatedDivider } from '../components/PerforatedDivider'
import { PassInfoCell } from '../components/PassInfoCell'
import { GuestPassTicket } from '../components/GuestPassTicket'
import { OrganizerPassView, type CheckInState } from '../components/OrganizerPassView'
import { PaymentProofForm } from '../components/PaymentProofForm'
import { usePaymentProof } from '../hooks/usePaymentProof'
import { formatDate, formatTime12h, isEventPast } from '../utils/time'
import { optimizedImageUrl } from '../utils/cloudinary'
import { downloadPassImage } from '../utils/downloadPass'
import { downloadIcsFile } from '../utils/calendar'
import { getTemplate } from '../templates/registry'
import { buildPassUrl, QR_QUIET_ZONE_MODULES } from '../utils/qrUrl'


// Mismo canal (WhatsApp) que ya se usa para "compartir pase con
// acompañantes" más abajo en este archivo — reutiliza wa.me en vez de sumar
// un proveedor nuevo (EmailJS ya está en su tope de plantillas gratis).
// `context` arma el mensaje prellenado según lo que el
// invitado necesita resolver (enviar comprobante, consultar, pedir
// devolución o reportar un problema de acceso — todo el mismo canal, pedido
// explícito).
function organizerWhatsappUrl(phone: string, message: string): string {
  return `https://wa.me/${toWhatsAppPhone(phone)}?text=${encodeURIComponent(message)}`
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
  const location = useLocation()
  const { user, loading: authLoading } = useAuth()
  const [event, setEvent] = useState<EventData | null>(null)
  const [guest, setGuest] = useState<GuestData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [deviceToken, setDeviceToken] = useState<string | null>(null)
  const [multiDevice, setMultiDevice] = useState(false)
  const [multiDeviceDismissed, setMultiDeviceDismissed] = useState(false)
  const inAppBrowserNotice = useInAppBrowserNotice()
  const showMultiDeviceNotice = multiDevice && !multiDeviceDismissed
  // Cuando ambos avisos pueden mostrarse a la vez, se agrupan en un solo
  // contenedor (NoticeStack) para no duplicar borde/fondo/margen y comerse
  // el doble de alto de viewport — ver InlineNotice/NoticeStack.
  const groupNotices = inAppBrowserNotice.visible && showMultiDeviceNotice
  const [rsvpSaving, setRsvpSaving] = useState(false)
  const [rsvpError, setRsvpError] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  const [showMaybeMessage, setShowMaybeMessage] = useState(false)
  const [showDeclineModal, setShowDeclineModal] = useState(false)
  const [showSignupPrompt, setShowSignupPrompt] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelSaving, setCancelSaving] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [checkInState, setCheckInState] = useState<CheckInState>('idle')
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const proof = usePaymentProof(eventId, guest?.id, setGuest)
  const perms = useEventPermissions(event, user)
  const qrWrapperRef = useRef<HTMLDivElement>(null)
  const ticketRef = useRef<HTMLDivElement>(null)
  // Guarda la promesa de la lectura del evento (efecto de abajo), keyeada por
  // eventId. El bootstrap de acá abajo depende también de user/authLoading
  // (que pueden cambiar de identidad sin que cambie eventId — ver
  // useAuth.ts), así que no puede compartir el mismo useEffect que la carga
  // del evento sin forzarla a repetirse en cada uno de esos cambios. Este ref
  // deja esa carga vivir en su propio efecto (estable, solo depende de
  // eventId) mientras el bootstrap reusa la misma promesa en vez de pagar un
  // getEvent() aparte.
  const eventInitialRef = useRef<{ eventId: string; initial: Promise<EventData | null> } | null>(null)

  // Antes: listener en vivo (subscribeToEventWithInitial) sobre
  // events/{eventId} durante todo el tiempo que el pase queda abierto. Un
  // evento grande puede tener miles de pases abiertos en simultáneo mientras
  // el escáner hace check-in en la puerta — cada check-in escribe contadores
  // en ESTE MISMO documento, y Firestore reenvía el documento completo a
  // cada listener activo en cada escritura (factura como una lectura por
  // listener por escritura). Es el escenario de mayor costo de toda la
  // auditoría de escalabilidad (hallazgo F1).
  // GuestPass no muestra ningún contador en vivo del evento (verificado: no
  // referencia checkedInCount/occupancyCount/paidCount/peopleCount en este
  // archivo) — el listener solo servía para reflejar ediciones del
  // organizador (horario, portada, instrucciones de pago, plantilla) hechas
  // mientras el pase está abierto, algo infrecuente y no urgente. Se
  // reemplaza por una lectura puntual al montar + refresco cuando la pestaña
  // vuelve a estar visible (el usuario vuelve a mirar el pase después de
  // minutos/horas afuera) — conserva ese caso de uso sin pagar el fan-out de
  // cada check-in. Si en el futuro se necesita reflejar ediciones del
  // organizador de forma verdaderamente instantánea, ver la migración de F1
  // (separar contadores volátiles a un documento aparte) para poder volver a
  // un listener en vivo sin reintroducir este costo.
  useEffect(() => {
    if (!eventId) return
    const id = eventId
    let cancelled = false
    const initial = getEvent(id)
    eventInitialRef.current = { eventId: id, initial }
    initial.then((ev) => {
      if (!cancelled && ev) setEvent(ev)
    })
    function onVisible() {
      if (document.visibilityState !== 'visible') return
      getEvent(id).then((ev) => {
        if (!cancelled && ev) setEvent(ev)
      })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [eventId])

  useEffect(() => {
    // Esperar a que useAuth() confirme la sesión antes de decidir si el visor
    // es organizador o invitado público — si no, una carga fresca de la página
    // puede tratar momentáneamente al organizador como invitado anónimo
    // (auth.currentUser todavía no resuelto) y aplicarle el flujo de RSVP/lock
    // en vez del de check-in.
    if (!eventId || !qrToken || authLoading) return
    // El efecto de arriba (mismo eventId, declarado antes) ya dejó la
    // promesa del primer snapshot en el ref antes de que este efecto corra.
    const initial = eventInitialRef.current!.initial
    Promise.all([initial, findGuestByToken(eventId, qrToken)])
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

        // Reconoce este dispositivo/navegador para el pase (ver
        // claimGuestPass) — ya no "compite" por un único lock: se suma a la
        // lista de dispositivos reconocidos (con tope y rotación LRU), así
        // que esta llamada nunca deja al invitado bloqueado. No relacionado
        // con el bloque de vinculación de cuenta de abajo (claimGuestOwnership
        // no depende de lockTokens) — vive acá simplemente porque ambos son
        // parte del mismo bootstrap del pase.
        const storageKey = `paselink_lock_${eventId}_${qrToken}`
        const localToken = localStorage.getItem(storageKey) || crypto.randomUUID()
        localStorage.setItem(storageKey, localToken)
        const devices = await claimGuestPass(eventId, guestData.id, localToken)
        setDeviceToken(localToken)
        setMultiDevice(devices.length > 1)
        setGuest({ ...guestData, lockToken: localToken, lockTokens: devices })

        // Vincula (o revincula) este pase a la cuenta cada vez que su dueño
        // lo abre logueado — cubre tanto al que se autoregistró sin cuenta y
        // la creó después, como a cualquier invitado (de lista o autoregistro)
        // que recién ahora abre sesión, con la que sea. Dos escrituras:
        // - claimGuestOwnership marca ESTE pase (guests/{guestId}.guestUid)
        //   como propiedad de la cuenta — la fuente de verdad real, la que
        //   permite encontrarlo después desde cualquier dispositivo (ver
        //   reclaimInvitationsByEmail). No-op si ya era de esta cuenta.
        // - saveUserInvitation actualiza la caché de lectura rápida de "Mis
        //   invitaciones" (users/{uid}/invitations). Es un upsert (merge:true),
        //   así que repetirlo en cada vista es inofensivo.
        if (user) {
          void claimGuestOwnership(eventId, guestData.id, user.uid, guestData.guestUid ?? null)
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
      })
      .catch((err) => {
        console.error('Error loading guest pass:', err)
        setError(true)
      })
      .finally(() => setLoading(false))
    // Depende de user?.uid (primitivo), no del objeto `user` completo:
    // Firebase Auth emite una nueva instancia de user en cada cambio de
    // estado de auth aunque el uid no cambie, y resuscribirse en esos casos
    // — repitiendo getEvent/findGuestByToken y la escritura de
    // claimGuestPass — sería innecesario. Mismo criterio ya usado en
    // useUserProfile.ts/useSanctionStatus.ts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, qrToken, user?.uid, authLoading])

  // Ofrecer crear cuenta justo al llegar de un autoregistro público
  // (EventJoin.tsx navega acá con state.justRegistered) — antes esa pantalla
  // se abandonaba de inmediato (navigate a /pass) sin dar la misma
  // oportunidad que ya tiene el invitado de LISTA al confirmar RSVP (ver
  // handleRsvp más abajo). Mismo dismissKey que ese flujo: si ya la cerró en
  // esta sesión de navegador, no se le vuelve a ofrecer.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!guest || user || loading || !eventId || !qrToken) return
    const state = location.state as { justRegistered?: boolean } | null
    if (!state?.justRegistered) return
    const dismissKey = `paselink_signup_prompt_${eventId}_${qrToken}`
    if (!sessionStorage.getItem(dismissKey)) setShowSignupPrompt(true)
  }, [guest, user, loading, eventId, qrToken, location.state])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4">
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
    return <ErrorFallbackCTA message="Pase no encontrado." />
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

  // Vista del organizador: solo check-in, sin lock ni RSVP — extraída a
  // OrganizerPassView.tsx (auditoría de escalabilidad, hallazgo F13): es una
  // pantalla completa detrás de una sola condición, sin compartir estado con
  // el resto de este componente (RSVP, comprobante de pago propio, descarga).
  if (isOrg) {
    return (
      <OrganizerPassView
        event={event}
        guest={guest}
        perms={perms}
        passUrl={passUrl}
        checkInState={checkInState}
        paymentSaving={paymentSaving}
        paymentError={paymentError}
        onCheckIn={handleCheckIn}
        onMarkPaid={handleMarkPaid}
        onMarkUnpaid={handleMarkUnpaid}
      />
    )
  }

  // Pantalla final tras confirmar la cancelación — reemplaza todo el pase en
  // vez de volver a mostrarlo (el documento ya no existe en Firestore):
  // evita el estado roto de "invitación eliminada mostrando su propio
  // contenido viejo" que quedó cargado en memoria.
  if (cancelled) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <IconCheckCircle className="w-10 h-10 mx-auto mb-3 text-green-500" />
          <p className="font-medium text-lg">Listo, cancelaste tu asistencia</p>
          <p className="text-sm mt-2 text-gray-500 dark:text-gray-400">
            Ya no formas parte de la lista de invitados de {event.name}. Si cambias de opinión, contacta al organizador
            para solicitar una nueva invitación.
          </p>
          {user && (
            <Link to="/my-invitations" className="inline-block mt-5 text-sm font-medium underline underline-offset-2">
              Ver mis invitaciones
            </Link>
          )}
        </div>
      </div>
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

      // Ofrecer crear cuenta justo en el momento real de confirmar asistencia
      // (no en cargas posteriores de un pase que ya estaba en 'yes') — solo a
      // invitados sin sesión, y no de nuevo si ya dijo "Ahora no" en esta
      // invitación durante esta sesión del navegador.
      if (rsvpStatus === 'yes' && !user) {
        const dismissKey = `paselink_signup_prompt_${eventId}_${qrToken}`
        if (!sessionStorage.getItem(dismissKey)) setShowSignupPrompt(true)
      }
    } catch (err) {
      console.error('Error guardando RSVP:', err)
      setRsvpError('No se guardó. Intenta de nuevo.')
    } finally {
      setRsvpSaving(false)
    }
  }

  // Autocancelación de un invitado ya confirmado (rsvpStatus 'yes', incluye
  // autoregistro — registerWalkInGuest siempre crea con 'yes'). A diferencia
  // de handleRsvp('no') de arriba (decline blando, invitado pendiente que
  // sigue en la lista): esto borra el documento entero vía deleteGuest, el
  // mismo helper que ya usa el organizador desde GuestList — reusa su lógica
  // de contadores (peopleCount/paidCount/checkedInCount/occupancyCount) sin
  // duplicarla.
  async function handleCancelAttendance() {
    if (!eventId || !guest) return
    setCancelSaving(true)
    setCancelError(null)
    try {
      await deleteGuest(eventId, guest)
      // Best-effort: limpia la caché de "Mis invitaciones" del propio dueño
      // de la cuenta. Solo puede hacerlo si el visor ES esa cuenta (reglas de
      // users/{uid}/invitations exigen request.auth.uid == uid, sin excepción
      // para organizador/admin) — si el invitado no tiene sesión iniciada o
      // el pase nunca se vinculó a una cuenta, esta tarjeta queda huérfana
      // igual que ya le pasa hoy a un borrado hecho por el organizador (el
      // pase muestra "no encontrado" al abrirla, sin romper nada).
      if (user && guest.guestUid && guest.guestUid === user.uid) {
        deleteUserInvitation(user.uid, eventId).catch((err) => {
          console.error('Error limpiando la invitación cacheada del usuario:', err)
        })
      }
      setShowCancelDialog(false)
      setCancelled(true)
    } catch (err) {
      console.error('Error cancelando la asistencia:', err)
      setCancelError('No se pudo cancelar tu asistencia. Intenta de nuevo.')
    } finally {
      setCancelSaving(false)
    }
  }

  async function handleDownload() {
    if (!ticketRef.current || !guest) return
    const filename = `pase-${guest.name.replace(/\s+/g, '_').slice(0, 30)}.png`
    await downloadPassImage(ticketRef.current, filename)
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 2000)
  }

  function handleAddToCalendar() {
    if (!event || !eventId) return
    downloadIcsFile(
      {
        uid: `${eventId}@paselink`,
        name: event.name,
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
      },
      event.name,
    )
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
            {/* Sin loading="lazy": primera imagen del pase (candidata a LCP)
                en una página a la que casi siempre se llega en frío desde un
                link compartido — lazy solo demoraba su propia descarga. */}
            <img
              src={optimizedImageUrl(event.coverImage, 800)}
              alt={event.name}
              fetchPriority="high"
              crossOrigin="anonymous"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* ── SECCIÓN SUPERIOR: Invitado + QR ── (antes "inferior": el QR es
            lo único que realmente importa mostrar sin scroll al abrir el
            pase — más aún en la puerta, bajo presión — así que pasa a vivir
            primero, como el código de barras de un boarding pass real; los
            detalles del evento quedan como contexto secundario debajo). ── */}
        <div className="px-6 pb-6 pt-4 text-center">
          {/* Los dos avisos (navegador integrado + multi-dispositivo) son
              independientes y pueden coincidir. Sueltos, cada uno trae su
              propio borde/fondo/margen y juntos se comen el doble de alto
              de viewport del que realmente necesitan — por eso, cuando
              ambos están visibles, se agrupan en un solo NoticeStack en vez
              de mostrarse apilados por separado. Con uno solo visible, se
              muestra suelto (comportamiento sin cambios). */}
          {groupNotices ? (
            <NoticeStack>
              <InAppBrowserBanner grouped />
              <InlineNotice
                grouped
                onDismiss={() => setMultiDeviceDismissed(true)}
                icon={<IconAlertTriangle className="w-4 h-4 text-amber-400" />}
              >
                <p className="text-[var(--invite-text)]">Este pase también se abrió desde otro dispositivo o navegador.</p>
                <p className="mt-0.5 text-[var(--invite-text-muted)]">
                  Si fuiste tú (por ejemplo, al cambiar de Instagram/WhatsApp a Chrome o Safari), no hace falta hacer
                  nada. Si no reconoces ese acceso, contacta al organizador.
                </p>
              </InlineNotice>
            </NoticeStack>
          ) : (
            <>
              <InAppBrowserBanner />
              {showMultiDeviceNotice && (
                <InlineNotice
                  onDismiss={() => setMultiDeviceDismissed(true)}
                  icon={<IconAlertTriangle className="w-4 h-4 text-amber-400" />}
                >
                  <p className="text-[var(--invite-text)]">Este pase también se abrió desde otro dispositivo o navegador.</p>
                  <p className="mt-0.5 text-[var(--invite-text-muted)]">
                    Si fuiste tú (por ejemplo, al cambiar de Instagram/WhatsApp a Chrome o Safari), no hace falta hacer
                    nada. Si no reconoces ese acceso, contacta al organizador.
                  </p>
                </InlineNotice>
              )}
            </>
          )}

          {/* Caso de "el organizador comparte nuevamente el link del pase":
              a diferencia del popup de arriba (justRegistered/RSVP-confirm,
              se ofrece una vez y se puede cerrar para siempre en esta
              sesión), este aviso es chico y persistente — se muestra en
              TODA visita sin sesión, porque ese es justo el momento en que
              puede volver a perder el pase (navegador integrado, cambio de
              dispositivo) si no lo guarda ahora. */}
          {!user && guest.rsvpStatus !== 'no' && (
            <button
              type="button"
              onClick={() => setShowSignupPrompt(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 mb-4 text-left text-sm rounded-lg border border-[var(--invite-border)] bg-[var(--invite-surface)] text-[var(--invite-accent)] hover:bg-[var(--invite-accent-soft)] transition-colors"
            >
              <IconUserPlus className="w-4 h-4 shrink-0" />
              <span className="flex-1">Inicia sesión o crea una cuenta para guardar esta invitación</span>
            </button>
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
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 min-h-11 mb-3 text-sm font-medium text-[var(--invite-text-muted)] hover:text-[var(--invite-text)] active:text-[var(--invite-text)] underline underline-offset-2 rounded-lg"
                >
                  <IconEdit className="w-4 h-4" /> Editar mis datos
                </button>
              )}

              {/* Antes el QR se mostraba blur(6px) como "incentivo" para
                  confirmar la asistencia — pero un QR borroso deja de ser
                  legible para un lector en la puerta, así que en la práctica
                  bloqueaba el ingreso en vez de solo incentivar. El QR
                  siempre se ve nítido; el aviso de "confirma tu asistencia"
                  pasa a vivir arriba, sin superponerse, con contraste real
                  (no texto flotando semi-transparente sobre la imagen). */}
              {guest.rsvpStatus === 'pending' && (
                <div className="flex items-center gap-2 mt-1 mb-3 px-3 py-2.5 rounded-lg text-left bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <IconAlertTriangle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 leading-snug">
                    Tu código ya es válido — confirma tu asistencia abajo para avisarle al organizador
                  </p>
                </div>
              )}

              <div className="relative flex justify-center my-5" ref={qrWrapperRef}>
                <div
                  className="invite-qr-frame p-4 border rounded-xl inline-flex items-center justify-center"
                  style={{
                    borderColor: 'var(--invite-border)',
                    background: 'var(--invite-surface)',
                  }}
                >
                  <QRCodeCanvas value={passUrl} size={200} marginSize={QR_QUIET_ZONE_MODULES} />
                </div>
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
                    <button
                      onClick={handleAddToCalendar}
                      className="inline-flex items-center justify-center gap-2 border border-[var(--invite-border)] text-[var(--invite-text)] rounded-md px-4 py-3 sm:py-2 text-sm font-medium hover:bg-[var(--invite-accent-soft)] transition-colors"
                    >
                      <IconCalendar className="w-4 h-4" /> Agregar al calendario
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

                  {/* Autocancelación — solo si todavía tiene sentido: oculta
                      sin explicación si ya hizo check-in (el badge de arriba
                      ya lo dice) o si el evento ya pasó. Jerarquía visual
                      baja a propósito (link de texto apagado, no un botón),
                      es una acción destructiva secundaria. */}
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

                  <Modal
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
                        onClick={() => { setShowDeclineModal(false); void handleRsvp('no') }}
                        disabled={rsvpSaving}
                        className="w-full text-white rounded-md px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 bg-[var(--invite-accent)]"
                      >
                        Sí, no asistiré
                      </button>
                    </div>
                  </Modal>
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

              {/* "Ya pagué" — extraído a PaymentProofForm.tsx (auditoría de
                  escalabilidad, hallazgo F13). Independiente del botón de
                  WhatsApp de abajo: este marca el estado en la app (pausa el
                  cronómetro), WhatsApp sigue siendo el canal para mandar la
                  imagen real del comprobante. */}
              <PaymentProofForm guest={guest} proof={proof} />

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

        <PerforatedDivider />

        {/* ── SECCIÓN INFERIOR: Detalles del evento ── */}
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
            <p className="mt-4 text-sm text-[var(--invite-text-muted)] leading-relaxed whitespace-pre-line text-center max-w-xs mx-auto">
              {event.description}
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
      {showSignupPrompt && (
        <GuestSignupPrompt
          eventId={eventId}
          guest={guest}
          onDismiss={() => {
            sessionStorage.setItem(`paselink_signup_prompt_${eventId}_${qrToken}`, '1')
            setShowSignupPrompt(false)
          }}
          onSuccess={() => setShowSignupPrompt(false)}
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
        onConfirm={() => { if (!cancelSaving) void handleCancelAttendance() }}
        onCancel={() => { setShowCancelDialog(false); setCancelError(null) }}
      />
    </InvitationThemeRoot>
  )
}
