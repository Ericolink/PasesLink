import { useEffect, useRef, useState } from 'react'
import { useFocusOnChange } from '../hooks/useFocusOnChange'
import { getGuestContact } from '../firebase/guests'
import { isGoogleProfileComplete, loginWithEmail, loginWithGoogle, registerWithEmail } from '../firebase/auth'
import { recordLegalAcceptance } from '../firebase/legalAcceptance'
import { saveUserProfile } from '../firebase/userProfile'
import { reclaimInvitationsByEmail } from '../firebase/invitationRecovery'
import { AuthErrorMessage } from './AuthErrorMessage'
import { LegalConsentCheckbox } from './LegalConsentCheckbox'
import { PasswordInput } from './PasswordInput'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { AccessibleModal } from './accessibility/AccessibleModal'
import { IconCalendar, IconCheckCircle, IconGoogle, IconTicket, IconUserPlus, IconX } from './accessibility/AccessibleIcon'
import { getAuthErrorInfo, isAuthCancellation, type AuthErrorInfo } from '../utils/firebaseErrorMessages'
import { getPasswordError, PASSWORD_HINT, PASSWORD_MIN_LENGTH } from '../utils/validationRules'
import { trackInvitationAccountCreated } from '../lib/analytics'
import type { GuestData } from '../types'

const BENEFITS = [
  { icon: <IconTicket className="w-5 h-5" />, text: 'Accede a todos tus pases desde un solo lugar' },
  { icon: <IconUserPlus className="w-5 h-5" />, text: 'No vuelvas a perder una invitación' },
  { icon: <IconCalendar className="w-5 h-5" />, text: 'Entra más rápido a tus próximos eventos, sin registrarte de nuevo' },
]

interface Props {
  eventId: string
  // Ausente cuando todavía no existe un guest (oferta de cuenta ANTES de
  // autoregistrarse, ver EventJoin.tsx) — presente cuando ya existe un pase
  // (oferta al confirmar RSVP, ver GuestPass.tsx). initialFirstName/LastName
  // solo se usan cuando no hay `guest` todavía.
  guest?: GuestData
  initialFirstName?: string
  initialLastName?: string
  // Permite abrir directo en 'login' (botón "Ya tengo cuenta" en EventJoin,
  // sin pasarle antes el paso de beneficios) — 'offer' por defecto en todo lo
  // demás.
  initialStep?: 'offer' | 'form' | 'login'
  // Distingue el origen para analytics y para el método guardado en
  // recordLegalAcceptance (ver LegalAcceptanceMethod).
  source: 'guest_pass' | 'event_join'
  onDismiss: () => void
  onSuccess: () => void
}

