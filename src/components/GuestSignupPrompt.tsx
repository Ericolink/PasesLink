import { useEffect, useState } from 'react'
import { getGuestContact } from '../firebase/guests'
import { isGoogleProfileComplete, loginWithGoogle, registerWithEmail } from '../firebase/auth'
import { recordLegalAcceptance } from '../firebase/legalAcceptance'
import { saveUserProfile } from '../firebase/userProfile'
import { AuthErrorMessage } from './AuthErrorMessage'
import { LegalConsentCheckbox } from './LegalConsentCheckbox'
import { PasswordInput } from './PasswordInput'
import { Button } from './Button'
import { Modal } from './Modal'
import { IconCalendar, IconCheckCircle, IconGoogle, IconTicket, IconUserPlus, IconX } from './Icons'
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

  return (
    <Modal
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
            <Button onClick={() => setStep('form')} className="w-full">
              Crear cuenta
            </Button>
            <Button variant="text" onClick={onDismiss} className="w-full rounded-xl py-3">
              Ahora no
            </Button>
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
                  className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
            <Button type="submit" disabled={loading !== null || !legalAccepted} className="w-full">
              {loading === 'email' ? 'Creando cuenta…' : 'Crear cuenta'}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-2">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            <span className="text-xs text-gray-400">o</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          </div>
          <Button variant="secondary" onClick={handleGoogle} disabled={loading !== null || !legalAccepted} className="w-full flex items-center justify-center gap-2">
            <IconGoogle />
            {loading === 'google' ? 'Conectando…' : 'Continuar con Google'}
          </Button>
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
    </Modal>
  )
}
