import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { getEvent } from '../firebase/events'
import { registerWalkInGuest } from '../firebase/capacity'
import { addToWaitlist } from '../firebase/waitlist'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { saveUserInvitation } from '../firebase/userProfile'
import {
  GUEST_CUSTOM_FIELD_VALUE_MAX,
  GUEST_NAME_PART_MAX,
  GUEST_PHONE_MAX,
  WAITLIST_NAME_MAX,
  WAITLIST_PHONE_MAX,
} from '../utils/validation'
import { WallSection } from '../components/WallSection'
import { EventMap } from '../components/EventMap'
import { InvitationThemeRoot } from '../components/InvitationThemeRoot'
import { InvitationCard } from '../components/InvitationCard'
import { ThemeOrnament } from '../components/ThemeOrnament'
import { InviteDivider } from '../components/InviteDivider'
import {
  IconBan,
  IconCheckCircle,
  IconFrown,
  IconListOrdered,
  IconSparkles,
} from '../components/Icons'
import type { EventData } from '../types'
import { buildPassUrl } from '../utils/qrUrl'

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
  const [wlError, setWlError] = useState('')
  const [regError, setRegError] = useState('')
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

  // Pre-fill name/lastName from profile. Intencionalmente un efecto: profile
  // llega async después de user, y el guard `!name` evita pisar lo que el
  // usuario ya tipeó. Convertirlo a "ajustar estado durante el render" cambiaría
  // cuándo se aplica el valor de profile vs. el de user.displayName.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (user && !name) {
      setName(profile?.firstName || user.displayName?.split(' ')[0] || '')
      setLastName(profile?.lastName || user.displayName?.split(' ').slice(1).join(' ') || '')
    }
  }, [profile, user])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  useEffect(() => {
    if (state === 'success' && qrToken && canvasRef.current && id) {
      const passUrl = buildPassUrl(id, qrToken)
      QRCode.toCanvas(canvasRef.current, passUrl, { width: 200, margin: 2 })
    }
  }, [state, qrToken, id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !name.trim() || !lastName.trim()) return
    setState('submitting')
    setRegError('')
    try {
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
    } catch (err) {
      console.error('Error registering guest:', err)
      setRegError(err instanceof Error ? err.message : 'No se pudo completar el registro. Intenta de nuevo.')
      setState('form')
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
      setWlError('')
      try {
        await addToWaitlist(id, wlName, wlLastName, wlPhone)
        setWaitlistState('joined')
      } catch (err) {
        console.error('Error joining waitlist:', err)
        setWlError(err instanceof Error ? err.message : 'No se pudo anotar en la lista de espera. Intenta de nuevo.')
      } finally {
        setWlSubmitting(false)
      }
    }

    if (waitlistState === 'joined') {
      return (
        <InvitationThemeRoot
          templateId={event?.templateId}
          accentOverride={event?.accentColor}
          className="min-h-screen flex items-center justify-center p-4"
        >
          <div className="w-full max-w-sm text-center">
            <IconCheckCircle className="w-14 h-14 mx-auto mb-4 text-green-500" />
            <h1 className="text-xl font-bold text-[var(--invite-text)] mb-2">Estás en la lista</h1>
            <p className="text-sm text-[var(--invite-text-muted)]">
              Te anotamos en la lista de espera. Si se libera un lugar, el organizador te contactará.
            </p>
          </div>
        </InvitationThemeRoot>
      )
    }

    if (waitlistState === 'form') {
      return (
        <InvitationThemeRoot
          templateId={event?.templateId}
          accentOverride={event?.accentColor}
          className="min-h-screen flex items-center justify-center p-4"
        >
          <div className="w-full max-w-sm">
            <InvitationCard>
              <div className="flex items-center gap-2 mb-4">
                <IconListOrdered className="w-5 h-5 text-[var(--invite-accent)]" />
                <h1 className="text-lg font-bold">Lista de espera</h1>
              </div>
              <p className="text-sm mb-4 text-[var(--invite-text-muted)]">
                El cupo está lleno. Déjanos tus datos y te avisamos si se libera un lugar.
              </p>
              <form onSubmit={handleWaitlist} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-[var(--invite-text-muted)]">Nombre *</label>
                    <input type="text" required maxLength={WAITLIST_NAME_MAX} value={wlName} onChange={(e) => setWlName(e.target.value)}
                      placeholder="Ana"
                      className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-[var(--invite-text-muted)]">Apellido *</label>
                    <input type="text" required maxLength={WAITLIST_NAME_MAX} value={wlLastName} onChange={(e) => setWlLastName(e.target.value)}
                      placeholder="García"
                      className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-[var(--invite-text-muted)]">Teléfono <span className="font-normal">(opcional)</span></label>
                  <input type="tel" maxLength={WAITLIST_PHONE_MAX} value={wlPhone} onChange={(e) => setWlPhone(e.target.value)}
                    placeholder="+1 234 567 8900"
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                {wlError && <p className="text-xs text-red-500">{wlError}</p>}
                <button type="submit" disabled={wlSubmitting}
                  className="w-full text-white rounded-lg py-2.5 font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 bg-[var(--invite-accent)]">
                  {wlSubmitting ? 'Anotando…' : 'Unirme a la lista'}
                </button>
              </form>
            </InvitationCard>
          </div>
        </InvitationThemeRoot>
      )
    }

    return (
      <InvitationThemeRoot
        templateId={event?.templateId}
        accentOverride={event?.accentColor}
        className="min-h-screen flex items-center justify-center p-4"
      >
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <IconFrown className="w-14 h-14 text-gray-400" />
          </div>
          <h1 className="text-xl font-bold text-[var(--invite-text)] mb-2">Cupo agotado</h1>
          <p className="mb-5 text-[var(--invite-text-muted)]">El evento ya alcanzó su capacidad máxima.</p>
          <button
            onClick={() => {
              // El nombre/apellido/teléfono ya se escribieron en el formulario de
              // registro de arriba (el que descubrió que el cupo estaba lleno) —
              // se reutilizan acá para no pedirlos de nuevo.
              setWlName(name)
              setWlLastName(lastName)
              setWlPhone(phone)
              setWaitlistState('form')
            }}
            className="inline-flex items-center gap-2 text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity bg-[var(--invite-accent)]"
          >
            <IconListOrdered className="w-4 h-4" />
            Unirme a la lista de espera
          </button>
        </div>
      </InvitationThemeRoot>
    )
  }

  if (state === 'success') {
    return (
      <InvitationThemeRoot
        templateId={event?.templateId}
        accentOverride={event?.accentColor}
        className="flex items-start justify-center min-h-screen p-4"
      >
        <div className="w-full max-w-sm">
          <InvitationCard coverImage={event?.coverImage} coverAlt={event?.name}>
            <div className="flex justify-center mb-2">
              <IconSparkles className="w-8 h-8 text-[var(--invite-accent)]" />
            </div>
            <h1 className="text-lg font-bold mb-1">
              Hola, {name} {lastName}
            </h1>
            <ThemeOrnament templateId={event?.templateId} className="w-16 h-6 mx-auto mt-1 mb-2 text-[var(--invite-accent)]" />
            <p className="text-sm mb-4 text-[var(--invite-text-muted)]">Este es tu pase de entrada. Guárdalo.</p>
            <div className="flex justify-center mb-4">
              <canvas ref={canvasRef} className="rounded-lg" />
            </div>
            {event?.requiresPayment && (
              <div className="text-left bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 mb-4">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Pago de entrada</p>
                <p className="text-sm text-amber-800 dark:text-amber-300 mb-1">
                  Monto a pagar: <strong>{event.currency}{event.ticketPrice.toLocaleString('es')}</strong>
                </p>
                {event.paymentInstructions && (
                  <p className="text-sm text-amber-700 dark:text-amber-400 whitespace-pre-line">{event.paymentInstructions}</p>
                )}
                <p className="text-xs text-amber-600 mt-1">El organizador confirmará tu pago al ingresar.</p>
              </div>
            )}
            {event?.welcomeMessage && (
              <p className="text-sm italic text-[var(--invite-accent)]">{event.welcomeMessage}</p>
            )}
          </InvitationCard>
          {event?.mapsUrl && (
            <>
              <InviteDivider templateId={event?.templateId} />
              <EventMap mapsUrl={event.mapsUrl} />
            </>
          )}
          {id && <WallSection eventId={id} guestName={`${name} ${lastName}`.trim()} />}
        </div>
      </InvitationThemeRoot>
    )
  }

  const customFields = event?.customFields || []

  return (
    <InvitationThemeRoot
      templateId={event?.templateId}
      accentOverride={event?.accentColor}
      className="min-h-screen flex items-center justify-center p-4"
    >
      <div className="w-full max-w-sm">
        <InvitationCard coverImage={event?.coverImage} coverAlt={event?.name}>
          <h1 className="text-xl font-bold mb-1">{event?.name}</h1>
          <ThemeOrnament templateId={event?.templateId} className="w-16 h-6 mx-auto mt-1 mb-2 text-[var(--invite-accent)]" />
          <p className="text-sm mb-4 text-[var(--invite-text-muted)]">
            {event?.date} · {event?.location}
            {event?.startTime && <> · ⏰ {event.startTime}{event.endTime && `–${event.endTime}`}</>}
          </p>

          <form onSubmit={handleSubmit} className="space-y-3 text-left">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium mb-1 text-[var(--invite-text-muted)]">Nombre *</label>
                <input
                  type="text"
                  required
                  maxLength={GUEST_NAME_PART_MAX}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ana"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-[var(--invite-text-muted)]">Apellido *</label>
                <input
                  type="text"
                  required
                  maxLength={GUEST_NAME_PART_MAX}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="García"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-[var(--invite-text-muted)]">Teléfono <span className="font-normal">(opcional)</span></label>
              <input
                type="tel"
                maxLength={GUEST_PHONE_MAX}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 234 567 8900"
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
              />
            </div>

            {customFields.map((field) => (
              <div key={field.id}>
                <label className="block text-sm font-medium mb-1 text-[var(--invite-text-muted)]">
                  {field.label}{field.required ? ' *' : ''}
                </label>
                <input
                  type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                  required={field.required}
                  maxLength={GUEST_CUSTOM_FIELD_VALUE_MAX}
                  value={customValues[field.id] || ''}
                  onChange={(e) => setCustomValues((v) => ({ ...v, [field.id]: e.target.value }))}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
                />
              </div>
            ))}

            {event?.capacity && (
              <p className="text-xs text-center text-[var(--invite-text-muted)]">
                {event.guestCount} / {event.capacity} registros
              </p>
            )}
            {regError && <p className="text-xs text-red-500">{regError}</p>}
            <button
              type="submit"
              disabled={state === 'submitting'}
              className="w-full text-white rounded-lg py-2.5 font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 bg-[var(--invite-accent)]"
            >
              {state === 'submitting' ? 'Registrando…' : 'Obtener mi pase'}
            </button>
          </form>
        </InvitationCard>
      </div>
    </InvitationThemeRoot>
  )
}
