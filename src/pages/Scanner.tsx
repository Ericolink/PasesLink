import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import confetti from 'canvas-confetti'
import { useAuth } from '../hooks/useAuth'
import { useEventOnly } from '../hooks/useEventOnly'
import { checkInGuest, checkOutGuest } from '../firebase/guests'
import { walkIn, walkOut } from '../firebase/capacity'
import { ScanResultModal } from '../components/ScanResultModal'
import { buildPassUrl, extractQrToken, isArriveQr } from '../utils/qrUrl'
import { isNetworkError } from '../utils/network'

export type ScanFeedback = {
  type: 'success' | 'already' | 'invalid' | 'checkout' | 'not_checked_in' | 'already_out' | 'full' | 'not_found' | 'error'
  guestName?: string
  detail?: string
  checkedInAt?: number | null
  checkedInByEmail?: string | null
  // Solo se usa para el botón de check-out del ScanResultModal (ver
  // handleCheckout) — no se muestra en pantalla.
  qrToken?: string
}

const AUTO_CLOSE_MS = 3500
const SCAN_COOLDOWN_MS = 2500
const NETWORK_RETRY_MS = 2000

// Resultados que requieren una decisión del guardia (cupo lleno, QR duplicado,
// invitado no encontrado, error de red) se quedan en pantalla hasta que los
// cierre a mano — solo los casos "informativos" (éxito, salida) se autocierran.
const AUTO_CLOSE_TYPES: ScanFeedback['type'][] = ['success', 'checkout', 'invalid', 'already_out', 'not_checked_in']

export function Scanner() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const { event, loading: eventLoading, error: eventError } = useEventOnly(eventId)
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null)
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [walkInMsg, setWalkInMsg] = useState<'success' | 'full' | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualValue, setManualValue] = useState('')

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const startingRef = useRef(false)
  const cooldownRef = useRef(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const eventRef = useRef(event)
  useEffect(() => { eventRef.current = event }, [event])

  useEffect(() => {
    return () => { void stopScanning() }
  }, [])

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
      setCameraError('Cámara no disponible. Intenta reiniciar la app.')
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
        const companions = result.guest.companions.length > 0 ? `+${result.guest.companions.length} acompañante(s)` : undefined
        showFeedback({
          type: 'success',
          guestName: result.guest.name,
          detail: [companions, welcome].filter(Boolean).join(' · ') || undefined,
        })
      } else if (result.status === 'already_checked_in') {
        showFeedback({
          type: 'already',
          guestName: result.guest.name,
          checkedInAt: result.guest.checkedInAt,
          checkedInByEmail: result.guest.checkedInByEmail,
          qrToken,
        })
      } else if (result.status === 'payment_required') {
        showFeedback({ type: 'invalid', guestName: result.guest.name, detail: 'Debe pagar la entrada antes de ingresar.' })
      } else {
        showFeedback({ type: 'not_found', detail: 'Este código no corresponde a ningún invitado de este evento.' })
      }
    } catch (err) {
      await handleProcessError(err, attempt, () => processQr(decodedText, attempt + 1))
    }
  }

  async function handleCheckout(qrToken: string) {
    if (!eventId || !user) return
    try {
      const result = await checkOutGuest(eventId, qrToken, user.uid, user.email)
      if (result.status === 'success') {
        showFeedback({ type: 'checkout', guestName: result.guest.name, detail: 'Salida registrada' })
      } else if (result.status === 'already_checked_out') {
        showFeedback({ type: 'already_out', guestName: result.guest.name })
      } else if (result.status === 'not_checked_in') {
        showFeedback({ type: 'not_checked_in' })
      } else {
        showFeedback({ type: 'not_found', detail: 'Este código no corresponde a ningún invitado de este evento.' })
      }
    } catch (err) {
      console.error('Error registrando check-out:', err)
      showFeedback({ type: 'error', detail: 'No se pudo registrar la salida. Intenta de nuevo.' })
    }
  }

  async function handleProcessError(err: unknown, attempt: number, retry: () => Promise<void>) {
    console.error('Error procesando QR:', err)
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
      showFeedback({ type: 'error', detail: 'No se pudo registrar el ingreso. Intenta de nuevo.' })
    }
  }

  async function handleWalkOut() {
    if (!eventId) return
    try {
      await walkOut(eventId)
    } catch (err) {
      console.error('Error registrando walk-out:', err)
      showFeedback({ type: 'error', detail: 'No se pudo registrar la salida. Intenta de nuevo.' })
    }
  }

  if (eventLoading) {
    return <p className="text-center text-gray-500 mt-16">Cargando…</p>
  }
  if (eventError) {
    return <p className="text-center text-red-500 mt-16">{eventError}</p>
  }
  if (!event) {
    return <p className="text-center text-gray-500 mt-16">Evento no encontrado.</p>
  }
  const coOrgsMap = event.coOrganizersMap || {}
  const hasAccess = !!user && (user.uid === event.ownerId || user.uid in coOrgsMap)
  if (!hasAccess) {
    return <p className="text-center text-gray-500 mt-16">No tienes acceso a este evento.</p>
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
          Volver
        </Link>
      </div>

      {event && <p className="text-sm text-gray-400 mb-4">{event.name}</p>}

      {/* Área de la cámara */}
      <div className="relative rounded-2xl overflow-hidden bg-black mb-3" style={{ minHeight: 320 }}>
        {/* html5-qrcode inyecta el video aquí */}
        <div id="qr-reader" className="w-full h-full" />

        {/* Overlay: visible cuando la cámara está apagada */}
        {!scanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-gray-900 rounded-2xl">
            {cameraError ? (
              <div className="flex flex-col items-center gap-3 px-4 w-full">
                <p className="text-red-400 text-sm text-center">{cameraError}</p>
                <div className="flex gap-2">
                  <button
                    onClick={startScanning}
                    className="min-h-12 bg-primary text-white rounded-xl px-6 py-3 text-sm font-semibold hover:opacity-90"
                  >
                    Reintentar
                  </button>
                  <button
                    onClick={() => setManualOpen((v) => !v)}
                    className="min-h-12 bg-gray-800 text-white rounded-xl px-6 py-3 text-sm font-semibold hover:bg-gray-700"
                  >
                    Ingreso manual
                  </button>
                </div>
                {manualOpen && (
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleManualSubmit() }}
                    className="w-full max-w-xs flex flex-col gap-2 mt-1"
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
                  </form>
                )}
              </div>
            ) : (
              <>
                {/* Icono de visor QR */}
                <div className="w-32 h-32 relative opacity-40">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white rounded-tl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white rounded-tr" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white rounded-bl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white rounded-br" />
                </div>
                <div className="text-center">
                  <button
                    onClick={startScanning}
                    className="block bg-primary text-white rounded-xl px-10 py-3 text-base font-semibold hover:bg-primary-dark transition-colors active:scale-95 mb-2"
                  >
                    Activar cámara
                  </button>
                  <p className="text-xs text-gray-500">Apunta al código QR del invitado</p>
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
          onClose={() => setFeedback(null)}
          onCheckout={feedback.qrToken ? () => handleCheckout(feedback.qrToken!) : undefined}
        />
      )}

      {/* Barra de progreso */}
      {event && (
        <div className="mt-4">
          <p className="text-center text-sm text-gray-400 mb-1">
            {event.checkedInCount} / {event.guestCount} confirmados
          </p>
          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${event.guestCount > 0 ? Math.min(100, (event.checkedInCount / event.guestCount) * 100) : 0}%` }}
            />
          </div>
        </div>
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
