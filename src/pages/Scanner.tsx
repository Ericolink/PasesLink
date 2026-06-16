import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import confetti from 'canvas-confetti'
import { useAuth } from '../hooks/useAuth'
import { useEvent } from '../hooks/useEvent'
import { checkInGuest, checkOutGuest } from '../firebase/guests'
import { walkIn, walkOut } from '../firebase/capacity'
import { ScanResultModal } from '../components/ScanResultModal'

export type ScanFeedback = {
  type: 'success' | 'already' | 'invalid' | 'checkout' | 'not_checked_in' | 'already_out'
  guestName?: string
  detail?: string
}

type ScanMode = 'in' | 'out'

const AUTO_CLOSE_MS = 3500

export function Scanner() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const { event } = useEvent(eventId)
  const [mode, setMode] = useState<ScanMode>('in')
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null)
  const [scanning, setScanning] = useState(false)
  const [walkInMsg, setWalkInMsg] = useState<'success' | 'full' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showFeedback(value: ScanFeedback) {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    setFeedback(value)
    closeTimerRef.current = setTimeout(() => setFeedback(null), AUTO_CLOSE_MS)
  }

  async function handleCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset so the same photo can be re-captured if needed
    e.target.value = ''
    if (!file || !eventId || !user) return

    setScanning(true)
    try {
      const scanner = new Html5Qrcode('qr-offscreen')
      let decodedText: string
      try {
        decodedText = await scanner.scanFile(file, false)
      } finally {
        await scanner.clear()
      }
      await processQr(decodedText)
    } catch {
      showFeedback({ type: 'invalid', detail: 'No se detectó un código QR en la imagen.' })
    } finally {
      setScanning(false)
    }
  }

  async function processQr(decodedText: string) {
    if (!eventId || !user) return

    // Option C: shared arrive QR
    if (isArriveQr(decodedText, eventId)) {
      const result = await walkIn(eventId)
      if (result === 'success') {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 } })
        showFeedback({ type: 'success', detail: 'Ingreso registrado ✓' })
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

    if (mode === 'in') {
      const result = await checkInGuest(eventId, qrToken, user.uid, user.email)
      if (result.status === 'success') {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 } })
        const welcome = event?.welcomeMessage || undefined
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
    } else {
      const result = await checkOutGuest(eventId, qrToken, user.uid, user.email)
      if (result.status === 'success') {
        showFeedback({ type: 'checkout', guestName: result.guest.name })
      } else if (result.status === 'already_checked_out') {
        showFeedback({ type: 'already_out', guestName: result.guest.name })
      } else if (result.status === 'not_checked_in') {
        showFeedback({ type: 'not_checked_in', detail: 'Este invitado no había hecho check-in.' })
      } else {
        showFeedback({ type: 'invalid', detail: 'Invitado no encontrado.' })
      }
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
      {/* Offscreen element required by Html5Qrcode.scanFile */}
      <div id="qr-offscreen" style={{ position: 'fixed', left: '-9999px', top: 0, width: '300px', height: '300px' }} />

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-white">Escanear pases</h1>
        <Link to={`/events/${eventId}`} className="text-sm text-primary font-medium">
          Volver
        </Link>
      </div>

      {event && <p className="text-sm text-gray-400 mb-3">{event.name}</p>}

      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        <button
          onClick={() => setMode('in')}
          className={`rounded-md py-2 text-sm font-medium transition-colors ${
            mode === 'in' ? 'bg-primary text-white' : 'bg-gray-800 text-gray-300'
          }`}
        >
          Entrada
        </button>
        <button
          onClick={() => setMode('out')}
          className={`rounded-md py-2 text-sm font-medium transition-colors ${
            mode === 'out' ? 'bg-primary text-white' : 'bg-gray-800 text-gray-300'
          }`}
        >
          Salida
        </button>
      </div>

      {/* Capture button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={scanning}
        className="w-full bg-gray-800 border-2 border-dashed border-gray-600 hover:border-primary hover:bg-gray-700 rounded-2xl py-14 flex flex-col items-center gap-3 transition-all disabled:opacity-50 active:scale-95"
      >
        {scanning ? (
          <>
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-400">Leyendo QR...</span>
          </>
        ) : (
          <>
            <svg className="w-12 h-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
            </svg>
            <div className="text-center">
              <p className="text-white font-medium">Tomar foto del QR</p>
              <p className="text-xs text-gray-500 mt-0.5">Toca aquí para abrir la cámara</p>
            </div>
          </>
        )}
      </button>

      {feedback && <ScanResultModal feedback={feedback} onClose={() => setFeedback(null)} />}

      {/* Progress bar */}
      {event && (
        <div className="mt-5">
          <p className="text-center text-sm text-gray-400 mb-1">
            {event.checkedInCount} / {event.guestCount} confirmados
          </p>
          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{
                width: `${event.guestCount > 0 ? Math.min(100, (event.checkedInCount / event.guestCount) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Walk-in counter for open/hybrid events (Option A) */}
      {event && event.entryMode !== 'list' && (
        <div className="mt-4 bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Contador walk-in</p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleWalkOut}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-md py-2.5 text-lg font-bold transition-colors"
            >
              −
            </button>
            <div className="text-center min-w-[60px]">
              <span className="text-2xl font-bold text-white">{event.checkedInCount}</span>
              {event.capacity && (
                <p className="text-xs text-gray-400">/ {event.capacity}</p>
              )}
            </div>
            <button
              onClick={handleWalkIn}
              className="flex-1 bg-primary hover:bg-primary-dark text-white rounded-md py-2.5 text-lg font-bold transition-colors"
            >
              +
            </button>
          </div>
          {walkInMsg && (
            <p className={`text-sm text-center mt-2 font-medium ${walkInMsg === 'full' ? 'text-red-400' : 'text-green-400'}`}>
              {walkInMsg === 'full' ? '¡Cupo máximo alcanzado!' : '✓ Ingreso registrado'}
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