// Se ofrece tanto al confirmar RSVP (ver handleRsvp en GuestPass.tsx) como
// antes de autoregistrarse (ver EventJoin.tsx) a un invitado sin sesión —
// nunca navega fuera de la página: crear la cuenta acá mismo es lo que
// permite "volver exactamente al mismo lugar" sin construir ningún mecanismo
// de redirect. El vínculo cuenta↔pase no lo hace este componente: en cuanto
// la cuenta queda autenticada, cada llamador se encarga de lo suyo (el
// efecto principal de GuestPass llama a saveUserInvitation solo; EventJoin ya
// prellena el formulario y detecta una invitación existente por su cuenta).
export function GuestSignupPrompt({ eventId, guest, initialFirstName, initialLastName, initialStep, source, onDismiss, onSuccess }: Props) {
  const isGroup = guest?.isGroup ?? false
  const [step, setStep] = useState<'offer' | 'form' | 'login' | 'success'>(initialStep ?? 'offer')
  const [firstName, setFirstName] = useState(guest?.name ?? initialFirstName ?? '')
  const [lastName, setLastName] = useState(isGroup ? '' : guest?.lastName || initialLastName || '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [loading, setLoading] = useState<'email' | 'google' | 'login' | null>(null)
  const [errorInfo, setErrorInfo] = useState<AuthErrorInfo | null>(null)
  // Distinto del error genérico de arriba: no usa AuthErrorMessage (que
  // enlaza a /login, navegando afuera del pase — ver el comentario de este
  // componente sobre nunca salir de acá) sino que cambia de paso inline.
  const [accountExistsHint, setAccountExistsHint] = useState(false)
  const stepHeadingRef = useRef<HTMLHeadingElement>(null)

  // Mueve el foco al heading del paso nuevo (offer→form→login→success) —
  // sin esto, el foco se queda en el botón del paso anterior aunque el
  // contenido visible ya sea otro por completo (mismo problema que el
  // wizard de creación de eventos, mismo hook compartido).
  useFocusOnChange(step, stepHeadingRef)

  useEffect(() => {
    if (!guest) return
    let cancelled = false
    getGuestContact(eventId, guest.id).then((contact) => {
      if (!cancelled && contact.email) setEmail(contact.email)
    })
    return () => {
      cancelled = true
    }
  }, [eventId, guest?.id])

  useEffect(() => {
    if (step === 'success') {
      const id = setTimeout(onSuccess, 1500)
      return () => clearTimeout(id)
    }
  }, [step, onSuccess])

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    const passwordError = getPasswordError(password)
    if (passwordError) {
      setErrorInfo({ message: passwordError })
      return
    }
    setErrorInfo(null)
    setAccountExistsHint(false)
    setLoading('email')
    try {
      const newUser = await registerWithEmail(email, password, firstName, lastName)
      await recordLegalAcceptance(newUser.uid, source === 'guest_pass' ? 'guest_pass_email' : 'event_join_email')
      trackInvitationAccountCreated(source, 'email')
      setStep('success')
    } catch (err) {
      // Ya existe una cuenta con este email: en vez de mandarlo a /login
      // (rompería "nunca salir del pase"), se pasa acá mismo al paso de
      // inicio de sesión con el email ya cargado.
      if ((err as { code?: string } | undefined)?.code === 'auth/email-already-in-use') {
        setAccountExistsHint(true)
        setStep('login')
        return
      }
      setErrorInfo(getAuthErrorInfo(err, 'No pudimos crear la cuenta. Intenta de nuevo.'))
    } finally {
      setLoading(null)
    }
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorInfo(null)
    setLoading('login')
    try {
      const user = await loginWithEmail(email, loginPassword)
      // Barrido best-effort: además de este pase (que se vincula solo, ver
      // el efecto de GuestPass.tsx que depende de `user`), esta cuenta puede
      // tener OTRAS invitaciones huérfanas bajo el mismo email verificado
      // (registradas desde otro navegador que perdió el link) — se
      // recuperan todas de una vez, no solo la de este pase puntual.
      if (user.email && user.emailVerified) void reclaimInvitationsByEmail(user.uid, user.email)
      setStep('success')
    } catch (err) {
      setErrorInfo(getAuthErrorInfo(err, 'No pudimos iniciar sesión. Revisa tu email y contraseña.'))
    } finally {
      setLoading(null)
    }
  }

  async function handleGoogle() {
    setErrorInfo(null)
    setLoading('google')
    try {
      const user = await loginWithGoogle()
      if (!(await isGoogleProfileComplete(user.uid))) {
        await saveUserProfile(user.uid, {
          firstName,
          lastName,
          displayName: `${firstName} ${lastName}`.trim(),
        })
      }
      await recordLegalAcceptance(user.uid, source === 'guest_pass' ? 'guest_pass_google' : 'event_join_google')
      trackInvitationAccountCreated(source, 'google')
      // Google siempre viene con el email verificado por Google mismo — el
      // mismo barrido que en el login por email (ver ahí).
      if (user.email) void reclaimInvitationsByEmail(user.uid, user.email)
      setStep('success')
    } catch (err) {
      if (isAuthCancellation(err)) return
      setErrorInfo(getAuthErrorInfo(err, 'No pudimos iniciar sesión con Google.'))
    } finally {
      setLoading(null)
    }
  }

  return (
    <AccessibleModal
      open
      onClose={() => { if (step !== 'success') onDismiss() }}
      label="Crear cuenta en PaseLink"
      className="relative overflow-y-auto"
    >
      {step !== 'success' && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar"
          className="absolute top-2 right-2 min-w-11 min-h-11 inline-flex items-center justify-center text-gray-400 hover:text-gray-600 z-10"
        >
          <IconX className="w-5 h-5" />
        </button>
      )}

      {step === 'offer' && (
        <div className="px-6 pt-7 pb-6">
          <h2 ref={stepHeadingRef} tabIndex={-1} className="text-xl font-bold text-gray-900 dark:text-white text-center rounded focus:outline-none focus:ring-2 focus:ring-primary">¿Quieres crear una cuenta?</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1.5 mb-5">
            Es opcional y toma un minuto. Con una cuenta en PaseLink obtienes:
          </p>
          <ul className="space-y-3 mb-6">
            {BENEFITS.map((b) => (
              <li key={b.text} className="flex items-center gap-3">
                <span className="shrink-0 w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  {b.icon}
                </span>
                <p className="text-sm text-gray-700 dark:text-gray-300">{b.text}</p>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2">
            <AccessibleButton onClick={() => setStep('form')} className="w-full">
              Crear cuenta
            </AccessibleButton>
            <AccessibleButton variant="text" onClick={onDismiss} className="w-full rounded-xl py-3">
              Ahora no
            </AccessibleButton>
          </div>
          <button
            type="button"
            onClick={() => { setAccountExistsHint(false); setStep('login') }}
            className="w-full text-center text-sm text-primary font-medium mt-1 py-2"
          >
            ¿Ya tienes cuenta? Inicia sesión
          </button>
        </div>
      )}

      {step === 'form' && (
        <div className="px-6 pt-7 pb-6">
          <h2 ref={stepHeadingRef} tabIndex={-1} className="text-xl font-bold text-gray-900 dark:text-white text-center mb-5 rounded focus:outline-none focus:ring-2 focus:ring-primary">Crea tu cuenta</h2>
          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <div className={isGroup ? '' : 'grid grid-cols-2 gap-3'}>
              <div>
                <label htmlFor="signup-prompt-first-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {isGroup ? 'Nombre' : 'Nombre *'}
                </label>
                <input
                  id="signup-prompt-first-name"
                  type="text"
                  required={!isGroup}
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {!isGroup && (
                <div>
                  <label htmlFor="signup-prompt-last-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Apellido *</label>
                  <input
                    id="signup-prompt-last-name"
                    type="text"
                    required
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              )}
            </div>
            <div>
              <label htmlFor="signup-prompt-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
              <input
                id="signup-prompt-email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="signup-prompt-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contraseña *</label>
              <PasswordInput
                id="signup-prompt-password"
                required
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                value={password}
                onChange={setPassword}
              />
              <p className="text-xs text-gray-500 mt-1">{PASSWORD_HINT}</p>
            </div>
            <LegalConsentCheckbox id="signup-prompt-legal-consent" checked={legalAccepted} onChange={setLegalAccepted} />
            {errorInfo && <AuthErrorMessage info={errorInfo} />}
            <AccessibleButton type="submit" disabled={loading !== null || !legalAccepted} className="w-full">
              {loading === 'email' ? 'Creando cuenta…' : 'Crear cuenta'}
            </AccessibleButton>
          </form>

          <div className="my-4 flex items-center gap-2">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            <span className="text-xs text-gray-400">o</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          </div>
          <AccessibleButton variant="secondary" onClick={handleGoogle} disabled={loading !== null || !legalAccepted} className="w-full flex items-center justify-center gap-2">
            <IconGoogle />
            {loading === 'google' ? 'Conectando…' : 'Continuar con Google'}
          </AccessibleButton>
          {!legalAccepted && (
            <p className="text-xs text-gray-400 text-center mt-2">Acepta los términos para continuar</p>
          )}
          <button
            type="button"
            onClick={() => { setErrorInfo(null); setAccountExistsHint(false); setStep('login') }}
            className="w-full text-center text-sm text-primary font-medium mt-3 py-2"
          >
            ¿Ya tienes cuenta? Inicia sesión
          </button>
        </div>
      )}

      {step === 'login' && (
        <div className="px-6 pt-7 pb-6">
          <h2 ref={stepHeadingRef} tabIndex={-1} className="text-xl font-bold text-gray-900 dark:text-white text-center mb-1.5 rounded focus:outline-none focus:ring-2 focus:ring-primary">Inicia sesión</h2>
          {accountExistsHint && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-5">
              Ya existe una cuenta con este email — inicia sesión para guardar el pase ahí.
            </p>
          )}
          <form onSubmit={handleLoginSubmit} className="space-y-3">
            <div>
              <label htmlFor="signup-prompt-login-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
              <input
                id="signup-prompt-login-email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="signup-prompt-login-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contraseña *</label>
              <PasswordInput
                id="signup-prompt-login-password"
                required
                autoComplete="current-password"
                value={loginPassword}
                onChange={setLoginPassword}
              />
            </div>
            {errorInfo && <AuthErrorMessage info={errorInfo} />}
            <AccessibleButton type="submit" disabled={loading !== null} className="w-full">
              {loading === 'login' ? 'Iniciando sesión…' : 'Iniciar sesión'}
            </AccessibleButton>
          </form>

          <div className="my-4 flex items-center gap-2">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            <span className="text-xs text-gray-400">o</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          </div>
          <AccessibleButton variant="secondary" onClick={handleGoogle} disabled={loading !== null} className="w-full flex items-center justify-center gap-2">
            <IconGoogle />
            {loading === 'google' ? 'Conectando…' : 'Continuar con Google'}
          </AccessibleButton>
          <button
            type="button"
            onClick={() => { setErrorInfo(null); setStep('form') }}
            className="w-full text-center text-sm text-primary font-medium mt-3 py-2"
          >
            ¿No tienes cuenta? Créala
          </button>
        </div>
      )}

      {step === 'success' && (
        <div className="px-6 py-10 flex flex-col items-center text-center">
          <IconCheckCircle className="w-12 h-12 text-green-500 mb-3" />
          <h2 ref={stepHeadingRef} tabIndex={-1} className="font-semibold text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-primary">¡Listo!</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {guest ? 'Tu pase ya quedó guardado en tu cuenta.' : 'Ya puedes completar tu registro con tus datos precargados.'}
          </p>
        </div>
      )}
    </AccessibleModal>
  )
}
