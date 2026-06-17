import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { getEvent } from '../firebase/events'
import { registerWalkInGuest } from '../firebase/capacity'
import { addToWaitlist } from '../firebase/waitlist'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { saveUserInvitation } from '../firebase/userProfile'
import { WallSection } from '../components/WallSection'
import { EventMap } from '../components/EventMap'
import {
  IconBan,
  IconCheckCircle,
  IconFrown,
  IconListOrdered,
  IconSparkles,
} from '../components/Icons'
import type { EventData } from '../types'

type State = 'loading' | 'form' | 'submitting' | 'success' | 'full' | 'not_found' | 'error'
type WaitlistState = 'idle' | 'form' | 'submitting' | 'joined'

interface SavedReg {
  name: string
  lastName: string
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
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [qrToken, setQrToken] = useState('')
  const [waitlistState, setWaitlistState] = useState<WaitlistState>('idle')
  const [wlSubmitting, setWlSubmitting] = useState(false)
  const [wlName, setWlName] = useState('')
  const [wlLastName, setWlLastName] = useState('')
  const [wlPhone, setWlPhone] = useState('')
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
          setLastName(reg.lastName || '')
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

  // Pre-fill name/lastName from profile
  useEffect(() => {
    if (user && !name) {
      setName(profile?.firstName || user.displayName?.split(' ')[0] || '')
      setLastName(profile?.lastName || user.displayName?.split(' ').slice(1).join(' ') || '')
    }
  }, [profile, user])

  useEffect(() => {
    if (state === 'success' && qrToken && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, qrToken, { width: 200, margin: 2 })
    }
  }, [state, qrToken])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !name.trim() || !lastName.trim()) return
    setState('submitting')
    const fullName = `${name.trim()} ${lastName.trim()}`
    const result = await registerWalkInGuest(id, fullName, undefined, phone, customValues)
    if (result.status === 'full') {
      setState('full')
    } else {
      const token = result.qrToken!
      setQrToken(token)
      localStorage.setItem(regKey(id), JSON.stringify({ name, lastName, phone, qrToken: token, customValues }))
      localStorage.setItem('wall_guest_name', fullName)
      setState('success')
      if (user && id && event) {
        void saveUserInvitation(user.uid, {
          eventId: id,
          eventName: event.name,
          eventDate: event.date,
          eventLocation: event.location,
          eventCoverImage: event.coverImage,
          guestName: fullName,
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
    async function handleWaitlist(e: React.FormEvent) {
      e.preventDefault()
      if (!id || !wlName.trim() || !wlLastName.trim()) return
      setWlSubmitting(true)
      try {
        await addToWaitlist(id, wlName, wlLastName, wlPhone)
        setWaitlistState('joined')
      } catch {
        // keep form visible
      } finally {
        setWlSubmitting(false)
      }
    }

    if (waitlistState === 'joined') {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="w-full max-w-sm text-center animate-bounce-in">
            <IconCheckCircle className="w-14 h-14 mx-auto mb-4 text-green-500" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Estás en la lista</h1>
            <p className="text-gray-500 text-sm">
              Te anotamos en la lista de espera. Si se libera un lugar, el organizador te contactará.
            </p>
          </div>
        </div>
      )
    }

    if (waitlistState === 'form') {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="w-full max-w-sm">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                <IconListOrdered className="w-5 h-5 text-primary" />
                <h1 className="text-lg font-bold text-gray-900 dark:text-white">Lista de espera</h1>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                El cupo está lleno. Déjanos tus datos y te avisamos si se libera un lugar.
              </p>
              <form onSubmit={handleWaitlist} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
                    <input type="text" required value={wlName} onChange={(e) => setWlName(e.target.value)}
                      placeholder="Ana"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Apellido *</label>
                    <input type="text" required value={wlLastName} onChange={(e) => setWlLastName(e.target.value)}
                      placeholder="García"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teléfono <span className="text-gray-400 font-normal">(opcional)</span></label>
                  <input type="tel" value={wlPhone} onChange={(e) => setWlPhone(e.target.value)}
                    placeholder="+1 234 567 8900"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <button type="submit" disabled={wlSubmitting}
                  className="w-full bg-primary text-white rounded-lg py-2.5 font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
                  {wlSubmitting ? 'Anotando...' : 'Unirme a la lista'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center animate-bounce-in">
          <div className="flex justify-center mb-4">
            <IconFrown className="w-14 h-14 text-gray-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Cupo agotado</h1>
          <p className="text-gray-500 mb-5">El evento ya alcanzó su capacidad máxima.</p>
          <button
            onClick={() => setWaitlistState('form')}
            className="inline-flex items-center gap-2 bg-primary text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <IconListOrdered className="w-4 h-4" />
            Unirme a la lista de espera
          </button>
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
              Hola, {name} {lastName}
            </h1>
            <p className="text-sm text-gray-500 mb-4">Este es tu pase de entrada. Guárdalo.</p>
            <div className="flex justify-center mb-4">
              <canvas ref={canvasRef} className="rounded-lg" />
            </div>
            {event?.welcomeMessage && (
              <p className="text-sm italic text-gray-500 mb-4">{event.welcomeMessage}</p>
            )}
          </div>
          {event?.location && (
            <EventMap location={event.location} mapsUrl={event.mapsUrl} />
          )}
          {id && <WallSection eventId={id} guestName={`${name} ${lastName}`.trim()} />}
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
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ana"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Apellido *</label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="García"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teléfono <span className="text-gray-400 font-normal">(opcional)</span></label>
              <input
                type="tel"
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
