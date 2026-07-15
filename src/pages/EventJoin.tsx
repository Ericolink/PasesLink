import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { subscribeToEventWithInitial } from '../firebase/events'
import { registerWalkInGuest } from '../firebase/capacity'
import { resolveMaxCompanions } from '../firebase/guests'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { saveUserInvitation } from '../firebase/userProfile'
import { sendGuestPassEmail } from '../utils/emailjs'
import {
  GUEST_CUSTOM_FIELD_VALUE_MAX,
  GUEST_EMAIL_MAX,
  GUEST_NAME_PART_MAX,
  GUEST_PHONE_MAX,
} from '../utils/validation'
import { CrownLoader } from '../components/CrownLoader'

// Look del formulario de cara al invitado: inputs en pill (forma fija, no
// depende del --invite-radius de cada tema — el objetivo es que se vea
// "amigable" en las 6 plantillas por igual) y labels en mayúscula con
// tracking. Colores (foco, texto, fondo) sí siguen el tema vía --invite-*.
export const labelClass = 'block text-xs font-bold uppercase tracking-wide mb-1.5 text-[var(--invite-text-muted)]'
export const inputClass =
  'w-full rounded-full border border-[var(--invite-border)] bg-[var(--invite-surface)] text-[var(--invite-text)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--invite-accent)]'
import { InvitationThemeRoot } from '../components/InvitationThemeRoot'
import { InvitationCard } from '../components/InvitationCard'
import { ThemeOrnament } from '../components/ThemeOrnament'
import { EventCountdown } from '../components/EventCountdown'
import { formatTime12h } from '../utils/time'
import { IconBan } from '../components/Icons'
import type { EventData, PaymentMethod } from '../types'
import { buildPassUrl } from '../utils/qrUrl'
import { customFieldInputProps } from '../utils/customFieldInput'
import { PAYMENT_METHOD_LABELS } from '../utils/paymentMethods'

type State = 'loading' | 'form' | 'submitting' | 'not_found' | 'error'

interface SavedReg {
  qrToken: string
}

function regKey(eventId: string) {
  return `join_reg_${eventId}`
}

