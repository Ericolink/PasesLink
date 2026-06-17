import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { getEvent } from '../firebase/events'
import { registerWalkInGuest } from '../firebase/capacity'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { saveUserInvitation } from '../firebase/userProfile'
import { WallSection } from '../components/WallSection'
import {
  IconBan,
  IconCheckCircle,
  IconFrown,
  IconSparkles,
} from '../components/Icons'
import type { EventData } from '../types'

type State = 'loading' | 'form' | 'submitting' | 'success' | 'full' | 'not_found' | 'error'

interface SavedReg {
  name: string
  phone: string
  qrToken: string
  customValues: Record<string, string>
}

function regKey(eventId: string) {
  return `join_reg_${eventId}`
}

export function EventJoin() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { profile } = useUserProfile()
  const [event, setEvent] = useState<EventData | null>(null)
  const [state, setState] = useState<State>('loading')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [qrToken, setQrToken] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!id) return
    getEvent(id).then((ev) => {
      if (!ev) { setState('not_found'); return }
      if (ev.entryMode === 'list') { setState('error'); return }
      setEvent(ev)

      // Restore saved registration for this event
      const saved = localStorage.getItem(regKey(id))
      if (saved) {
        try {
          const reg: SavedReg = JSON.parse(saved)
          setName(reg.name)
          setPhone(reg.phone)
          setCustomValues(reg.customValues || {})
          setQrToken(reg.qrToken)
          setState('success')
          return
        } catch {
          localStorage.removeItem(regKey(id))
        }
      }

      setState('form')
    })
  }, [id])

  // Pre-fill name when profile loads
  useEffect(() => {
    if (user && (profile?.displayName || user.displayName) && !name) {
      setName(profile?.displayName || user.displayName || '')
    }
  }, [profile, user])

  useEffect(() => {
    if (state === 'success' && qrToken && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, qrToken, { width: 200, margin: 2 })
    }
  }, [state, qrToken])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !name.trim()) return
    setState('submitting')
    const result = await registerWalkInGuest(id, name, undefined, phone, customValues)
    if (result.status === 'full') {
      setState('full')
    } else {
      const token = result.qrToken!
      setQrToken(token)
      // Persist so returning to the page restores their QR
      localStorage.setItem(regKey(id), JSON.stringify({ name, phone, qrToken: token, customValues }))
      setState('success')
      // Save invitation to user profile if logged in
      if (user && id && event) {
        void saveUserInvitation(user.uid, {
          eventId: id,
          eventName: event.name,
          eventDate: event.date,
          eventLocation: event.location,
          eventCoverImage: event.coverImage,
          guestName: name,
          qrToken: token,
          type: 'walkin',
        })
      }
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
          <div className="flex justify-center mb-3">
            <IconBan className="w-12 h-12 text-gray-400" />
          </div>
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
          <div className="flex justify-center mb-4">
            <IconFrown className="w-14 h-14 text-gray-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Cupo agotado</h1>
          <p className="text-gray-500">El evento ya alcanzó su capacidad máxima.</p>
        </div>
      </div>
    )
  }

  if (state === 'success') {
    return (
      <div className="flex items-start justify-center min-h-screen p-4">
        <div className="w-full max-w-sm animate-bounce-in">
          {event?.coverImage && (
            <img src={event.coverImage} alt="Portada" className="w-full h-28 object-cover rounded-xl mb-5" />
          )}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 text-center">
            <div className="flex justify-center mb-2">
              <IconSparkles className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
              Hola, {name}
            </h1>
            <p className="text-sm text-gray-500 mb-4">Este es tu pase de entrada. Guárdalo.</p>
            <div className="flex justify-center mb-4">
              <canvas ref={canvasRef} className="rounded-lg" />
            </div>
            {event?.welcomeMessage && (
              <p className="text-sm italic text-gray-500 mb-4">{event.welcomeMessage}</p>
            )}
            {id && (
              <Link
                to={`/events/${id}/wall`}
                className="flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <IconCheckCircle className="w-4 h-4" />
                Ver el muro del evento
              </Link>
            )}
            <button
              onClick={() => {
                if (id) localStorage.removeItem(regKey(id))
                setState('form')
                setName('')
                setPhone('')
                setCustomValues({})
                setQrToken('')
              }}
              className="mt-3 text-xs text-gray-400 hover:text-gray-600"
            >
              No soy yo — cambiar registro
            </button>
          </div>
          {id && <WallSection eventId={id} />}
        </div>
      </div>
    )
  }

  const customFields = event?.customFields || []

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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teléfono *</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 234 567 8900"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {customFields.map((field) => (
              <div key={field.id}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {field.label}{field.required ? ' *' : ''}
                </label>
                <input
                  type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                  required={field.required}
                  value={customValues[field.id] || ''}
                  onChange={(e) => setCustomValues((v) => ({ ...v, [field.id]: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            ))}

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
