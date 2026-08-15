import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { useAuth } from '../hooks/useAuth'
import { useEventOnly } from '../hooks/useEventOnly'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useLoadingAnnouncement } from '../hooks/useLoadingAnnouncement'
import { useDashboardTheme } from '../hooks/useDashboardTheme'
import { useEventPermissions } from '../hooks/useEventPermissions'
import { useIsLandscape } from '../hooks/useIsLandscape'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useLiveRef } from '../hooks/useLiveRef'
import { useWalkInCounter } from '../hooks/useWalkInCounter'
import { useQrScanner } from '../hooks/useQrScanner'
import { IconArrowLeft, IconRotateCcw } from '../components/accessibility/AccessibleIcon'
import { checkInGuest, checkOutGuest, confirmPaymentAndCheckIn, partySize, presentIndicesOf } from '../firebase/guests'
import type { PaymentMethod } from '../types'
import { walkIn } from '../firebase/capacity'
import { ScanResultModal } from '../components/ScanResultModal'
import { WalkInCounter } from '../components/WalkInCounter'
import { ExitConfirmDialog, type PendingExit } from '../components/ExitConfirmDialog'
import { CheckInSelectionModal } from '../components/CheckInSelectionModal'
import { buildPendingSelection, type PendingCheckInSelection } from '../utils/checkInSelection'
import { CameraPermissionHandler, ManualCodeEntryDialog } from '../components/Scanner'
import { AttendanceProgressBar } from '../components/AttendanceProgressBar'
import { ErrorFallbackCTA } from '../components/ErrorFallbackCTA'
import { SkeletonBlock } from '../components/Skeleton'
import { buildPassUrl, extractQrToken, isArriveQr } from '../utils/qrUrl'
import { isNetworkError } from '../utils/network'
import { captureException } from '../lib/sentry'
import { trackCheckIn, trackCheckOut } from '../lib/analytics'

export type ScanFeedback = {
  type: 'success' | 'already' | 'invalid' | 'payment_required' | 'checkout' | 'not_checked_in' | 'already_out' | 'exit_blocked' | 'full' | 'not_found' | 'error'
  guestName?: string
  detail?: string
  checkedInAt?: number | null
  checkedInByEmail?: string | null
  // Solo se usan para el botón "¿Salió del evento?" del ScanResultModal (ver
  // handleRequestCheckoutFromModal) — no se muestran en pantalla.
  qrToken?: string
  companionsCount?: number
  isGroup?: boolean
  // Solo para type: 'payment_required' — método ya elegido por el invitado
  // (p.ej. 'transfer' si mandó comprobante), para preservarlo al confirmar
  // el pago desde el botón "Sí, ya pagó" (ver handleConfirmPayment).
  paymentMethod?: PaymentMethod | null
  // Solo para type: 'payment_required' — necesario para llamar a la Callable
  // confirmPaymentAndCheckIn (ver handleConfirmPayment), que identifica al
  // invitado por id, no por qrToken.
  guestId?: string
}

const AUTO_CLOSE_MS = 3500
const NETWORK_RETRY_MS = 2000

// El check-in exitoso ('success') queda excluido a propósito: el guardia
// necesita tiempo para leer el nombre/acompañantes/estado del invitado sin
// competir contra un timer, y solo debe desaparecer al presionar "Cerrar".
// Resultados que requieren una decisión del guardia (cupo lleno, QR
// duplicado, invitado no encontrado, error de red, reingreso bloqueado)
// también se quedan en pantalla hasta que los cierre a mano — solo los casos
// puramente informativos (salida) se autocierran.
const AUTO_CLOSE_TYPES: ScanFeedback['type'][] = ['checkout', 'invalid', 'already_out', 'not_checked_in']

