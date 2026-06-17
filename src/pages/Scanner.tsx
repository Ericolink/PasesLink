import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import confetti from 'canvas-confetti'
import { useAuth } from '../hooks/useAuth'
import { useEvent } from '../hooks/useEvent'
import { checkInGuest } from '../firebase/guests'
import { walkIn, walkOut } from '../firebase/capacity'
import { ScanResultModal } from '../components/ScanResultModal'

export type ScanFeedback = {
  type: 'success' | 'already' | 'invalid' | 'checkout' | 'not_checked_in' | 'already_out'
  guestName?: string
  detail?: string
}

const AUTO_CLOSE_MS = 3500
const SCAN_COOLDOWN_MS = 2500

export function Scanner() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const { event } = useEvent(eventId)
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null)
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [walkInMsg, setWalkInMsg] = useState<'success' | 'full' | null>(null)

  const scannerRef = useRef<Html5Qrcode | null>(null)
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
    closeTimerRef.current = setTimeout(() => setFeedback(null), AUTO_CLOSE_MS)
  }

  async function startScanning() {
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
      setCameraError('No se pudo acceder a la cámara. Verifica los permisos del navegador.')
      try { scanner.clear() } catch { /* ignore */ }
      scannerRef.current = null
    }
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

  async function processQr(decodedText: string) {
    if (!eventId || !user) return

    // Ingreso directo (Opción C) — QR compartido del evento
    if (isArriveQr(decodedText, eventId)) {
      const result = await walkIn(eventId)
      if (result === 'success') {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 } })
        showFeedback({ type: 'success', detail: 'Ingreso registrado' })
      } else {
        showFeedback({ type: 'invalid', detail: '¡Cupo máximo alcanzado!' })
      }
      return
    }

    const qrToken = extractQrToken(decodedText, eventId)
    if (!qrToken) {
      showFeedback({ type: 'invalid', detail: 'Código QR no válido para este evento.' })
      return
    }

    const result = await checkInGuest(eventId, qrToken, user.uid, user.email)
    if (result.status === 'success') {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 } })
      const welcome = eventRef.current?.welcomeMessage || undefined
      const companions = result.guest.companions > 0 ? `+${result.guest.companions} acompañante(s)` : undefined
      showFeedback({
        type: 'success',
        guestName: result.guest.name,
        detail: [companions, welcome].filter(Boolean).join(' · ') || undefined,
      })
    } else if (result.status === 'already_checked_in') {
      showFeedback({ type: 'already', guestName: result.guest.name })
    } else {
      showFeedback({ type: 'invalid', detail: 'Invitado no encontrado.' })
    }
  }

  async function handleWalkIn() {
    if (!eventId) return
    const result = await walkIn(eventId)
    setWalkInMsg(result)
    if (result === 'success') confetti({ particleCount: 50, spread: 60, origin: { y: 0.5 } })
    setTimeout(() => setWalkInMsg(null), 2000)
  }

  async function handleWalkOut() {
    if (!eventId) return
    await walkOut(eventId)
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
              <>
                <p className="text-red-400 text-sm text-center px-4">{cameraError}</p>
                <button
                  onClick={startScanning}
                  className="bg-primary text-white rounded-xl px-6 py-3 text-sm font-semibold hover:opacity-90"
                >
                  Reintentar
                </button>
              </>
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

      {feedback && <ScanResultModal feedback={feedback} onClose={() => setFeedback(null)} />}

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
            <button onClick={handleWalkOut} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-md py-2.5 text-lg font-bold transition-colors">−</button>
            <div className="text-center min-w-[60px]">
              <span className="text-2xl font-bold text-white">{event.checkedInCount}</span>
              {event.capacity && <p className="text-xs text-gray-400">/ {event.capacity}</p>}
            </div>
            <button onClick={handleWalkIn} className="flex-1 bg-primary hover:bg-primary-dark text-white rounded-md py-2.5 text-lg font-bold transition-colors">+</button>
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

function isArriveQr(decodedText: string, eventId: string): boolean {
  try {
    const url = new URL(decodedText)
    const parts = url.pathname.split('/').filter(Boolean)
    return parts[0] === 'events' && parts[1] === eventId && parts[2] === 'arrive'
  } catch {
    return false
  }
}

function extractQrToken(decodedText: string, eventId: string): string | null {
  try {
    const url = new URL(decodedText)
    const parts = url.pathname.split('/').filter(Boolean)
    const passIndex = parts.indexOf('pass')
    if (passIndex === -1 || parts.length < passIndex + 3) return null
    const scannedEventId = parts[passIndex + 1]
    const qrToken = parts[passIndex + 2]
    if (scannedEventId !== eventId) return null
    return qrToken
  } catch {
    return null
  }
}
