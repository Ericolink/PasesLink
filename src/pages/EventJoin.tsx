import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { getEvent } from '../firebase/events'
import { registerWalkInGuest } from '../firebase/capacity'
import type { EventData } from '../types'

type State = 'loading' | 'form' | 'submitting' | 'success' | 'full' | 'error' | 'not_found'

export function EventJoin() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<EventData | null>(null)
  const [state, setState] = useState<State>('loading')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [qrToken, setQrToken] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!id) return
    getEvent(id).then((ev) => {
      if (!ev) { setState('not_found'); return }
      if (ev.entryMode === 'list') { setState('error'); return }
      setEvent(ev)
      setState('form')
    })
  }, [id])

  useEffect(() => {
    if (state === 'success' && qrToken && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, qrToken, { width: 200, margin: 2 })
    }
  }, [state, qrToken])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !name.trim()) return
    setState('submitting')
    const result = await registerWalkInGuest(id, name, email)
    if (result.status === 'full') {
      setState('full')
    } else {
      setQrToken(result.qrToken!)
      setState('success')
    }
  }

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (state === 'not_found' || state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-4xl mb-3">🚫</div>
          <p className="text-gray-600 dark:text-gray-400">
            {state === 'not_found' ? 'Este evento no existe.' : 'Este evento no acepta registros libres.'}
          </p>
        </div>
      </div>
    )
  }

  if (state === 'full') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center animate-bounce-in">
          <div className="text-6xl mb-4">😔</div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Cupo agotado</h1>
          <p className="text-gray-500">El evento ya alcanzó su capacidad máxima.</p>
        </div>
      </div>
    )
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center animate-bounce-in">
          {event?.coverImage && (
            <img src={event.coverImage} alt="Portada" className="w-full h-28 object-cover rounded-xl mb-5" />
          )}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="text-3xl mb-2">🎉</div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-1">¡Registro exitoso!</h1>
            <p className="text-sm text-gray-500 mb-4">Guarda este QR — te lo pedirán en la entrada.</p>
            <div className="flex justify-center mb-4">
              <canvas ref={canvasRef} className="rounded-lg" />
            </div>
            {event?.welcomeMessage && (
              <p className="text-sm italic text-gray-500">{event.welcomeMessage}</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {event?.coverImage && (
          <img src={event.coverImage} alt="Portada" className="w-full h-36 object-cover rounded-xl mb-6" />
        )}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 animate-fade-in">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{event?.name}</h1>
          <p className="text-sm text-gray-500 mb-4">{event?.date} · {event?.location}</p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tu nombre *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ana García"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email (opcional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ana@email.com"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {event?.capacity && (
              <p className="text-xs text-gray-400 text-center">
                {event.guestCount} / {event.capacity} registros
              </p>
            )}
            <button
              type="submit"
              disabled={state === 'submitting'}
              style={{ backgroundColor: event?.accentColor || undefined }}
              className="w-full bg-primary text-white rounded-lg py-2.5 font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {state === 'submitting' ? 'Registrando...' : 'Obtener mi pase'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