export function Scanner() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const { event, loading: eventLoading, error: eventError } = useEventOnly(eventId)
  useDocumentTitle(event ? `Escanear · ${event.name}` : 'Escanear')
  useLoadingAnnouncement(eventLoading, 'Evento cargado')
  // Mismo hook que el resto del dashboard (botones/links/badges toman el
  // acento del tema) — Scanner no usa StatCard/invite-card-accent, así que
  // no hereda ningún borde de tarjeta temático. El recoloreo ambiental de
  // los orbs (index.css) también se activa via data-dash-template, pero
  // queda oculto: esta pantalla vive dentro de .theme-reset con un fondo
  // sólido (bg-gray-900), un sub-tema oscuro fijo pensado para legibilidad
  // bajo presión en la puerta (ver AppShell.tsx).
  useDashboardTheme(event?.templateId, event?.accentColor)
  const perms = useEventPermissions(event, user)
  const isLandscape = useIsLandscape()
  const prefersReducedMotion = usePrefersReducedMotion()
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualValue, setManualValue] = useState('')
  const [pendingExit, setPendingExit] = useState<PendingExit | null>(null)
  const [exitSubmitting, setExitSubmitting] = useState(false)
  const [confirmingPayment, setConfirmingPayment] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  // Invitación con varias personas (familia/acompañantes) que necesita que
  // el guardia elija quién está ingresando — ver CheckInSelectionModal.
  const [pendingSelection, setPendingSelection] = useState<PendingCheckInSelection | null>(null)
  const [selectionSubmitting, setSelectionSubmitting] = useState(false)
  const [selectionError, setSelectionError] = useState<string | null>(null)

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // El callback de frame de html5-qrcode (dentro de useQrScanner) se
  // registra UNA sola vez al auto-arrancar — si processQr leyera
  // event/pendingExit/feedback directo del estado, quedaría "congelado" en
  // el valor que tenían en ese primer render. feedbackRef cumple además otro
  // rol: mientras el diálogo "¿Ya pagó?" está abierto (type
  // 'payment_required'), un frame de cámara de fondo no debe pisarlo con
  // otro invitado — el cooldown entre lecturas (ver useQrScanner) es mucho
  // más corto que lo que tarda el guardia en decidir Sí/No.
  const eventRef = useLiveRef(event)
  const pendingExitRef = useLiveRef(pendingExit)
  const feedbackRef = useLiveRef(feedback)
  const pendingSelectionRef = useLiveRef(pendingSelection)

  function showFeedback(value: ScanFeedback) {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    setFeedback(value)
    closeTimerRef.current = AUTO_CLOSE_TYPES.includes(value.type)
      ? setTimeout(() => setFeedback(null), AUTO_CLOSE_MS)
      : null
  }

  // WCAG 2.2.1 (Timing Adjustable): quien necesite más de AUTO_CLOSE_MS para
  // leer el resultado (lector de pantalla, baja visión) solo necesita tocar
  // o enfocar el diálogo una vez — no hace falta reabrir nada ni hay que
  // "correr" contra el cierre automático mientras lo está leyendo.
  function pauseAutoClose() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  const { walkInMsg, handleWalkIn, handleWalkOut } = useWalkInCounter(eventId, (detail) => showFeedback({ type: 'error', detail }))
  const { scanning, cameraError, startScanning, stopScanning } = useQrScanner({
    canAutoStart: !!(event && user && perms.scanQr),
    onDecode: processQr,
  })

  function handleManualSubmit() {
    const value = manualValue.trim()
    if (!value || !eventId) return
    setManualValue('')
    setManualOpen(false)
    // El input acepta tanto la URL completa del pase (pegada) como el token
    // crudo; si no parece una URL, se reconstruye la URL de pase esperada para
    // poder reusar el mismo extractQrToken() que usa el flujo de cámara.
    const looksLikeUrl = /^https?:\/\//i.test(value)
    void processQr(looksLikeUrl ? value : buildPassUrl(eventId, value))
  }

  async function processQr(decodedText: string, attempt = 1) {
    if (!eventId || !user) return
    // Ya hay una salida esperando confirmación (Volverá / Se retira) — no
    // dejar que un frame de cámara de por medio la pise con otro invitado.
    if (pendingExitRef.current) return
    // Mismo motivo — una selección de personas (familia/acompañantes)
    // esperando confirmación tampoco debe pisarse con otro escaneo.
    if (pendingSelectionRef.current) return
    // Cualquier resultado en pantalla (no solo 'payment_required', como
    // antes) bloquea un nuevo escaneo hasta que el guardia lo cierre — sin
    // esto, el SCAN_COOLDOWN_MS (más corto que "leer el resultado y decidir")
    // expiraba mientras el modal seguía abierto y una cámara de fondo activa
    // podía pisarlo con otro invitado antes de que el primero se procesara.
    if (feedbackRef.current) return

    // Ingreso directo (Opción C) — QR compartido del evento
    if (isArriveQr(decodedText, eventId)) {
      try {
        const result = await walkIn(eventId)
        if (result === 'success') {
          trackCheckIn(eventId)
          if (!prefersReducedMotion) confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 } })
          showFeedback({ type: 'success', detail: 'Ingreso registrado' })
        } else {
          showFeedback({ type: 'full', detail: 'No quedan lugares disponibles para este evento.' })
        }
      } catch (err) {
        await handleProcessError(err, attempt, () => processQr(decodedText, attempt + 1))
      }
      return
    }

    const qrToken = extractQrToken(decodedText, eventId)
    if (!qrToken) {
      showFeedback({ type: 'invalid', detail: 'Código QR no válido para este evento.' })
      return
    }

    try {
      const result = await checkInGuest(eventId, qrToken)
      if (result.status === 'success') {
        trackCheckIn(eventId)
        if (!prefersReducedMotion) confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 } })
        const welcome = eventRef.current?.welcomeMessage || undefined
        const total = partySize(result.guest)
        const presentCount = presentIndicesOf(result.guest).length
        // Con varias personas: si quedó todo el mundo adentro, mismo mensaje
        // de siempre ("+N acompañante(s)" / "N integrantes"); si quedó
        // parcial, cuántos entraron de cuántos en total (ver planCheckIn en
        // functions/src/checkin/shared.ts).
        const partyMsg = total <= 1
          ? undefined
          : result.partial
            ? `${presentCount} de ${total} ingresaron · faltan ${total - presentCount}`
            : result.guest.isGroup
              ? `${total} integrantes`
              : `+${result.guest.companions.length} acompañante(s)`
        const reentryMsg = result.reentry ? 'Reingreso registrado' : undefined
        showFeedback({
          type: 'success',
          guestName: result.guest.name,
          detail: [reentryMsg, partyMsg, welcome].filter(Boolean).join(' · ') || undefined,
        })
      } else if (result.status === 'needs_selection') {
        setSelectionError(null)
        setPendingSelection(buildPendingSelection(qrToken, result.guest, result.pendingIndices))
      } else if (result.status === 'already_checked_in') {
        showFeedback({
          type: 'already',
          guestName: result.guest.name,
          checkedInAt: result.guest.checkedInAt,
          checkedInByEmail: result.guest.checkedInByEmail,
          qrToken,
          companionsCount: result.guest.companions.length,
          isGroup: result.guest.isGroup,
        })
      } else if (result.status === 'payment_required') {
        const ev = eventRef.current
        const amountDue = ev ? `${ev.currency}${(ev.ticketPrice * partySize(result.guest)).toLocaleString('es')}` : undefined
        const detail = result.guest.paymentStatus === 'pending_confirmation'
          ? 'Envió comprobante y está esperando que el organizador lo confirme. No puede ingresar todavía.'
          : amountDue
            ? `Debe pagar ${amountDue} antes de ingresar.`
            : 'Debe pagar la entrada antes de ingresar.'
        showFeedback({
          type: 'payment_required',
          guestName: result.guest.name,
          detail,
          qrToken,
          guestId: result.guest.id,
          paymentMethod: result.guest.paymentMethod,
        })
      } else if (result.status === 'blocked_final_exit') {
        showFeedback({
          type: 'exit_blocked',
          guestName: result.guest.name,
          detail: 'Este invitado se retiró definitivamente del evento. Un organizador puede habilitar su reingreso desde la lista de invitados.',
        })
      } else {
        showFeedback({ type: 'not_found', detail: 'Este código no corresponde a ningún invitado de este evento.' })
      }
    } catch (err) {
      await handleProcessError(err, attempt, () => processQr(decodedText, attempt + 1))
    }
  }

  async function submitExit(kind: 'temporary' | 'final') {
    // Guard sincrónico: en un doble-tap táctil (común en tablets de guardia)
    // el segundo click puede llegar antes de que React re-renderice el botón
    // con `disabled`, así que no alcanza con el prop — hace falta cortar acá.
    if (exitSubmitting || !pendingExit || !eventId || !user) return
    const { qrToken, guestName } = pendingExit
    setExitSubmitting(true)
    try {
      const result = await checkOutGuest(eventId, qrToken, kind)
      if (result.status === 'success') {
        trackCheckOut(eventId, kind)
        showFeedback({
          type: 'checkout',
          guestName,
          detail: kind === 'temporary' ? 'Podrá volver a ingresar.' : 'Salida definitiva registrada.',
        })
      } else if (result.status === 'already_checked_out') {
        showFeedback({ type: 'already_out', guestName })
      } else if (result.status === 'not_checked_in') {
        showFeedback({ type: 'not_checked_in', guestName })
      } else {
        showFeedback({ type: 'not_found', detail: 'Este código no corresponde a ningún invitado de este evento.' })
      }
    } catch (err) {
      console.error('Error registrando check-out:', err)
      captureException(err, { tags: { component: 'scanner', action: 'check_out' } })
      showFeedback({ type: 'error', detail: 'No se pudo registrar la salida. Intenta de nuevo.' })
    } finally {
      setExitSubmitting(false)
      setPendingExit(null)
    }
  }

  // Disparado desde el botón "¿Salió del evento?" del ScanResultModal cuando
  // el QR ya fue escaneado (invitado ya adentro) — única vía para registrar
  // una salida (ya no existe un modo "Salida" separado del scanner): abre
  // ExitConfirmDialog para que el guardia elija Volverá/Se retira.
  function handleRequestCheckoutFromModal() {
    if (!feedback?.qrToken) return
    setPendingExit({
      qrToken: feedback.qrToken,
      guestName: feedback.guestName || '',
      companionsCount: feedback.companionsCount || 0,
      isGroup: feedback.isGroup,
    })
    setFeedback(null)
  }

  // Disparado desde el botón "Sí, ya pagó" del ScanResultModal (invitado no
  // pagado en un evento de pago) — una sola llamada atómica del
  // servidor (Cloud Function confirmPaymentAndCheckIn, ver
  // functions/src/checkin/confirmPaymentAndCheckIn.ts) que confirma el pago
  // y hace el check-in en la misma transacción. Reemplaza las dos llamadas
  // secuenciales no atómicas (setGuestPaymentStatus + checkInGuest) que este
  // handler usaba antes de la migración de check-in a Cloud Functions — ya
  // no existe el caso borde de "el pago se revirtió entre medio".
  async function handleConfirmPayment(attempt = 1) {
    // Guard síncrono: mismo motivo que exitSubmitting en submitExit (evita
    // doble-tap táctil disparando dos confirmaciones en paralelo).
    if (confirmingPayment || !eventId || !user) return
    const current = feedbackRef.current
    if (!current || current.type !== 'payment_required' || !current.guestId || !current.qrToken) return
    const { guestId, qrToken } = current
    const ev = eventRef.current
    const method: PaymentMethod | undefined = current.paymentMethod ?? ev?.paymentMethods[0]

    setConfirmingPayment(true)
    setConfirmError(null)
    try {
      const result = await confirmPaymentAndCheckIn(eventId, guestId, method)
      if (result.checkIn === 'success') {
        trackCheckIn(eventId)
        if (!prefersReducedMotion) confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 } })
        const welcome = ev?.welcomeMessage || undefined
        const total = partySize(result.guest)
        const presentCount = presentIndicesOf(result.guest).length
        const partyMsg = total <= 1
          ? undefined
          : result.partial
            ? `${presentCount} de ${total} ingresaron · faltan ${total - presentCount}`
            : result.guest.isGroup
              ? `${total} integrantes`
              : `+${result.guest.companions.length} acompañante(s)`
        const reentryMsg = result.reentry ? 'Reingreso registrado' : undefined
        showFeedback({
          type: 'success',
          guestName: result.guest.name,
          detail: ['Pago confirmado', reentryMsg, partyMsg, welcome].filter(Boolean).join(' · '),
        })
      } else if (result.checkIn === 'needs_selection') {
        // El pago ya quedó confirmado en esta misma llamada (transacción
        // atómica) — falta solo elegir quién de la familia/acompañantes está
        // ingresando. La confirmación de esa selección ya no necesita volver
        // a mandar el pago: usa checkInGuest normal (ver onConfirm más abajo).
        setSelectionError(null)
        setPendingSelection(buildPendingSelection(qrToken, result.guest, result.pendingIndices))
      } else if (result.checkIn === 'already_checked_in') {
        showFeedback({
          type: 'already',
          guestName: result.guest.name,
          checkedInAt: result.guest.checkedInAt,
          checkedInByEmail: result.guest.checkedInByEmail,
          qrToken,
          companionsCount: result.guest.companions.length,
          isGroup: result.guest.isGroup,
        })
      } else {
        showFeedback({
          type: 'exit_blocked',
          guestName: result.guest.name,
          detail: 'Este invitado se retiró definitivamente del evento. Un organizador puede habilitar su reingreso desde la lista de invitados.',
        })
      }
    } catch (err) {
      console.error('Error confirmando pago:', err)
      if (!isNetworkError(err) || attempt >= 2) {
        captureException(err, { tags: { component: 'scanner', action: 'confirm_payment' } })
      }
      if (isNetworkError(err) && attempt < 2) {
        setConfirmError('Sin conexión. Reintentando en unos segundos…')
        await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_MS))
        await handleConfirmPayment(attempt + 1)
        return
      }
      // Se mantiene el modal 'payment_required' (no se pisa con showFeedback)
      // para que el guardia pueda reintentar sin volver a escanear el QR.
      setConfirmError(
        isNetworkError(err)
          ? 'No hay conexión a internet. Verifica tu WiFi/datos e intenta de nuevo.'
          : 'No se pudo confirmar el pago. Intenta de nuevo.',
      )
    } finally {
      setConfirmingPayment(false)
    }
  }

  // Confirma la selección de personas del modal de familia/acompañantes
  // (ver CheckInSelectionModal) — siempre vía checkInGuest normal: si venía
  // de un evento de pago, el pago ya se confirmó en la llamada anterior
  // (confirmPaymentAndCheckIn), así que a esta altura el gate de pago de
  // checkIn.ts ya pasa. `selection` viaja con los índices tildados; el
  // servidor vuelve a filtrar/validar dentro de la transacción (ver
  // planCheckIn en functions/src/checkin/shared.ts) — nunca confía en que
  // esta lista ya viene limpia.
  async function handleConfirmSelection(indices: number[]) {
    const pending = pendingSelectionRef.current
    if (selectionSubmitting || !eventId || !pending) return
    setSelectionSubmitting(true)
    setSelectionError(null)
    try {
      const result = await checkInGuest(eventId, pending.qrToken, indices)
      if (result.status === 'success') {
        trackCheckIn(eventId)
        if (!prefersReducedMotion) confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 } })
        const total = partySize(result.guest)
        const presentCount = presentIndicesOf(result.guest).length
        const partyMsg = result.partial
          ? `${presentCount} de ${total} ingresaron · faltan ${total - presentCount}`
          : `${presentCount} de ${total} ingresaron`
        setPendingSelection(null)
        showFeedback({ type: 'success', guestName: result.guest.name, detail: [partyMsg, eventRef.current?.welcomeMessage].filter(Boolean).join(' · ') })
      } else if (result.status === 'needs_selection') {
        // Nadie de los tildados llegó a contar como nuevo (reintento
        // duplicado, u otro dispositivo ya los había ingresado mientras
        // tanto) — se refresca la lista de pendientes en vez de cerrar en
        // silencio, así el guardia ve el estado real.
        setPendingSelection(buildPendingSelection(pending.qrToken, result.guest, result.pendingIndices))
      } else if (result.status === 'already_checked_in') {
        setPendingSelection(null)
        showFeedback({
          type: 'already',
          guestName: result.guest.name,
          checkedInAt: result.guest.checkedInAt,
          checkedInByEmail: result.guest.checkedInByEmail,
          qrToken: pending.qrToken,
          companionsCount: result.guest.companions.length,
          isGroup: result.guest.isGroup,
        })
      } else {
        setPendingSelection(null)
        showFeedback({ type: 'not_found', detail: 'Este código ya no corresponde a ningún invitado de este evento.' })
      }
    } catch (err) {
      console.error('Error confirmando check-in parcial:', err)
      captureException(err, { tags: { component: 'scanner', action: 'confirm_selection' } })
      setSelectionError(
        isNetworkError(err)
          ? 'No hay conexión a internet. Verifica tu WiFi/datos e intenta de nuevo.'
          : 'No se pudo registrar el ingreso. Intenta de nuevo.',
      )
    } finally {
      setSelectionSubmitting(false)
    }
  }

  async function handleProcessError(err: unknown, attempt: number, retry: () => Promise<void>) {
    console.error('Error procesando QR:', err)
    // Un error de red durante el primer intento todavía puede resolverse solo
    // (ver retry más abajo) — recién si sigue fallando tras agotar los
    // reintentos vale la pena una alerta, para no llenar Sentry con cortes de
    // wifi momentáneos del salón que se autorresuelven.
    if (!isNetworkError(err) || attempt >= 2) {
      captureException(err, { tags: { component: 'scanner', action: 'process_qr' } })
    }
    if (isNetworkError(err) && attempt < 2) {
      showFeedback({ type: 'error', detail: 'Sin conexión. Reintentando en unos segundos…' })
      await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_MS))
      await retry()
      return
    }
    showFeedback({
      type: 'error',
      detail: isNetworkError(err)
        ? 'No hay conexión a internet. Verifica tu WiFi/datos e intenta de nuevo.'
        : 'No se pudo procesar el código. Intenta de nuevo.',
    })
  }

  if (eventLoading) {
    // !bg-white/10 (con !important): SkeletonBlock por defecto usa
    // bg-gray-200 dark:bg-gray-700, pensado para fondos claros/dark-mode
    // estándar — esta pantalla vive siempre en fondo oscuro fijo
    // (bg-gray-900 dentro de .theme-reset), sin importar el tema de la
    // app, así que necesita su propio color de skeleton visible en ambos.
    return (
      <div className="theme-reset max-w-md mx-auto px-4 py-6 min-h-[calc(100vh-3.5rem)] bg-gray-900 text-white -mt-px">
        <SkeletonBlock className="!bg-white/10 h-6 w-1/2 mb-4" />
        <SkeletonBlock className="!bg-white/10 h-64 rounded-2xl mb-4" />
        <SkeletonBlock className="!bg-white/10 h-11 rounded-xl" />
      </div>
    )
  }
  if (eventError) {
    return <ErrorFallbackCTA message={eventError} tone="error" />
  }
  if (!event) {
    return <ErrorFallbackCTA message="Evento no encontrado." />
  }
  if (!perms.scanQr) {
    return <ErrorFallbackCTA message="No tienes acceso a este evento." />
  }

  return (
    <div className="theme-reset max-w-md mx-auto px-4 py-6 min-h-[calc(100vh-3.5rem)] bg-gray-900 text-white -mt-px">
      {/* Ocultar elementos que inyecta html5-qrcode que no necesitamos */}
      <style>{`
        #qr-reader { border: none !important; padding: 0 !important; }
        #qr-reader__header_message, #qr-reader__status_span { display: none !important; }
        #qr-reader video { width: 100% !important; height: 100% !important; object-fit: cover; display: block; }
        #qr-reader__scan_region { line-height: 0; }
      `}</style>

      <div className="flex items-center gap-3 mb-4">
        <Link
          to={`/events/${eventId}`}
          onClick={() => { void stopScanning() }}
          aria-label="Volver"
          className="shrink-0 -ml-2 min-w-11 min-h-11 inline-flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <IconArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-semibold text-white truncate">Escanear pases</h1>
      </div>

      {event && <p className="text-sm text-gray-400 mb-4">{event.name}</p>}

      {/* Área de la cámara */}
      <div className="relative rounded-2xl overflow-hidden bg-black mb-3" style={{ minHeight: 320 }}>
        {/* html5-qrcode inyecta el video aquí */}
        <div id="qr-reader" className="w-full h-full" />

        {/* Overlay: visible cuando la cámara está apagada. Con permiso
            denegado (cameraError), el contenido (instrucciones por SO +
            botones) puede superar los 320px del contenedor con textos
            grandes de accesibilidad — sin overflow-y-auto quedaba cortado
            por el overflow-hidden del contenedor de la cámara, sin forma de
            llegar a los botones. */}
        {!scanning && (
          <div
            className={`absolute inset-0 flex flex-col items-center gap-5 bg-gray-900 rounded-2xl overflow-y-auto ${
              cameraError ? 'justify-start py-6' : 'justify-center'
            }`}
          >

            {cameraError ? (
              <CameraPermissionHandler
                onRetry={() => void startScanning()}
                onManual={() => setManualOpen((v) => !v)}
              />
            ) : (
              /* Estado de espera mientras la cámara arranca automáticamente */
              <>
                <div className="w-32 h-32 relative opacity-30">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white rounded-tl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white rounded-tr" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white rounded-bl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white rounded-br" />
                </div>
                <div className="text-center" role="status">
                  <p className="text-sm text-gray-400">Iniciando cámara…</p>
                  <button
                    onClick={startScanning}
                    className="mt-3 text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2"
                  >
                    Reintentar
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Overlay decorativo cuando la cámara está activa */}
        {scanning && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-56 h-56">
              <div className="absolute top-0 left-0 w-10 h-10 border-t-[3px] border-l-[3px] border-primary" />
              <div className="absolute top-0 right-0 w-10 h-10 border-t-[3px] border-r-[3px] border-primary" />
              <div className="absolute bottom-0 left-0 w-10 h-10 border-b-[3px] border-l-[3px] border-primary" />
              <div className="absolute bottom-0 right-0 w-10 h-10 border-b-[3px] border-r-[3px] border-primary" />
            </div>
          </div>
        )}

        {/* Guía de orientación — el escáner (regiones de recorte de
            html5-qrcode, overlay decorativo) está pensado para vertical;
            en horizontal el video se deforma con object-fit: cover y el
            recuadro de guía queda descentrado. En vez de reiniciar la
            cámara al rotar (inestable: html5-qrcode tarda en reabrir el
            stream), se la deja corriendo debajo y solo se cubre con esta
            guía hasta que el guardia vuelve a vertical. */}
        {scanning && isLandscape && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900/95 px-6 text-center">
            <IconRotateCcw className="w-8 h-8 text-gray-400" />
            <p className="text-sm text-gray-300">Gira tu teléfono en modo vertical para escanear</p>
          </div>
        )}
      </div>

      {scanning && (
        <button
          onClick={stopScanning}
          className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl py-2.5 text-sm font-medium mb-4 transition-colors"
        >
          Detener cámara
        </button>
      )}

      {/* Controles principales del escaneo, agrupados justo debajo de la
          cámara — la mitad inferior de la pantalla es la zona de alcance
          cómodo del pulgar sosteniendo el teléfono con una mano. */}
      <div className="space-y-3 mb-4">
        <WalkInCounter event={event} walkInMsg={walkInMsg} onWalkIn={handleWalkIn} onWalkOut={handleWalkOut} />
      </div>

      {feedback && (
        <ScanResultModal
          feedback={feedback}
          onClose={() => { setConfirmError(null); setFeedback(null) }}
          onInteract={pauseAutoClose}
          onRequestCheckout={feedback.type === 'already' && feedback.qrToken ? handleRequestCheckoutFromModal : undefined}
          onConfirmPayment={feedback.type === 'payment_required' && perms.confirmPayments ? () => { void handleConfirmPayment() } : undefined}
          confirmingPayment={confirmingPayment}
          confirmError={confirmError}
          paymentMethods={event?.paymentMethods}
          onSelectPaymentMethod={(method) => setFeedback((prev) => (prev ? { ...prev, paymentMethod: method } : prev))}
        />
      )}

      {pendingSelection && (
        <CheckInSelectionModal
          selection={pendingSelection}
          submitting={selectionSubmitting}
          error={selectionError}
          onConfirm={(indices) => { void handleConfirmSelection(indices) }}
          onCancel={() => { setPendingSelection(null); setSelectionError(null) }}
        />
      )}

      {pendingExit && (
        <ExitConfirmDialog
          pendingExit={pendingExit}
          submitting={exitSubmitting}
          onVolvera={() => { void submitExit('temporary') }}
          onSeRetira={() => { void submitExit('final') }}
          onCancel={() => setPendingExit(null)}
        />
      )}

      {manualOpen && (
        <ManualCodeEntryDialog
          value={manualValue}
          onChange={setManualValue}
          onSubmit={handleManualSubmit}
          onCancel={() => setManualOpen(false)}
        />
      )}

      {/* Barra de progreso */}
      {event && (
        <AttendanceProgressBar
          className="mt-4"
          present={event.checkedInCount}
          expected={event.peopleCount}
          unitLabel="confirmados"
          showPercentage={false}
          variant="plain"
          subtitle={
            event.peopleCount - event.checkedInCount > 0
              ? `${event.peopleCount - event.checkedInCount} persona${event.peopleCount - event.checkedInCount === 1 ? '' : 's'} pendiente${event.peopleCount - event.checkedInCount === 1 ? '' : 's'} de check-in. Incluye acompañantes.`
              : 'Todas las personas ya hicieron check-in. Incluye acompañantes.'
          }
        />
      )}
    </div>
  )
}
