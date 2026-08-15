import { useEffect, useRef, useState } from 'react'
import type { CountryCode } from 'libphonenumber-js/min'
import { useNavigate, useParams } from 'react-router-dom'
import { subscribeToEventWithInitial } from '../firebase/events'
import { registerWalkInGuest } from '../firebase/capacity'
import { CapacityFullError } from '../firebase/attendeeLimit'
import { resolveMaxCompanions } from '../firebase/guests'
import { joinWaitlist } from '../firebase/waitlist'
import { CountryCodeSelect, DEFAULT_PHONE_COUNTRY } from '../components/CountryCodeSelect'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { getUserInvitation, saveUserInvitation } from '../firebase/userProfile'
import { GuestSignupPrompt } from '../components/GuestSignupPrompt'
import { trackInvitationSignupPromptShown } from '../lib/analytics'
import { isRedesignedInvitationTemplate } from '../templates/registry'
import { useAccountConfirmGate } from '../hooks/useAccountConfirmGate'
import {
  companionFieldsHaveErrors,
  GUEST_CUSTOM_FIELD_VALUE_MAX,
  GUEST_EMAIL_MAX,
  GUEST_NAME_PART_MAX,
  GUEST_PHONE_MAX,
  validateCompanionFields,
  type CompanionFieldErrors,
} from '../utils/validation'
import { CrownLoader } from '../components/CrownLoader'
import { getFunctionsErrorMessage } from '../utils/firebaseErrorMessages'

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
import { IconBan, IconCheckCircle, IconClock } from '../components/accessibility/AccessibleIcon'
import { useFocusFirstInvalidField } from '../hooks/useFocusFirstInvalidField'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAnnouncer } from '../components/accessibility/LiveRegion'
import type { CompanionData, EventData } from '../types'
import { CustomFieldInput } from '../components/CustomFieldInput'
import { TransferInfoDisplay } from '../components/invitation/TransferInfoDisplay'
import { FieldError, AccessibleField } from '../components/accessibility/AccessibleField'
import { regKey } from '../utils/joinRegistration'

type State = 'loading' | 'form' | 'submitting' | 'not_found' | 'error' | 'full'

// Único lugar que decide si el evento ya alcanzó su cupo (ver
// CAPACITY_LIMIT_ARCHITECTURE.md) — con el límite desactivado (ausente/false,
// todo evento antes de esta feature) siempre da `false`, cero cambio de
// comportamiento.
function isEventFull(ev: Pick<EventData, 'attendeeLimitEnabled' | 'peopleCount' | 'capacity'>): boolean {
  return !!ev.attendeeLimitEnabled && (ev.peopleCount ?? 0) >= (ev.capacity ?? 0)
}

interface SavedReg {
  qrToken: string
}

interface SavedWaitlistReg {
  waitlistToken: string
}

