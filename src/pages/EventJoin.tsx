import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { getEvent, subscribeToEvent } from '../firebase/events'
import { registerWalkInGuest } from '../firebase/capacity'
import { addToWaitlist } from '../firebase/waitlist'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { saveUserInvitation } from '../firebase/userProfile'
import { sendGuestPassEmail } from '../utils/emailjs'
import {
  GUEST_CUSTOM_FIELD_VALUE_MAX,
  GUEST_EMAIL_MAX,
  GUEST_MAX_PARTY_SIZE,
  GUEST_NAME_PART_MAX,
  GUEST_PHONE_MAX,
  WAITLIST_NAME_MAX,
  WAITLIST_PHONE_MAX,
} from '../utils/validation'

// Look del formulario de cara al invitado: inputs en pill (forma fija, no
// depende del --invite-radius de cada tema — el objetivo es que se vea
// "amigable" en las 6 plantillas por igual) y labels en mayúscula con
// tracking. Colores (foco, texto, fondo) sí siguen el tema vía --invite-*.
const labelClass = 'block text-xs font-bold uppercase tracking-wide mb-1.5 text-[var(--invite-text-muted)]'
const inputClass =
  'w-full rounded-full border border-[var(--invite-border)] bg-[var(--invite-surface)] text-[var(--invite-text)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--invite-accent)]'
