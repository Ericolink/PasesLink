import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { useAuth } from '../hooks/useAuth'
import { useEvent } from '../hooks/useEvent'
import { checkInGuest } from '../firebase/guests'
import { ScanResultModal } from '../components/ScanResultModal'

const SCANNER_ELEMENT_ID = 'qr-scanner'
const AUTO_CLOSE_MS = 3000

export type ScanFeedback = {
  type: 'success' | 'already' | 'invalid'
  guestName?: string
  detail?: string
}

export function Scanner() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const { event } = useEvent(eventId)
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null)
  const [cameraError, setCameraError] = useState('')
  const [manualValue, setManualValue] = useState('')
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const processingRef = useRef(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showFeedback(value: ScanFeedback) {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    setFeedback(value)
    closeTimerRef.current = setTimeout(() => setFeedback(null), AUTO_CLOSE_MS)
  }

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!eventId || !user) return
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID)
    scannerRef.current = scanner

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    }

    async function startScanner() {
      try {
        const cameras = await Html5Qrcode.getCameras()
        if (cameras.length === 0) {
          setCameraError('No se encontraron cámaras disponibles.')
          return
        }
        const backCamera = cameras.find((c) => /back|rear|environment/i.test(c.label))
        const cameraId = backCamera?.id ?? cameras[cameras.length - 1].id

        await scanner.start(cameraId, config, (decodedText) => handleScan(decodedText), () => {})
      } catch {
        setCameraError('No pudimos acceder a la cámara. Revisa los permisos del navegador.')
      }
    }

    startScanner()

    return () => {
      scanner.stop().catch(() => {})
      scanner.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, user])

  async function handleScan(decodedText: string) {
    if (processingRef.current || !eventId || !user) return

    const qrToken = extractQrToken(decodedText, eventId)
    if (!qrToken) {
      showFeedback({ type: 'invalid', detail: 'Código QR no válido para este evento.' })
      return
    }

    processingRef.current = true
    try {
      const result = await checkInGuest(eventId, qrToken, user.uid)
      if (result.status === 'success') {
        const welcome = event?.plan === 'premium' && event.welcomeMessage ? event.welcomeMessage : undefined
        showFeedback({ type: 'success', guestName: result.guest.name, detail: welcome })
      } else if (result.status === 'already_checked_in') {
        showFeedback({ type: 'already', guestName: result.guest.name })
      } else {
        showFeedback({ type: 'invalid', detail: 'Invitado no encontrado.' })
      }
    } catch {
      showFeedback({ type: 'invalid', detail: 'Ocurrió un error al confirmar la asistencia.' })
    } finally {
      setTimeout(() => {
        processingRef.current = false
      }, 1500)
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!manualValue.trim()) return
    await handleScan(manualValue.trim())
    setManualValue('')
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Escanear pases</h1>
        <Link to={`/events/${eventId}`} className="text-sm text-primary font-medium">
          Volver
        </Link>
      </div>

      {event && <p className="text-sm text-gray-500 mb-3">{event.name}</p>}

      <div id={SCANNER_ELEMENT_ID} className="rounded-lg overflow-hidden border border-gray-200 bg-black" />

      {cameraError && <p className="text-sm text-red-600 mt-3">{cameraError}</p>}

      {feedback && <ScanResultModal feedback={feedback} onClose={() => setFeedback(null)} />}

      {event && (
        <div className="mt-4">
          <p className="text-center text-sm text-gray-500 mb-1">
            {event.checkedInCount} / {event.guestCount} confirmados
          </p>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{
                width: `${event.guestCount > 0 ? Math.min(100, (event.checkedInCount / event.guestCount) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      <details className="mt-6 text-sm text-gray-500">
        <summary className="cursor-pointer">¿Problemas con la cámara? Confirmar manualmente</summary>
        <form onSubmit={handleManualSubmit} className="mt-2 flex gap-2">
          <input
            type="text"
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            placeholder="Pega aquí el link del pase"
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            className="bg-primary text-white rounded-md px-3 py-2 text-sm font-medium hover:bg-primary-dark transition-colors"
          >
            Confirmar
          </button>
        </form>
      </details>
    </div>
  )
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