function waitlistRegKey(eventId: string) {
  return `join_waitlist_${eventId}`
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
  useDocumentTitle(event ? `Unirme · ${event.name}` : 'Unirme al evento')
  const [state, setState] = useState<State>('loading')
  const [name, setName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(DEFAULT_PHONE_COUNTRY)
  const [email, setEmail] = useState('')
  // Cantidad de personas para el formulario de LISTA DE ESPERA (más abajo,
  // state === 'full') — ese flujo no crea un invitado todavía (solo una
  // oferta a confirmar más tarde), así que sigue siendo un conteo simple,
  // sin datos por persona. El registro real (state === 'form') usa
  // `companions` (abajo), que sí guarda un invitado con datos por persona.
  const [partySize, setPartySize] = useState(1)
  // Datos reales de cada acompañante del registro — cada nuevo acompañante
  // debe completar los mismos datos que esta invitación exige al invitado
  // principal (nombre/apellido, siempre; teléfono, opcional; los
  // customFields que el organizador marcó obligatorios), ver
  // validateCompanionFields. El tamaño del grupo para cupo/precio se deriva
  // de este array (1 + companions.length) en vez de un contador aparte.
  const [companions, setCompanions] = useState<CompanionData[]>([])
  const [companionErrors, setCompanionErrors] = useState<CompanionFieldErrors[]>([])
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [regError, setRegError] = useState('')
  const [regErrorAttempt, setRegErrorAttempt] = useState(0)
  const [waitlistState, setWaitlistState] = useState<'form' | 'submitting' | 'joined' | 'error'>('form')
  const [waitlistToken, setWaitlistToken] = useState<string | null>(null)
  // Tarjeta "guarda tu invitación" antes del formulario (ver GuestSignupPrompt
  // más abajo) — un dismiss por sesión de navegador, mismo criterio que
  // paselink_signup_prompt_* en GuestPass.tsx.
  const [signupCardDismissed, setSignupCardDismissed] = useState(
    () => !!id && sessionStorage.getItem(`paselink_join_signup_dismissed_${id}`) === '1',
  )
  const [showSignupPrompt, setShowSignupPrompt] = useState(false)
  const [signupPromptStep, setSignupPromptStep] = useState<'form' | 'login'>('form')
  const formRef = useRef<HTMLFormElement>(null)
  useFocusFirstInvalidField(formRef, regErrorAttempt)

  const { announce } = useAnnouncer()
  // Un stepper personalizado no anuncia su cambio de valor por sí solo como
  // lo haría un <input type=number> nativo — sin esto, un lector de pantalla
  // no confirma el nuevo total al presionar +/-. `previousPartySize` (no un
  // booleano) evita anunciar en el montaje inicial, incluida la doble
  // invocación de StrictMode (mismo patrón que RouteAnnouncer).
  const previousPartySize = useRef<number | null>(null)
  useEffect(() => {
    if (previousPartySize.current === null || previousPartySize.current === partySize) {
      previousPartySize.current = partySize
      return
    }
    previousPartySize.current = partySize
    announce(`${partySize} ${partySize === 1 ? 'persona' : 'personas'} en total`)
  }, [partySize, announce])

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

      // Ya se anotó antes en la lista de espera de este evento: lo manda a
      // su pantalla de estado (que ya sabe mostrar "sigues esperando" /
      // "tienes una oferta" / "ya tienes un lugar") en vez de mostrarle el
      // formulario de nuevo — sin importar si el evento sigue lleno o no.
      const savedWaitlist = localStorage.getItem(waitlistRegKey(id))
      if (savedWaitlist) {
        try {
          const reg: SavedWaitlistReg = JSON.parse(savedWaitlist)
          if (reg.waitlistToken) {
            navigate(`/waitlist/${id}?token=${reg.waitlistToken}`, { replace: true })
            return
          }
        } catch {
          localStorage.removeItem(waitlistRegKey(id))
        }
      }

      setState(isEventFull(ev) ? 'full' : 'form')
    })
    return unsubscribe
  }, [id, navigate])

  // Reactividad en vivo del cupo (el mismo listener de arriba ya trae
  // actualizaciones del organizador sin refrescar, ver
  // subscribeToEventWithInitial): si el evento se llena mientras alguien
  // tiene el formulario abierto, o el organizador sube el límite mientras se
  // muestra la pantalla de "lleno", el estado se ajusta solo. No toca
  // 'submitting' (no interrumpir un envío en curso) ni 'not_found'/'error'.
  // Efecto intencional (sincroniza `state` contra el evento en vivo, no un
  // valor derivable en el render): mismo criterio que el efecto de
  // prefill de perfil un poco más abajo.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!event) return
    if (state !== 'form' && state !== 'full') return
    const full = isEventFull(event)
    if (full && state === 'form') setState('full')
    if (!full && state === 'full') setState('form')
  }, [event, state])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Pre-fill name/lastName/email from profile. Intencionalmente un efecto: profile
  // llega async después de user, y los guards `!name`/`!email` evitan pisar lo
  // que el usuario ya tipeó. Convertirlo a "ajustar estado durante el render"
  // cambiaría cuándo se aplica el valor de profile vs. el de user.displayName.
  // Sin teléfono: UserProfile no tiene ese campo hoy (solo vive en el guest).
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!user) return
    if (!name) {
      setName(profile?.firstName || user.displayName?.split(' ')[0] || '')
      setLastName(profile?.lastName || user.displayName?.split(' ').slice(1).join(' ') || '')
    }
    if (!email && user.email) setEmail(user.email)
  }, [profile, user])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  // Si el invitado ya escribió datos propios (acompañantes, teléfono, campos
  // personalizados — nunca autocompletados, a diferencia de nombre/email que
  // sí vienen del perfil) para cuando esta verificación resuelve, no lo
  // saquemos de golpe del formulario: dejamos que termine y envíe, y
  // registerWalkInGuest ya sabe fusionar esos datos nuevos contra el
  // registro existente en vez de perderlos (ver bug 2026-08-10, antes este
  // efecto redirigía sin avisar apenas detectaba una invitación previa,
  // tirando a la basura acompañantes recién tecleados). Ref en vez de estado
  // para no reprogramar la verificación en cada tecla.
  const hasEnteredOwnDataRef = useRef(false)
  useEffect(() => {
    hasEnteredOwnDataRef.current =
      companions.length > 0 || !!phone.trim() || Object.values(customValues).some((v) => v.trim())
  })

  // Si esta cuenta ya tiene una invitación guardada para este evento (se
  // autoregistró antes, quizás desde otro dispositivo — el check de
  // localStorage de arriba es por navegador, no por cuenta), lo manda directo
  // a su pase existente en vez de dejarlo llenar el formulario de nuevo y
  // crear un segundo registro. Corre tanto si ya estaba logueado al entrar
  // como si recién se logueó desde la tarjeta de abajo. La barrera real
  // contra duplicados vive del lado del servidor (ver registerWalkInGuest.ts,
  // Cloud Functions) — esto es solo la UX que evita mostrarle el formulario.
  useEffect(() => {
    const uid = user?.uid
    if (!id || !uid || (state !== 'form' && state !== 'full')) return
    let cancelled = false
    getUserInvitation(uid, id).then((inv) => {
      if (cancelled || !inv?.qrToken || hasEnteredOwnDataRef.current) return
      localStorage.setItem(regKey(id), JSON.stringify({ qrToken: inv.qrToken }))
      navigate(`/pass/${id}/${inv.qrToken}`, { replace: true })
    })
    return () => {
      cancelled = true
    }
  }, [id, user?.uid, state, navigate])

  // Tarjeta "guarda tu invitación" — visible mientras no haya sesión, el
  // formulario esté disponible, y no se haya descartado en esta sesión.
  // Fiesta Improvisada no la muestra acá (ver isHouseparty más abajo): la
  // decisión de cuenta se mueve al momento de "Confirmar asistencia".
  const showSignupCard = !user && state === 'form' && !signupCardDismissed
  useEffect(() => {
    if (showSignupCard) trackInvitationSignupPromptShown('event_join')
  }, [showSignupCard])

  // Invitación rediseñada (ver INVITATION_REDESIGN_PLAN) — hoy solo Fiesta
  // Improvisada. Gatea la decisión de cuenta detrás de "Confirmar
  // asistencia" en vez de ofrecerla antes del formulario; no cambia nada
  // para el resto de las plantillas (accountGate.requestConfirm ejecuta la
  // acción de una si ya hay sesión, así que ni siquiera houseparty ve el
  // gate estando logueado).
  const isHouseparty = isRedesignedInvitationTemplate(event?.templateId)
  const accountGate = useAccountConfirmGate(!!user)

  // Tope de "¿cuántos vienen?" — límite de acompañantes configurado para
  // ESTE evento (EventData.maxCompanions), no un valor global. Mientras
  // `event` todavía no cargó, cae a 1 (sin acompañantes) en vez de permitir
  // de más por un instante.
  const maxPartySize = 1 + resolveMaxCompanions({ maxCompanions: event?.maxCompanions })
  const customFields = event?.customFields || []
  // Un campo personalizado solo se pide por acompañante si el organizador lo
  // marcó `appliesToCompanions` (rediseño del Dashboard del Evento) — antes
  // se exigían TODOS los campos requeridos del evento a cada acompañante,
  // sin distinción; ahora el organizador decide cuáles aplican más allá del
  // invitado principal. `companionCustomFields` gobierna qué inputs se
  // renderizan por acompañante; `requiredCompanionFields` (subconjunto,
  // `required: true`) es lo que valida validateCompanionFields.
  const companionCustomFields = customFields.filter((f) => f.appliesToCompanions)
  const requiredCompanionFields = companionCustomFields.filter((f) => f.required)
  // Tamaño real del grupo del formulario de registro — se deriva de los
  // datos de acompañantes ya cargados, nunca de un contador aparte que
  // pudiera desincronizarse de lo que realmente se va a guardar.
  const registrationPartySize = 1 + companions.length

  function addCompanion() {
    if (registrationPartySize >= maxPartySize) return
    setCompanions((cs) => [...cs, {}])
    setCompanionErrors((errs) => [...errs, {}])
    announce(`${registrationPartySize + 1} ${registrationPartySize + 1 === 1 ? 'persona' : 'personas'} en total`)
  }

  function removeCompanion() {
    if (companions.length === 0) return
    setCompanions((cs) => cs.slice(0, -1))
    setCompanionErrors((errs) => errs.slice(0, -1))
    announce(`${registrationPartySize - 1} ${registrationPartySize - 1 === 1 ? 'persona' : 'personas'} en total`)
  }

  function updateCompanion(index: number, patch: Partial<CompanionData>) {
    setCompanions((cs) => cs.map((c, i) => (i === index ? { ...c, ...patch } : c)))
    setCompanionErrors((errs) =>
      errs.map((e, i) => {
        if (i !== index) return e
        const next = { ...e }
        if (patch.name !== undefined) delete next.name
        if (patch.lastName !== undefined) delete next.lastName
        return next
      }),
    )
  }

  function updateCompanionCustomField(index: number, fieldId: string, value: string) {
    setCompanions((cs) => cs.map((c, i) => (i === index ? { ...c, customData: { ...c.customData, [fieldId]: value } } : c)))
    setCompanionErrors((errs) =>
      errs.map((e, i) => {
        if (i !== index || !e.customData?.[fieldId]) return e
        const nextCustomData = { ...e.customData }
        delete nextCustomData[fieldId]
        return { ...e, customData: nextCustomData }
      }),
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !name.trim() || !lastName.trim()) return
    const nextCompanionErrors = companions.map((c) => validateCompanionFields(c, requiredCompanionFields))
    if (nextCompanionErrors.some(companionFieldsHaveErrors)) {
      setCompanionErrors(nextCompanionErrors)
      setRegError('Completa los datos de tus acompañantes para continuar.')
      setRegErrorAttempt((n) => n + 1)
      return
    }
    // Fiesta Improvisada: la decisión de cuenta (crear/iniciar sesión/
    // continuar sin cuenta) ocurre acá, ANTES de registrar — ver
    // INVITATION_REDESIGN_PLAN §5-7. Para el resto de las plantillas (y para
    // cualquier invitado ya logueado) esto es un no-op: doRegister corre de
    // inmediato, igual que siempre.
    if (isHouseparty) {
      accountGate.requestConfirm(doRegister)
    } else {
      void doRegister()
    }
  }

  async function doRegister() {
    // Redundante con el guard de handleSubmit (que ya validó `id` antes de
    // llamar acá) — TypeScript no propaga esa validación entre funciones
    // distintas, y accountGate.requestConfirm puede diferir la llamada.
    if (!id) return
    setState('submitting')
    setRegError('')
    try {
      const fullName = `${name.trim()} ${lastName.trim()}`
      const result = await registerWalkInGuest(
        id,
        name.trim(),
        lastName.trim(),
        email,
        phone,
        customValues,
        companions,
        undefined,
        user?.uid,
        profile?.photoURL,
        phoneCountry,
      )
      if (result.status === 'error') {
        setRegError('Este evento ya no está disponible. Actualiza la página e intenta de nuevo.')
        setRegErrorAttempt((n) => n + 1)
        setState('form')
        return
      }
      const token = result.qrToken!
      localStorage.setItem(regKey(id), JSON.stringify({ qrToken: token }))
      localStorage.setItem('wall_guest_name', fullName)
      // El envío del pase por email ya no se dispara desde acá — el
      // callable registerWalkInGuest lo manda del lado del servidor
      // (functions/src/capacity/guestPassEmail.ts) cuando el invitado dejó
      // un email, best-effort, ver NOTIFICATIONS_CONSOLIDATION_ARCHITECTURE.md
      // Fase 4. El pase sigue funcionando solo con el link de /pass.
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
      // Perdió la carrera por el último lugar (ver assertCapacityAvailable):
      // nunca se le muestra como un error técnico, va directo a la misma
      // pantalla amigable de "evento lleno" — ver CAPACITY_LIMIT_ARCHITECTURE.md §7.
      if (err instanceof CapacityFullError) {
        setState('full')
        return
      }
      console.error('Error registering guest:', err)
      setRegError(getFunctionsErrorMessage(err, 'No se pudo completar el registro. Intenta de nuevo.'))
      setRegErrorAttempt((n) => n + 1)
      setState('form')
    }
  }

  // Unirse a la lista de espera reutiliza los mismos campos de estado
  // (name/lastName/phone/phoneCountry/email/partySize) que el formulario de
  // registro normal — nunca se muestran los dos a la vez (uno depende de
  // `state === 'form'`, el otro de `state === 'full'`), así que no hay
  // conflicto en compartirlos.
  async function handleJoinWaitlist(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !name.trim() || !lastName.trim()) return
    setWaitlistState('submitting')
    try {
      const fullName = `${name.trim()} ${lastName.trim()}`
      const { waitlistToken: token } = await joinWaitlist(id, fullName, partySize, phone, phoneCountry, email, customValues)
      localStorage.setItem(waitlistRegKey(id), JSON.stringify({ waitlistToken: token }))
      setWaitlistToken(token)
      setWaitlistState('joined')
    } catch (err) {
      console.error('Error joining waitlist:', err)
      setWaitlistState('error')
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

  if (state === 'full') {
    return (
      <InvitationThemeRoot
        templateId={event?.templateId}
        accentOverride={event?.accentColor}
        themeOverrides={event?.themeOverrides}
        communityTemplateVars={event?.communityTemplateSnapshot?.vars}
        className="min-h-dvh flex items-center justify-center text-center p-4"
      >
        <div className="w-full max-w-sm">
          <InvitationCard coverImage={event?.coverImage} coverAlt={event?.name} priority>
            <h1 className="text-xl font-bold mb-1">{event?.name}</h1>
            <ThemeOrnament templateId={event?.templateId} className="w-16 h-6 mx-auto mt-1 mb-4 text-[var(--invite-accent)]" />

            {/* Un solo mensaje prominente en vez de dos líneas separadas
                ("cupo completo" arriba, "puedes anotarte" chiquito y suelto
                más abajo) — el punto central de esta pantalla es "hay lista
                de espera", no "está cerrado", así que tiene que notarse de
                entrada, antes de que la persona vea el formulario. */}
            {/* Texto en negro fijo (no --invite-text, que en algunos temas
                sale blanco): bg-accent-soft puede resultar en un azul poco
                claro según la plantilla, y blanco sobre azul saturado no se
                distingue — negro fijo garantiza contraste sin depender del
                tema. */}
            <div className="rounded-2xl border-2 border-[var(--invite-accent)] bg-[var(--invite-accent-soft)] p-4 mb-5">
              <IconClock className="w-8 h-8 mx-auto mb-2 text-[var(--invite-accent)]" />
              <p className="text-base font-bold text-gray-900 mb-1">
                Este evento alcanzó su capacidad máxima
              </p>
              <p className="text-sm text-gray-900">
                Pero puedes anotarte en la <strong>lista de espera</strong>: si se libera un lugar, te avisamos
                automáticamente.
              </p>
            </div>

            {waitlistState === 'joined' ? (
              <div className="rounded-2xl border border-[var(--invite-border)] bg-[var(--invite-surface)] p-4 text-left">
                <p className="flex items-center gap-2 text-sm font-semibold text-[var(--invite-text)] mb-1">
                  <IconCheckCircle className="w-4 h-4 shrink-0 text-green-500" />
                  Te agregamos a la lista de espera.
                </p>
                <p className="text-xs text-[var(--invite-text-muted)] mb-3">
                  Guarda este link para consultar tu estado cuando quieras.
                </p>
                <button
                  type="button"
                  onClick={() => id && waitlistToken && navigate(`/waitlist/${id}?token=${waitlistToken}`)}
                  className="w-full text-white rounded-full py-3 font-bold text-sm hover:opacity-90 active:scale-[.98] transition-all bg-[var(--invite-accent)]"
                >
                  Ver mi estado en la lista de espera
                </button>
              </div>
            ) : (
              <form onSubmit={handleJoinWaitlist} className="space-y-3 text-left">
                <p className={`${labelClass} text-center normal-case`}>Anotarme en la lista de espera</p>
                <div className="grid grid-cols-2 gap-2">
                  <AccessibleField label="Tu nombre" required labelClassName={labelClass}>
                    {(fieldProps) => (
                      <input
                        {...fieldProps}
                        type="text"
                        autoComplete="given-name"
                        maxLength={GUEST_NAME_PART_MAX}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ana"
                        className={inputClass}
                      />
                    )}
                  </AccessibleField>
                  <AccessibleField label="Apellido" required labelClassName={labelClass}>
                    {(fieldProps) => (
                      <input
                        {...fieldProps}
                        type="text"
                        autoComplete="family-name"
                        maxLength={GUEST_NAME_PART_MAX}
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="García"
                        className={inputClass}
                      />
                    )}
                  </AccessibleField>
                </div>
                <fieldset className="border-0 p-0 m-0">
                  <legend className={labelClass}>¿Cuántos son? <span className="font-normal normal-case">(incluyéndote)</span></legend>
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
                </fieldset>
                <AccessibleField label={<>Teléfono <span className="font-normal normal-case">(opcional)</span></>} labelClassName={labelClass}>
                  {(fieldProps) => (
                    <div className="flex items-center gap-1.5">
                      <CountryCodeSelect
                        value={phoneCountry}
                        onChange={setPhoneCountry}
                        aria-label="País del teléfono"
                        className="rounded-full border border-[var(--invite-border)] bg-[var(--invite-surface)] text-[var(--invite-text)] px-2.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--invite-accent)]"
                      />
                      <input
                        {...fieldProps}
                        type="tel"
                        autoComplete="tel"
                        maxLength={GUEST_PHONE_MAX}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="656 123 4567"
                        className={`flex-1 min-w-0 ${inputClass}`}
                      />
                    </div>
                  )}
                </AccessibleField>
                <AccessibleField
                  label={<>Email <span className="font-normal normal-case">(recomendado, para avisarte si se libera un lugar)</span></>}
                  labelClassName={labelClass}
                >
                  {(fieldProps) => (
                    <input
                      {...fieldProps}
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      maxLength={GUEST_EMAIL_MAX}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@email.com"
                      className={inputClass}
                    />
                  )}
                </AccessibleField>

                {customFields.map((field) => (
                  <AccessibleField key={field.id} label={field.label} required={field.required} labelClassName={labelClass}>
                    {(fieldProps) => (
                      <CustomFieldInput
                        field={field}
                        fieldProps={fieldProps}
                        maxLength={GUEST_CUSTOM_FIELD_VALUE_MAX}
                        value={customValues[field.id] || ''}
                        onChange={(v) => setCustomValues((cv) => ({ ...cv, [field.id]: v }))}
                        className={inputClass}
                      />
                    )}
                  </AccessibleField>
                ))}

                {waitlistState === 'error' && (
                  <FieldError message="No pudimos anotarte en la lista de espera. Intenta de nuevo." />
                )}
                <button
                  type="submit"
                  disabled={waitlistState === 'submitting'}
                  className="w-full text-white rounded-full py-3.5 font-bold text-base hover:opacity-90 active:scale-[.98] transition-all disabled:opacity-50 bg-[var(--invite-accent)]"
                >
                  {waitlistState === 'submitting' ? 'Anotando…' : 'Unirme a la lista de espera'}
                </button>
              </form>
            )}

            <p className="text-xs text-[var(--invite-text-muted)] mt-4">
              Si ya tienes una invitación, búscala en tu correo o WhatsApp. Si crees que esto es un error, contacta al
              organizador.
            </p>
          </InvitationCard>
        </div>
      </InvitationThemeRoot>
    )
  }

  return (
    <InvitationThemeRoot
      templateId={event?.templateId}
      accentOverride={event?.accentColor}
      themeOverrides={event?.themeOverrides}
      communityTemplateVars={event?.communityTemplateSnapshot?.vars}
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
            <p className="invite-description mb-4 text-sm text-[var(--invite-text-muted)] leading-relaxed whitespace-pre-line text-left">
              {event.description}
            </p>
          )}

          {!isHouseparty && showSignupCard && (
            <div className="mb-4 rounded-2xl border border-[var(--invite-border)] bg-[var(--invite-surface)] p-4 text-left">
              <p className="text-sm font-bold text-[var(--invite-text)] mb-1">Guarda tu invitación en PaseLink</p>
              <p className="text-xs text-[var(--invite-text-muted)] mb-3">
                Crea una cuenta gratis para completar tu registro más rápido y encontrar esta invitación después, desde
                cualquier dispositivo.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => { setSignupPromptStep('form'); setShowSignupPrompt(true) }}
                  className="w-full text-white rounded-full py-2.5 font-bold text-sm hover:opacity-90 active:scale-[.98] transition-all bg-[var(--invite-accent)]"
                >
                  Crear cuenta
                </button>
                <button
                  type="button"
                  onClick={() => { setSignupPromptStep('login'); setShowSignupPrompt(true) }}
                  className="w-full text-center text-[var(--invite-accent)] font-semibold text-sm py-1"
                >
                  Ya tengo cuenta
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (id) sessionStorage.setItem(`paselink_join_signup_dismissed_${id}`, '1')
                  setSignupCardDismissed(true)
                }}
                className="w-full text-center text-xs text-[var(--invite-text-muted)] mt-2 py-1"
              >
                Continuar sin cuenta
              </button>
            </div>
          )}

          {showSignupPrompt && (
            <GuestSignupPrompt
              eventId={id!}
              initialFirstName={name}
              initialLastName={lastName}
              initialStep={signupPromptStep}
              source="event_join"
              onDismiss={() => setShowSignupPrompt(false)}
              onSuccess={() => setShowSignupPrompt(false)}
            />
          )}

          {/* Fiesta Improvisada: la oferta de cuenta ocurre al presionar
              "Confirmar asistencia" (ver handleSubmit/doRegister arriba),
              no antes del formulario — accountGate.gateOpen solo se activa
              sin sesión. */}
          {isHouseparty && accountGate.gateOpen && (
            <GuestSignupPrompt
              eventId={id!}
              initialFirstName={name}
              initialLastName={lastName}
              source="event_join"
              gateMode
              onContinueWithoutAccount={accountGate.resolve}
              onDismiss={accountGate.cancel}
              onSuccess={accountGate.resolve}
            />
          )}

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-3 text-left">
            <div className="grid grid-cols-2 gap-2">
              <AccessibleField label="Tu nombre" required labelClassName={labelClass}>
                {(fieldProps) => (
                  <input
                    {...fieldProps}
                    type="text"
                    autoComplete="given-name"
                    maxLength={GUEST_NAME_PART_MAX}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ana"
                    className={inputClass}
                  />
                )}
              </AccessibleField>
              <AccessibleField label="Apellido" required labelClassName={labelClass}>
                {(fieldProps) => (
                  <input
                    {...fieldProps}
                    type="text"
                    autoComplete="family-name"
                    maxLength={GUEST_NAME_PART_MAX}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="García"
                    className={inputClass}
                  />
                )}
              </AccessibleField>
            </div>
            <fieldset className="border-0 p-0 m-0">
              <legend className={labelClass}>¿Cuántos vienen? <span className="font-normal normal-case">(incluyéndote)</span></legend>
              <div className="flex items-center justify-between rounded-full border border-[var(--invite-border)] bg-[var(--invite-surface)] px-2 py-1">
                <button
                  type="button"
                  onClick={removeCompanion}
                  disabled={registrationPartySize <= 1}
                  aria-label="Restar acompañante"
                  className="w-11 h-11 shrink-0 rounded-full text-xl font-bold text-[var(--invite-text)] disabled:opacity-30 active:bg-[var(--invite-accent-soft)] transition-colors"
                >
                  −
                </button>
                <span className="text-base font-semibold text-[var(--invite-text)] tabular-nums">{registrationPartySize}</span>
                <button
                  type="button"
                  onClick={addCompanion}
                  disabled={registrationPartySize >= maxPartySize}
                  aria-label="Sumar acompañante"
                  className="w-11 h-11 shrink-0 rounded-full text-xl font-bold text-[var(--invite-text)] disabled:opacity-30 active:bg-[var(--invite-accent-soft)] transition-colors"
                >
                  +
                </button>
              </div>
              {registrationPartySize >= maxPartySize && (
                <p className="text-xs mt-1 text-[var(--invite-text-muted)]">
                  {maxPartySize <= 1
                    ? 'Este evento no permite acompañantes.'
                    : 'Alcanzaste el máximo de acompañantes permitidos para este evento.'}
                </p>
              )}
            </fieldset>

            {/* Cada acompañante debe completar los mismos datos que esta
                invitación exige al invitado principal — ver
                validateCompanionFields (utils/validation.ts). Sin edición
                individual (solo el stepper de arriba agrega/quita al final):
                mismo criterio simple que ya tenía este formulario, ahora con
                datos reales en vez de un conteo. */}
            {companions.map((companion, index) => {
              const humanIndex = index + 1
              const errors = companionErrors[index] || {}
              return (
                <fieldset
                  key={index}
                  className="rounded-2xl border border-[var(--invite-border)] bg-[var(--invite-surface)] p-3 space-y-2.5"
                >
                  <legend className={`${labelClass} px-1`}>Acompañante {humanIndex}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <AccessibleField label="Nombre" required error={errors.name} labelClassName={labelClass}>
                      {(fieldProps) => (
                        <input
                          {...fieldProps}
                          type="text"
                          autoComplete="off"
                          maxLength={GUEST_NAME_PART_MAX}
                          value={companion.name || ''}
                          onChange={(e) => updateCompanion(index, { name: e.target.value })}
                          placeholder="Nombre"
                          className={inputClass}
                        />
                      )}
                    </AccessibleField>
                    <AccessibleField label="Apellido" required error={errors.lastName} labelClassName={labelClass}>
                      {(fieldProps) => (
                        <input
                          {...fieldProps}
                          type="text"
                          autoComplete="off"
                          maxLength={GUEST_NAME_PART_MAX}
                          value={companion.lastName || ''}
                          onChange={(e) => updateCompanion(index, { lastName: e.target.value })}
                          placeholder="Apellido"
                          className={inputClass}
                        />
                      )}
                    </AccessibleField>
                  </div>
                  <AccessibleField
                    label={<>Teléfono <span className="font-normal normal-case">(opcional)</span></>}
                    labelClassName={labelClass}
                  >
                    {(fieldProps) => (
                      <div className="flex items-center gap-1.5">
                        <CountryCodeSelect
                          value={(companion.phoneCountry as CountryCode) || phoneCountry}
                          onChange={(v) => updateCompanion(index, { phoneCountry: v })}
                          aria-label={`País del teléfono del acompañante ${humanIndex}`}
                          className="rounded-full border border-[var(--invite-border)] bg-[var(--invite-surface)] text-[var(--invite-text)] px-2.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--invite-accent)]"
                        />
                        <input
                          {...fieldProps}
                          type="tel"
                          autoComplete="off"
                          maxLength={GUEST_PHONE_MAX}
                          value={companion.phone || ''}
                          onChange={(e) => updateCompanion(index, { phone: e.target.value })}
                          placeholder="656 123 4567"
                          className={`flex-1 min-w-0 ${inputClass}`}
                        />
                      </div>
                    )}
                  </AccessibleField>
                  {companionCustomFields.map((field) => (
                    <AccessibleField
                      key={field.id}
                      label={field.label}
                      required={field.required}
                      error={errors.customData?.[field.id]}
                      labelClassName={labelClass}
                    >
                      {(fieldProps) => (
                        <CustomFieldInput
                          field={field}
                          fieldProps={fieldProps}
                          maxLength={GUEST_CUSTOM_FIELD_VALUE_MAX}
                          value={companion.customData?.[field.id] || ''}
                          onChange={(v) => updateCompanionCustomField(index, field.id, v)}
                          className={inputClass}
                        />
                      )}
                    </AccessibleField>
                  ))}
                </fieldset>
              )
            })}

            <AccessibleField label={<>Teléfono <span className="font-normal normal-case">(opcional)</span></>} labelClassName={labelClass}>
              {(fieldProps) => (
                <div className="flex items-center gap-1.5">
                  <CountryCodeSelect
                    value={phoneCountry}
                    onChange={setPhoneCountry}
                    aria-label="País del teléfono"
                    className="rounded-full border border-[var(--invite-border)] bg-[var(--invite-surface)] text-[var(--invite-text)] px-2.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--invite-accent)]"
                  />
                  <input
                    {...fieldProps}
                    type="tel"
                    autoComplete="tel"
                    maxLength={GUEST_PHONE_MAX}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="656 123 4567"
                    className={`flex-1 min-w-0 ${inputClass}`}
                  />
                </div>
              )}
            </AccessibleField>
            <AccessibleField
              label={<>Email <span className="font-normal normal-case">(opcional, para recibir tu pase por correo)</span></>}
              labelClassName={labelClass}
            >
              {(fieldProps) => (
                <input
                  {...fieldProps}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  maxLength={GUEST_EMAIL_MAX}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className={inputClass}
                />
              )}
            </AccessibleField>

            {customFields.map((field) => (
              <AccessibleField key={field.id} label={field.label} required={field.required} labelClassName={labelClass}>
                {(fieldProps) => (
                  <CustomFieldInput
                    field={field}
                    fieldProps={fieldProps}
                    maxLength={GUEST_CUSTOM_FIELD_VALUE_MAX}
                    value={customValues[field.id] || ''}
                    onChange={(v) => setCustomValues((cv) => ({ ...cv, [field.id]: v }))}
                    className={inputClass}
                  />
                )}
              </AccessibleField>
            ))}

            {event?.requiresPayment && (
              <fieldset className="border-0 p-0 m-0">
                <legend className={labelClass}>
                  Entrada: {event.currency}{(event.ticketPrice * registrationPartySize).toLocaleString('es')}
                </legend>
                <p className="text-xs font-semibold uppercase tracking-wide mb-1.5 text-[var(--invite-text-muted)]">¿Cómo puedo pagar?</p>
                <TransferInfoDisplay event={event} />
                {event.paymentMethods.includes('transfer') && (
                  <p className="text-xs mt-1.5 text-[var(--invite-text-muted)]">Puedes enviar tu comprobante cuando quieras después de registrarte.</p>
                )}
              </fieldset>
            )}

            {/* Con el límite activado, la pantalla de "evento lleno" (arriba)
                ya se hace cargo del caso sin lugar — este aviso solo llega a
                mostrarse mientras todavía queda cupo, así que alcanza con el
                contador simple. Sin el límite activado, sigue el aviso
                informativo de siempre (capacity nunca bloquea nada). */}
            {!!event?.capacity && (
              event.attendeeLimitEnabled || event.peopleCount < event.capacity ? (
                <p className="text-xs text-center text-[var(--invite-text-muted)]">
                  {event.peopleCount} / {event.capacity} registros
                </p>
              ) : (
                <p className="text-xs text-center text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                  Este evento ya superó el número recomendado de asistentes. Aún puedes obtener tu boleto y asistir, pero
                  el ingreso dependerá del orden de llegada el día del evento.
                </p>
              )
            )}
            <FieldError message={regError} />
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
