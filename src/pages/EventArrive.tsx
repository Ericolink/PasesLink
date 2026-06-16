import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { getEvent } from '../firebase/events'
import type { EventData } from '../types'

type State = 'loading' | 'ready' | 'not_found' | 'error'

export function EventArrive() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<EventData | null>(null)
  const [state, setState] = useState<State>('loading')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!id) return
    getEvent(id).then((ev) => {
      if (!ev) { setState('not_found'); return }
      if (ev.entryMode === 'list') { setState('error'); return }
      setEvent(ev)
      setState('ready')
    })
  }, [id])

  useEffect(() => {
    if (state === 'ready' && canvasRef.current && id) {
      const arriveUrl = window.location.origin + `/events/${id}/arrive`
      QRCode.toCanvas(canvasRef.current, arriveUrl, { width: 220, margin: 2 })
    }
  }, [state, id])

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
            {state === 'not_found' ? 'Este evento no existe.' : 'Este evento no acepta ingresos libres.'}
          </p>
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
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 text-center animate-fade-in">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{event?.name}</h1>
          <p className="text-sm text-gray-500 mb-4">{event?.date} · {event?.location}</p>

          <div className="flex justify-center mb-4">
            <canvas ref={canvasRef} className="rounded-lg" />
          </div>

          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Muestra este QR en la entrada
          </p>
          <p className="text-xs text-gray-400">
            El guardia lo escaneará para registrar tu ingreso
          </p>

          {event?.welcomeMessage && (
            <p className="text-sm italic text-gray-500 mt-4">{event.welcomeMessage}</p>
          )}
        </div>
      </div>
    </div>
  )
}