import { WallSection } from '../components/WallSection'
import { EventMap } from '../components/EventMap'
import { InvitationThemeRoot } from '../components/InvitationThemeRoot'
import { InvitationCard } from '../components/InvitationCard'
import { ThemeOrnament } from '../components/ThemeOrnament'
import { InviteDivider } from '../components/InviteDivider'
import { EventCountdown } from '../components/EventCountdown'
import { formatTime12h } from '../utils/time'
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
  email?: string
  partySize?: number
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
  const [email, setEmail] = useState('')
  const [partySize, setPartySize] = useState(1)
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
          setEmail(reg.email || '')
          setPartySize(reg.partySize || 1)
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

  // Suscripción en vivo, aparte del bootstrap de arriba (que decide el estado
  // inicial una sola vez): cualquier cambio que el organizador guarde en
  // EditEventForm (horario, portada, mensaje de bienvenida, etc.) debe
  // reflejarse en esta misma invitación ya abierta, no solo en registros
  // nuevos. `getEvent` de arriba sigue siendo una lectura única (decide
  // not_found/error/form/success), esta suscripción solo mantiene `event` al
  // día una vez que ya se decidió cuál de esos estados mostrar.
  useEffect(() => {
    if (!id) return
    const unsubscribe = subscribeToEvent(id, (ev) => {
      if (ev) setEvent(ev)
    })
    return unsubscribe
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
      const result = await registerWalkInGuest(id, fullName, undefined, phone, customValues, partySize)
      if (result.status === 'full') {
        setState('full')
      } else {
        const token = result.qrToken!
        setQrToken(token)
        localStorage.setItem(
          regKey(id),
          JSON.stringify({ name, lastName, phone, email, partySize, qrToken: token, customValues }),
        )
        localStorage.setItem('wall_guest_name', fullName)
        setState('success')
        // Best-effort: si no hay plantilla de EmailJS configurada, no hace
        // nada (ver sendGuestPassEmail) — el pase sigue funcionando solo con
        // localStorage, esto es una red de seguridad adicional para cuando el
        // invitado pierde el link guardado en el navegador.
        if (email.trim() && event) {
          void sendGuestPassEmail(email.trim(), event.name, buildPassUrl(id, token))
        }
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
      <div className="min-h-screen flex items-center justify-center text-center p-4">
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
          className="min-h-screen flex items-center justify-center text-center p-4"
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
          className="min-h-screen flex items-center justify-center text-center p-4"
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
                    <label className={labelClass}>Nombre *</label>
                    <input type="text" required maxLength={WAITLIST_NAME_MAX} value={wlName} onChange={(e) => setWlName(e.target.value)}
                      placeholder="Ana"
                      className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Apellido *</label>
                    <input type="text" required maxLength={WAITLIST_NAME_MAX} value={wlLastName} onChange={(e) => setWlLastName(e.target.value)}
                      placeholder="García"
                      className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Teléfono <span className="font-normal normal-case">(opcional)</span></label>
                  <input type="tel" maxLength={WAITLIST_PHONE_MAX} value={wlPhone} onChange={(e) => setWlPhone(e.target.value)}
                    placeholder="+1 234 567 8900"
                    className={inputClass} />
                </div>
                {wlError && <p className="text-xs text-red-500">{wlError}</p>}
                <button type="submit" disabled={wlSubmitting}
                  className="w-full text-white rounded-full py-3.5 font-bold text-base hover:opacity-90 active:scale-[.98] transition-all disabled:opacity-50 bg-[var(--invite-accent)]">
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
        className="min-h-screen flex items-center justify-center text-center p-4"
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
        className="flex items-start justify-center min-h-screen text-center p-4"
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
            {partySize > 1 && (
              <p className="text-sm text-[var(--invite-text-muted)]">+{partySize - 1} acompañante(s)</p>
            )}
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
          {id && <WallSection eventId={id} guestName={`${name} ${lastName}`.trim()} guestToken={qrToken} />}
        </div>
      </InvitationThemeRoot>
    )
  }

  const customFields = event?.customFields || []

  return (
    <InvitationThemeRoot
      templateId={event?.templateId}
      accentOverride={event?.accentColor}
      className="min-h-screen flex items-center justify-center text-center p-4"
    >
      <div className="w-full max-w-sm">
        <InvitationCard coverImage={event?.coverImage} coverAlt={event?.name}>
          <h1 className="text-xl font-bold mb-1">{event?.name}</h1>
          <ThemeOrnament templateId={event?.templateId} className="w-16 h-6 mx-auto mt-1 mb-2 text-[var(--invite-accent)]" />
          <p className={`text-sm text-[var(--invite-text-muted)] ${event?.startTime ? '' : 'mb-4'}`}>
            {event?.date} · {event?.location}
          </p>
          {event?.startTime && (
            <p className="text-2xl font-bold mt-1 text-[var(--invite-accent)]">
              {formatTime12h(event.startTime)}{event.endTime && ` – ${formatTime12h(event.endTime)}`}
            </p>
          )}
          {event && (
            <EventCountdown
              date={event.date}
              startTime={event.startTime}
              endTime={event.endTime}
              className="mt-1 mb-4 mx-auto"
            />
          )}

          <form onSubmit={handleSubmit} className="space-y-3 text-left">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Tu nombre *</label>
                <input
                  type="text"
                  required
                  maxLength={GUEST_NAME_PART_MAX}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ana"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Apellido *</label>
                <input
                  type="text"
                  required
                  maxLength={GUEST_NAME_PART_MAX}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="García"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>¿Cuántos vienen? <span className="font-normal normal-case">(incluyéndote)</span></label>
              <input
                type="number"
                min={1}
                max={GUEST_MAX_PARTY_SIZE}
                value={partySize}
                onChange={(e) => setPartySize(Math.min(Math.max(Number(e.target.value) || 1, 1), GUEST_MAX_PARTY_SIZE))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Teléfono <span className="font-normal normal-case">(opcional)</span></label>
              <input
                type="tel"
                maxLength={GUEST_PHONE_MAX}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 234 567 8900"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                Email <span className="font-normal normal-case">(opcional, para recibir tu pase por correo)</span>
              </label>
              <input
                type="email"
                maxLength={GUEST_EMAIL_MAX}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className={inputClass}
              />
            </div>

            {customFields.map((field) => (
              <div key={field.id}>
                <label className={labelClass}>
                  {field.label}{field.required ? ' *' : ''}
                </label>
                <input
                  type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                  required={field.required}
                  maxLength={GUEST_CUSTOM_FIELD_VALUE_MAX}
                  value={customValues[field.id] || ''}
                  onChange={(e) => setCustomValues((v) => ({ ...v, [field.id]: e.target.value }))}
                  className={inputClass}
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
              className="w-full text-white rounded-full py-3.5 font-bold text-base hover:opacity-90 active:scale-[.98] transition-all disabled:opacity-50 bg-[var(--invite-accent)]"
            >
              {state === 'submitting' ? 'Registrando…' : 'Confirmar asistencia'}
            </button>
          </form>
        </InvitationCard>
      </div>
    </InvitationThemeRoot>
  )
}