// El pase de un invitado autoregistrado se ve y funciona igual que el de un
// invitado agregado por lista: ambos son el mismo documento en
// events/{eventId}/guests y ambos se muestran con GuestPass en
// /pass/:eventId/:qrToken (descarga, compartir, RSVP, check-in, etc.). Este
// componente solo cubre el formulario de registro — una vez creado el
// invitado, se redirige a esa única fuente de verdad en vez de duplicar su UI.
export function EventJoin() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [regError, setRegError] = useState('')

  // Un único listener cubre tanto la decisión de estado inicial
  // (not_found/error/form, resuelta con su primer snapshot) como las
  // actualizaciones en vivo posteriores que el organizador guarde desde
  // EditEventForm — evita el getDoc aparte que antes leía el mismo
  // documento dos veces en cada visita.
  useEffect(() => {
    if (!id) return
    const { unsubscribe, initial } = subscribeToEventWithInitial(id, (ev) => {
      if (ev) setEvent(ev)
    })
    initial.then((ev) => {
      if (!ev) { setState('not_found'); return }
      if (ev.entryMode === 'list') { setState('error'); return }

      // Ya registrado antes en este navegador: llevarlo directo a su pase
      // (misma ruta que usa un invitado de lista) en vez de re-registrarlo.
      const saved = localStorage.getItem(regKey(id))
      if (saved) {
        try {
          const reg: SavedReg = JSON.parse(saved)
          if (reg.qrToken) {
            navigate(`/pass/${id}/${reg.qrToken}`, { replace: true })
            return
          }
        } catch {
          localStorage.removeItem(regKey(id))
        }
      }

      setState('form')
    })
    return unsubscribe
  }, [id, navigate])

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

  // Tope de "¿cuántos vienen?" — límite de acompañantes configurado para
  // ESTE evento (EventData.maxCompanions), no un valor global. Mientras
  // `event` todavía no cargó, cae a 1 (sin acompañantes) en vez de permitir
  // de más por un instante.
  const maxPartySize = 1 + resolveMaxCompanions({ maxCompanions: event?.maxCompanions })
  const needsMethodChoice = !!event?.requiresPayment && (event?.paymentMethods.length || 0) > 1
  const resolvedPaymentMethod: PaymentMethod | undefined = !event?.requiresPayment
    ? undefined
    : needsMethodChoice
      ? paymentMethod || undefined
      : event.paymentMethods[0]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !name.trim() || !lastName.trim()) return
    if (needsMethodChoice && !resolvedPaymentMethod) {
      setRegError('Elegí cómo vas a pagar antes de continuar.')
      return
    }
    setState('submitting')
    setRegError('')
    try {
      const fullName = `${name.trim()} ${lastName.trim()}`
      const result = await registerWalkInGuest(
        id,
        fullName,
        undefined,
        phone,
        customValues,
        partySize,
        resolvedPaymentMethod,
        user?.uid,
        profile?.photoURL,
      )
      if (result.status === 'error') {
        setRegError('Este evento ya no está disponible. Actualiza la página e intenta de nuevo.')
        setState('form')
        return
      }
      const token = result.qrToken!
      localStorage.setItem(regKey(id), JSON.stringify({ qrToken: token }))
      localStorage.setItem('wall_guest_name', fullName)
      // Best-effort: si no hay plantilla de EmailJS configurada, no hace
      // nada (ver sendGuestPassEmail) — el pase sigue funcionando solo con
      // el link de /pass, esto es una red de seguridad adicional para
      // cuando el invitado pierde el link guardado en el navegador.
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
          eventTemplateId: event.templateId,
          eventAccentColor: event.accentColor,
          guestName: fullName,
          qrToken: token,
          type: 'walkin',
        })
      }
      // Mismo destino que un invitado de lista (GuestList.tsx) — una sola
      // pantalla de pase (GuestPass) con descarga, compartir y RSVP, en vez
      // de una vista de éxito propia y más limitada acá. `justRegistered`
      // es lo que le permite a GuestPass ofrecer crear cuenta apenas llega
      // (mismo criterio que ya tiene un invitado de lista al confirmar
      // RSVP) — sin esto, este registro nunca alcanzaba a mostrar esa
      // oferta porque esta pantalla se abandona de inmediato.
      navigate(`/pass/${id}/${token}`, { replace: true, state: { justRegistered: true } })
    } catch (err) {
      console.error('Error registering guest:', err)
      setRegError(err instanceof Error ? err.message : 'No se pudo completar el registro. Intenta de nuevo.')
      setState('form')
    }
  }

  if (state === 'loading') {
    return <CrownLoader />
  }

  if (state === 'not_found' || state === 'error') {
    return (
      <div className="min-h-dvh flex items-center justify-center text-center p-4">
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

  const customFields = event?.customFields || []

  return (
    <InvitationThemeRoot
      templateId={event?.templateId}
      accentOverride={event?.accentColor}
      className="min-h-dvh flex items-center justify-center text-center p-4"
    >
      <div className="w-full max-w-sm">
        <InvitationCard coverImage={event?.coverImage} coverAlt={event?.name} priority>
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

          {event?.description && (
            <p className="mb-4 text-sm text-[var(--invite-text-muted)] leading-relaxed whitespace-pre-line text-left">
              {event.description}
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-3 text-left">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Tu nombre *</label>
                <input
                  type="text"
                  required
                  autoComplete="given-name"
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
                  autoComplete="family-name"
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
              <div className="flex items-center justify-between rounded-full border border-[var(--invite-border)] bg-[var(--invite-surface)] px-2 py-1">
                <button
                  type="button"
                  onClick={() => setPartySize(Math.max(partySize - 1, 1))}
                  disabled={partySize <= 1}
                  aria-label="Restar acompañante"
                  className="w-11 h-11 shrink-0 rounded-full text-xl font-bold text-[var(--invite-text)] disabled:opacity-30 active:bg-[var(--invite-accent-soft)] transition-colors"
                >
                  −
                </button>
                <span className="text-base font-semibold text-[var(--invite-text)] tabular-nums">{partySize}</span>
                <button
                  type="button"
                  onClick={() => setPartySize(Math.min(partySize + 1, maxPartySize))}
                  disabled={partySize >= maxPartySize}
                  aria-label="Sumar acompañante"
                  className="w-11 h-11 shrink-0 rounded-full text-xl font-bold text-[var(--invite-text)] disabled:opacity-30 active:bg-[var(--invite-accent-soft)] transition-colors"
                >
                  +
                </button>
              </div>
              {partySize >= maxPartySize && (
                <p className="text-xs mt-1 text-[var(--invite-text-muted)]">
                  {maxPartySize <= 1
                    ? 'Este evento no permite acompañantes.'
                    : 'Alcanzaste el máximo de acompañantes permitidos para este evento.'}
                </p>
              )}
            </div>
            <div>
              <label className={labelClass}>Teléfono <span className="font-normal normal-case">(opcional)</span></label>
              <input
                type="tel"
                autoComplete="tel"
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
                autoComplete="email"
                inputMode="email"
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
                  {...customFieldInputProps(field.type)}
                  required={field.required}
                  maxLength={GUEST_CUSTOM_FIELD_VALUE_MAX}
                  value={customValues[field.id] || ''}
                  onChange={(e) => setCustomValues((v) => ({ ...v, [field.id]: e.target.value }))}
                  className={inputClass}
                />
              </div>
            ))}

            {event?.requiresPayment && (
              <div>
                <label className={labelClass}>
                  Entrada: {event.currency}{(event.ticketPrice * partySize).toLocaleString('es')}
                  {needsMethodChoice && ' — ¿cómo vas a pagar? *'}
                </label>
                {needsMethodChoice ? (
                  <div className="grid grid-cols-2 gap-2">
                    {event.paymentMethods.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={`min-h-11 rounded-full border text-sm font-semibold transition-colors ${
                          paymentMethod === m
                            ? 'bg-[var(--invite-accent)] text-white border-[var(--invite-accent)]'
                            : 'border-[var(--invite-border)] text-[var(--invite-text)]'
                        }`}
                      >
                        {PAYMENT_METHOD_LABELS[m]}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--invite-text-muted)]">
                    {event.paymentMethods[0] === 'cash' ? 'Se paga en efectivo el día del evento.' : 'Se paga por transferencia.'}
                  </p>
                )}
                {event.paymentMethods.includes('transfer') && (needsMethodChoice ? paymentMethod === 'transfer' : true) && (
                  <p className="text-xs mt-1.5 text-[var(--invite-text-muted)]">Podés enviar tu comprobante cuando quieras después de registrarte.</p>
                )}
              </div>
            )}

            {!!event?.capacity && (
              event.peopleCount >= event.capacity ? (
                <p className="text-xs text-center text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                  Este evento ya superó el número recomendado de asistentes. Aún puedes obtener tu boleto y asistir, pero
                  el ingreso dependerá del orden de llegada el día del evento.
                </p>
              ) : (
                <p className="text-xs text-center text-[var(--invite-text-muted)]">
                  {event.peopleCount} / {event.capacity} registros
                </p>
              )
            )}
            {regError && <p className="text-xs text-red-500">{regError}</p>}
            <button
              type="submit"
              disabled={state === 'submitting' || (needsMethodChoice && !paymentMethod)}
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
