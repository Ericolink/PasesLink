import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import confetti from 'canvas-confetti'
import { useAuth } from '../hooks/useAuth'
import { useEventOnly } from '../hooks/useEventOnly'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useEventPermissions } from '../hooks/useEventPermissions'
import { checkInGuest, checkOutGuest, confirmPaymentAndCheckIn, findGuestByToken, guestPresence, partySize } from '../firebase/guests'
import type { PaymentMethod } from '../types'
import { walkIn, walkOut } from '../firebase/capacity'
import { ScanResultModal } from '../components/ScanResultModal'
import { ExitConfirmDialog, type PendingExit } from '../components/ExitConfirmDialog'
import { CameraPermissionHandler } from '../components/Scanner'
import { AttendanceProgressBar } from '../components/AttendanceProgressBar'
import { buildPassUrl, extractQrToken, isArriveQr } from '../utils/qrUrl'
import { isNetworkError } from '../utils/network'
import { captureException } from '../lib/sentry'

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
}

type ScanMode = 'entrada' | 'salida'

const AUTO_CLOSE_MS = 3500
const SCAN_COOLDOWN_MS = 2500
const NETWORK_RETRY_MS = 2000

// Resultados que requieren una decisión del guardia (cupo lleno, QR duplicado,
// invitado no encontrado, error de red, reingreso bloqueado) se quedan en
// pantalla hasta que los cierre a mano — solo los casos "informativos" (éxito,
// salida) se autocierran.
const AUTO_CLOSE_TYPES: ScanFeedback['type'][] = ['success', 'checkout', 'invalid', 'already_out', 'not_checked_in']

