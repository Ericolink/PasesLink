import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getGuestContact } from '../firebase/guests'
import { isGoogleProfileComplete, loginWithGoogle, registerWithEmail } from '../firebase/auth'
import { recordLegalAcceptance } from '../firebase/legalAcceptance'
import { saveUserProfile } from '../firebase/userProfile'
import { useModalA11y } from '../hooks/useModalA11y'
import { AuthErrorMessage } from './AuthErrorMessage'
import { LegalConsentCheckbox } from './LegalConsentCheckbox'
import { PasswordInput } from './PasswordInput'
import { IconCalendar, IconCheckCircle, IconTicket, IconUserPlus, IconX } from './Icons'
import { getAuthErrorInfo, isAuthCancellation, type AuthErrorInfo } from '../utils/firebaseErrorMessages'
import { getPasswordError, PASSWORD_HINT, PASSWORD_MIN_LENGTH } from '../utils/validationRules'
import type { GuestData } from '../types'

const BENEFITS = [
  { icon: <IconTicket className="w-5 h-5" />, text: 'Accede a todos tus pases desde un solo lugar' },
  { icon: <IconUserPlus className="w-5 h-5" />, text: 'No vuelvas a perder una invitación' },
  { icon: <IconCalendar className="w-5 h-5" />, text: 'Entra más rápido a tus próximos eventos, sin registrarte de nuevo' },
]

interface Props {
  eventId: string
  guest: GuestData
  onDismiss: () => void
  onSuccess: () => void
}

// Se ofrece justo al confirmar RSVP (ver handleRsvp en GuestPass.tsx) a un
// invitado sin sesión — nunca navega fuera del pase: crear la cuenta acá
// mismo es lo que permite "volver exactamente a la misma invitación" sin
// construir ningún mecanismo de redirect. El vínculo cuenta↔pase no lo hace
// este componente: en cuanto la cuenta queda autenticada, el efecto principal
// de GuestPass (que depende de `user`) llama a saveUserInvitation solo.
export function GuestSignupPrompt({ eventId, guest, onDismiss, onSuccess }: Props) {
  const [step, setStep] = useState<'offer' | 'form' | 'success'>('offer')
  const [firstName, setFirstName] = useState(guest.name)
  const [lastName, setLastName] = useState(guest.isGroup ? '' : guest.lastName || '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [loading, setLoading] = useState<'email' | 'google' | null>(null)
  const [errorInfo, setErrorInfo] = useState<AuthErrorInfo | null>(null)
  const dialogRef = useModalA11y<HTMLDivElement>(true, onDismiss)

  useEffect(() => {
    let cancelled = false
    getGuestContact(eventId, guest.id).then((contact) => {
      if (!cancelled && contact.email) setEmail(contact.email)
    })
    return () => {
      cancelled = true
    }
  }, [eventId, guest.id])

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
    setLoading('email')
    try {
      const newUser = await registerWithEmail(email, password, firstName, lastName)
      await recordLegalAcceptance(newUser.uid, 'guest_pass_email')
      setStep('success')
    } catch (err) {
      setErrorInfo(getAuthErrorInfo(err, 'No pudimos crear la cuenta. Intenta de nuevo.'))
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
      await recordLegalAcceptance(user.uid, 'guest_pass_google')
      setStep('success')
    } catch (err) {
      if (isAuthCancellation(err)) return
      setErrorInfo(getAuthErrorInfo(err, 'No pudimos iniciar sesión con Google.'))
    } finally {
      setLoading(null)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 pb-[env(safe-area-inset-bottom)] sm:pb-0 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && step !== 'success') onDismiss() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Crear cuenta en PaseLink"
        className="relative bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm max-h-[90vh] overflow-y-auto animate-bounce-in"
      >
        {step !== 'success' && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Cerrar"
            className="absolute top-2 right-2 min-w-11 min-h-11 inline-flex items-center justify-center text-gray-400 hover:text-gray-600 z-10"
          >
            <IconX className="w-4 h-4" />
          </button>
        )}

        {step === 'offer' && (
          <div className="px-6 pt-7 pb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center">¿Quieres crear una cuenta?</h2>
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
              <button
                onClick={() => setStep('form')}
                className="w-full rounded-xl py-3 text-sm font-medium text-white bg-primary hover:bg-primary-dark transition-colors"
              >
                Crear cuenta
              </button>
              <button
                onClick={onDismiss}
                className="w-full rounded-xl py-3 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Ahora no
              </button>
            </div>
          </div>
        )}

        {step === 'form' && (
          <div className="px-6 pt-7 pb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center mb-5">Crea tu cuenta</h2>
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <div className={guest.isGroup ? '' : 'grid grid-cols-2 gap-3'}>
                <div>
                  <label htmlFor="signup-prompt-first-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {guest.isGroup ? 'Nombre' : 'Nombre *'}
                  </label>
                  <input
                    id="signup-prompt-first-name"
                    type="text"
                    required={!guest.isGroup}
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                {!guest.isGroup && (
                  <div>
                    <label htmlFor="signup-prompt-last-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Apellido *</label>
                    <input
                      id="signup-prompt-last-name"
                      type="text"
                      required
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
                  className="w-full border border-gray-300 rounded-md px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
                <p className="text-xs text-gray-400 mt-1">{PASSWORD_HINT}</p>
              </div>
              <LegalConsentCheckbox id="signup-prompt-legal-consent" checked={legalAccepted} onChange={setLegalAccepted} />
              {errorInfo && <AuthErrorMessage info={errorInfo} />}
              <button
                type="submit"
                disabled={loading !== null || !legalAccepted}
                className="w-full bg-primary text-white rounded-md py-3 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {loading === 'email' ? 'Creando cuenta…' : 'Crear cuenta'}
              </button>
            </form>

            <div className="my-4 flex items-center gap-2">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              <span className="text-xs text-gray-400">o</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            </div>
            <button
              onClick={handleGoogle}
              disabled={loading !== null || !legalAccepted}
              className="w-full flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-600 rounded-md py-3 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              {loading === 'google' ? 'Conectando…' : 'Continuar con Google'}
            </button>
            {!legalAccepted && (
              <p className="text-xs text-gray-400 text-center mt-2">Acepta los términos para continuar</p>
            )}
          </div>
        )}

        {step === 'success' && (
          <div className="px-6 py-10 flex flex-col items-center text-center">
            <IconCheckCircle className="w-12 h-12 text-green-500 mb-3" />
            <p className="font-semibold text-gray-900 dark:text-white">¡Listo!</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Tu pase ya quedó guardado en tu cuenta.</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