export function Scanner() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const { event, loading: eventLoading, error: eventError } = useEventOnly(eventId)
  useDocumentTitle(event ? `Escanear · ${event.name}` : 'Escanear')
  const perms = useEventPermissions(event, user)
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null)
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [walkInMsg, setWalkInMsg] = useState<'success' | 'full' | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualValue, setManualValue] = useState('')
  const [scanMode, setScanMode] = useState<ScanMode>('entrada')
  const [pendingExit, setPendingExit] = useState<PendingExit | null>(null)
  const [exitSubmitting, setExitSubmitting] = useState(false)
  const [confirmingPayment, setConfirmingPayment] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const startingRef = useRef(false)
  const cooldownRef = useRef(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasAutoStartedRef = useRef(false)
  const eventRef = useRef(event)
  useEffect(() => { eventRef.current = event }, [event])
  // El callback de frame de html5-qrcode se registra UNA sola vez en
  // startScanning() (auto-arranque, ver más abajo) — si processQr leyera
  // scanMode/pendingExit directo del estado, quedaría "congelado" en el
  // valor que tenían en ese momento y nunca vería, por ejemplo, que el
  // guardia cambió a modo "Salida". Mismo patrón que eventRef arriba.
  const scanModeRef = useRef(scanMode)
  useEffect(() => { scanModeRef.current = scanMode }, [scanMode])
  const pendingExitRef = useRef(pendingExit)
  useEffect(() => { pendingExitRef.current = pendingExit }, [pendingExit])
  // Igual que pendingExitRef: mientras el diálogo "¿Ya pagó?" está abierto
  // (type 'payment_required'), un frame de cámara de fondo no debe pisarlo
  // con otro invitado — el cooldown de SCAN_COOLDOWN_MS es mucho más corto
  // que lo que tarda el guardia en decidir Sí/No.
  const feedbackRef = useRef(feedback)
  useEffect(() => { feedbackRef.current = feedback }, [feedback])

  useEffect(() => {
    return () => { void stopScanning() }
  }, [])

  // Auto-start camera when the event is loaded and the viewer has access.
  // hasAutoStartedRef prevents re-firing when event state updates.
  useEffect(() => {
    if (!event || !user || hasAutoStartedRef.current) return
    if (!perms.scanQr) return
    hasAutoStartedRef.current = true
    void startScanning()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, user, perms.scanQr])

  function showFeedback(value: ScanFeedback) {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    setFeedback(value)
    closeTimerRef.current = AUTO_CLOSE_TYPES.includes(value.type)
      ? setTimeout(() => setFeedback(null), AUTO_CLOSE_MS)
      : null
  }

  async function startScanning() {
    // Evita inicializar dos instancias de Html5Qrcode en paralelo si el
    // usuario pulsa "Reintentar"/"Activar cámara" varias veces antes de que
    // la primera llamada a scanner.start() resuelva (sea éxito o error).
    if (startingRef.current) return
    startingRef.current = true
    setCameraError(null)
    const scanner = new Html5Qrcode('qr-reader', { verbose: false })
    scannerRef.current = scanner
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10 },
        async (decodedText) => {
          if (cooldownRef.current) return
          cooldownRef.current = true
          await processQr(decodedText)
          setTimeout(() => { cooldownRef.current = false }, SCAN_COOLDOWN_MS)
        },
        () => {},              // ignorar errores de frame (normales durante el escaneo)
      )
      setScanning(true)
    } catch {
      setCameraError('camera_unavailable')
      try { scanner.clear() } catch { /* ignore */ }
      scannerRef.current = null
    } finally {
      startingRef.current = false
    }
  }

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

  async function stopScanning() {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        scannerRef.current.clear()
      } catch { /* already stopped */ }
      scannerRef.current = null
    }
    setScanning(false)
  }

  async function processQr(decodedText: string, attempt = 1) {
    if (!eventId || !user) return
    // Ya hay una salida esperando confirmación (Volverá / Se retira) — no
    // dejar que un frame de cámara de por medio la pise con otro invitado.
    if (pendingExitRef.current) return
    if (feedbackRef.current?.type === 'payment_required') return

    if (scanModeRef.current === 'salida') {
      await processExitScan(decodedText, attempt)
      return
    }

    // Ingreso directo (Opción C) — QR compartido del evento
    if (isArriveQr(decodedText, eventId)) {
      try {
        const result = await walkIn(eventId)
        if (result === 'success') {
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 } })
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
      const result = await checkInGuest(eventId, qrToken, user.uid, user.email)
      if (result.status === 'success') {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 } })
        const welcome = eventRef.current?.welcomeMessage || undefined
        const companions = result.guest.isGroup
          ? `${partySize(result.guest)} integrantes`
          : result.guest.companions.length > 0
            ? `+${result.guest.companions.length} acompañante(s)`
            : undefined
        const reentryMsg = result.reentry ? 'Reingreso registrado' : undefined
        showFeedback({
          type: 'success',
          guestName: result.guest.name,
          detail: [reentryMsg, companions, welcome].filter(Boolean).join(' · ') || undefined,
        })
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

  async function processExitScan(decodedText: string, attempt: number) {
    if (!eventId) return

    if (isArriveQr(decodedText, eventId)) {
      showFeedback({ type: 'invalid', detail: 'Este código es de ingreso, no de salida.' })
      return
    }

    const qrToken = extractQrToken(decodedText, eventId)
    if (!qrToken) {
      showFeedback({ type: 'invalid', detail: 'Código QR no válido para este evento.' })
      return
    }

    try {
      const guest = await findGuestByToken(eventId, qrToken)
      if (!guest) {
        showFeedback({ type: 'not_found', detail: 'Este código no corresponde a ningún invitado de este evento.' })
        return
      }
      const guestName = [guest.name, guest.lastName].filter(Boolean).join(' ')
      const presence = guestPresence(guest)
      if (presence === 'invited') {
        showFeedback({ type: 'not_checked_in', guestName, detail: 'Este invitado todavía no registró su ingreso.' })
        return
      }
      if (presence === 'temp_out' || presence === 'final_out') {
        showFeedback({
          type: 'already_out',
          guestName,
          detail: presence === 'final_out' ? 'Ya se había retirado definitivamente.' : 'Ya había salido temporalmente.',
        })
        return
      }
      setPendingExit({ qrToken, guestName, companionsCount: guest.companions.length, isGroup: guest.isGroup })
    } catch (err) {
      await handleProcessError(err, attempt, () => processExitScan(decodedText, attempt + 1))
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
      const result = await checkOutGuest(eventId, qrToken, user.uid, user.email, kind)
      if (result.status === 'success') {
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

  // Disparado desde el botón "¿Salió del evento?" del ScanResultModal (modo
  // entrada, invitado ya adentro) — reusa el mismo diálogo Volverá/Se retira
  // en vez de registrar la salida de una sola opción, para que ambos caminos
  // (modo salida dedicado y este atajo) terminen siempre en la misma decisión.
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

  // Disparado desde el botón "Sí, ya pagó" del ScanResultModal (modo entrada,
  // invitado no pagado en un evento de pago) — marca el pago y registra el
  // check-in en una sola operación atómica (confirmPaymentAndCheckIn), sin
  // que el guardia tenga que volver a escanear ni salir del flujo.
  async function handleConfirmPayment(attempt = 1) {
    // Guard síncrono: mismo motivo que exitSubmitting en submitExit (evita
    // doble-tap táctil disparando dos confirmaciones en paralelo).
    if (confirmingPayment || !eventId || !user) return
    const current = feedbackRef.current
    if (!current || current.type !== 'payment_required' || !current.qrToken) return
    const { qrToken } = current
    const ev = eventRef.current
    const method: PaymentMethod | undefined = current.paymentMethod ?? ev?.paymentMethods[0]

    setConfirmingPayment(true)
    setConfirmError(null)
    try {
      const result = await confirmPaymentAndCheckIn(eventId, qrToken, user.uid, user.email, method)
      if (result.status === 'success') {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 } })
        const welcome = ev?.welcomeMessage || undefined
        const companions = result.guest.isGroup
          ? `${partySize(result.guest)} integrantes`
          : result.guest.companions.length > 0
            ? `+${result.guest.companions.length} acompañante(s)`
            : undefined
        const reentryMsg = result.reentry ? 'Reingreso registrado' : undefined
        showFeedback({
          type: 'success',
          guestName: result.guest.name,
          detail: ['Pago confirmado', reentryMsg, companions, welcome].filter(Boolean).join(' · '),
        })
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

  async function handleWalkIn() {
    if (!eventId) return
    try {
      const result = await walkIn(eventId)
      setWalkInMsg(result)
      if (result === 'success') confetti({ particleCount: 50, spread: 60, origin: { y: 0.5 } })
      setTimeout(() => setWalkInMsg(null), 2000)
    } catch (err) {
      console.error('Error registrando walk-in:', err)
      captureException(err, { tags: { component: 'scanner', action: 'walk_in' } })
      showFeedback({ type: 'error', detail: 'No se pudo registrar el ingreso. Intenta de nuevo.' })
    }
  }

  async function handleWalkOut() {
    if (!eventId) return
    try {
      await walkOut(eventId)
    } catch (err) {
      console.error('Error registrando walk-out:', err)
      captureException(err, { tags: { component: 'scanner', action: 'walk_out' } })
      showFeedback({ type: 'error', detail: 'No se pudo registrar la salida. Intenta de nuevo.' })
    }
  }

  if (eventLoading) {
    return <p className="text-center text-gray-500 mt-16">Cargando…</p>
  }
  if (eventError) {
    return (
      <div className="text-center mt-16 px-4">
        <p className="text-red-500">{eventError}</p>
        <Link to="/dashboard" className="inline-block mt-4 bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity">
          ← Volver al Dashboard
        </Link>
      </div>
    )
  }
  if (!event) {
    return (
      <div className="text-center mt-16 px-4">
        <p className="text-gray-500">Evento no encontrado.</p>
        <Link to="/dashboard" className="inline-block mt-4 bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity">
          ← Volver al Dashboard
        </Link>
      </div>
    )
  }
  if (!perms.scanQr) {
    return (
      <div className="text-center mt-16 px-4">
        <p className="text-gray-500">No tienes acceso a este evento.</p>
        <Link to="/dashboard" className="inline-block mt-4 bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity">
          ← Volver al Dashboard
        </Link>
      </div>
    )
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

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-white">Escanear pases</h1>
        <Link
          to={`/events/${eventId}`}
          onClick={() => { void stopScanning() }}
          className="text-sm text-primary font-medium"
        >
          Salir
        </Link>
      </div>

      {event && <p className="text-sm text-gray-400 mb-4">{event.name}</p>}

      {/* Modo de escaneo: entrada (default) o salida — cambia qué hace processQr al leer un QR */}
      <div className="grid grid-cols-2 gap-2 mb-4 bg-gray-800 rounded-xl p-1">
        <button
          onClick={() => setScanMode('entrada')}
          className={`min-h-11 rounded-lg text-sm font-semibold transition-colors ${
            scanMode === 'entrada' ? 'bg-primary text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Entrada
        </button>
        <button
          onClick={() => setScanMode('salida')}
          className={`min-h-11 rounded-lg text-sm font-semibold transition-colors ${
            scanMode === 'salida' ? 'bg-primary text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Salida
        </button>
      </div>

      {/* Área de la cámara */}
      <div className="relative rounded-2xl overflow-hidden bg-black mb-3" style={{ minHeight: 320 }}>
        {/* html5-qrcode inyecta el video aquí */}
        <div id="qr-reader" className="w-full h-full" />

        {/* Overlay: visible cuando la cámara está apagada */}
        {!scanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-gray-900 rounded-2xl">
            {cameraError ? (
              <CameraPermissionHandler
                onRetry={() => { setCameraError(null); void startScanning() }}
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
                <div className="text-center">
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

        {/* Formulario manual — se muestra encima del overlay cuando está activo */}
        {!scanning && manualOpen && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900 rounded-2xl px-5">
            <p className="text-sm font-medium text-gray-300">Ingresar código manualmente</p>
            <form
              onSubmit={(e) => { e.preventDefault(); handleManualSubmit() }}
              className="w-full max-w-xs flex flex-col gap-2"
            >
              <input
                type="text"
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder="Pega el enlace o código del pase"
                autoFocus
                className="min-h-12 w-full bg-gray-800 text-white placeholder:text-gray-500 rounded-lg px-3 py-3 text-sm border border-gray-700 focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                className="min-h-12 bg-primary text-white rounded-lg py-3 text-sm font-semibold hover:opacity-90"
              >
                Procesar código
              </button>
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2 mt-1"
              >
                Cancelar
              </button>
            </form>
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
      </div>

      {scanning && (
        <button
          onClick={stopScanning}
          className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl py-2.5 text-sm font-medium mb-4 transition-colors"
        >
          Detener cámara
        </button>
      )}

      {feedback && (
        <ScanResultModal
          feedback={feedback}
          onClose={() => { setConfirmError(null); setFeedback(null) }}
          onRequestCheckout={feedback.type === 'already' && feedback.qrToken ? handleRequestCheckoutFromModal : undefined}
          onConfirmPayment={feedback.type === 'payment_required' && perms.confirmPayments ? () => { void handleConfirmPayment() } : undefined}
          confirmingPayment={confirmingPayment}
          confirmError={confirmError}
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

      {/* Barra de progreso */}
      {event && (
        <AttendanceProgressBar
          className="mt-4"
          present={event.checkedInCount}
          expected={event.peopleCount}
          unitLabel="confirmados"
          showPercentage={false}
          variant="plain"
        />
      )}

      {/* Contador walk-in para eventos open/hybrid */}
      {event && event.entryMode !== 'list' && (
        <div className="mt-4 bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Contador walk-in</p>
          <div className="flex items-center gap-3">
            <button onClick={handleWalkOut} aria-label="Registrar salida" className="min-h-12 flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-md py-3 text-lg font-bold transition-colors">−</button>
            <div className="text-center min-w-[60px]">
              <span className="text-2xl font-bold text-white">{event.checkedInCount}</span>
              {event.capacity && <p className="text-xs text-gray-400">/ {event.capacity}</p>}
            </div>
            <button onClick={handleWalkIn} aria-label="Registrar entrada" className="min-h-12 flex-1 bg-primary hover:bg-primary-dark text-white rounded-md py-3 text-lg font-bold transition-colors">+</button>
          </div>
          {walkInMsg && (
            <p className={`text-sm text-center mt-2 font-medium ${walkInMsg === 'full' ? 'text-red-400' : 'text-green-400'}`}>
              {walkInMsg === 'full' ? '¡Cupo máximo alcanzado!' : 'Ingreso registrado'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
