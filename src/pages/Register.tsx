import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import type { Location } from 'react-router-dom'
import { checkEmailVerified, loginWithGoogle, registerWithEmail, resendVerificationEmail } from '../firebase/auth'
import { recordLegalAcceptance } from '../firebase/legalAcceptance'
import { AuthLayout } from '../components/AuthLayout'
import { AuthErrorMessage } from '../components/AuthErrorMessage'
import { LegalConsentCheckbox } from '../components/LegalConsentCheckbox'
import { PasswordInput } from '../components/PasswordInput'
import { Button } from '../components/Button'
import { IconGoogle } from '../components/Icons'
import { useAuth } from '../hooks/useAuth'
import { uploadImage } from '../utils/cloudinary'
import { usePickAndCropImage } from '../hooks/usePickAndCropImage'
import { ImageCropModal } from '../components/ImageCropModal'
import { getAuthErrorInfo, isAuthCancellation, type AuthErrorInfo } from '../utils/firebaseErrorMessages'
import { getPasswordError, PASSWORD_HINT, PASSWORD_MIN_LENGTH } from '../utils/validationRules'
import { captureException } from '../lib/sentry'

const DEV_AUTO_SKIP_MS = 30000

export function Register() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Mismo mecanismo que Login.tsx: ProtectedRoute guarda la ruta original
  // en location.state.from — quien llega acá sin cuenta (link a una ruta
  // protegida) también vuelve a su destino real, no siempre a /dashboard.
  const from = (location.state as { from?: Location } | null)?.from
  const redirectTo = from && from.pathname !== '/login' && from.pathname !== '/register' ? `${from.pathname}${from.search}` : '/dashboard'
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [photoFile, setPhotoFile] = useState<Blob | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [errorInfo, setErrorInfo] = useState<AuthErrorInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [awaitingVerification, setAwaitingVerification] = useState(false)
  const [checking, setChecking] = useState(false)
  const [resending, setResending] = useState(false)
  const [verifyHint, setVerifyHint] = useState('')

  const { fileInputRef: fileRef, rawImage, error: pickError, openPicker, onFileSelected, onCropConfirmed, onCropCancelled } =
    usePickAndCropImage((blob) => {
      setPhotoFile(blob)
      setPhotoPreview(URL.createObjectURL(blob))
    })

  // No redirige mientras se espera la verificación: createUserWithEmailAndPassword
  // ya deja a `user` autenticado al instante, pero la pantalla de "verifica tu
  // correo" debe mostrarse antes de mandarlo al dashboard.
  const showVerificationGate = awaitingVerification && !!user

  useEffect(() => {
    if (!showVerificationGate || !import.meta.env.DEV) return
    const id = setTimeout(() => navigate(redirectTo), DEV_AUTO_SKIP_MS)
    return () => clearTimeout(id)
  }, [showVerificationGate, navigate, redirectTo])

  if (user && !awaitingVerification) return <Navigate to={redirectTo} replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorInfo(null)
    const passwordError = getPasswordError(password)
    if (passwordError) {
      setErrorInfo({ message: passwordError })
      return
    }
    setLoading(true)
    try {
      let photoURL: string | undefined
      if (photoFile) photoURL = await uploadImage(photoFile)
      const newUser = await registerWithEmail(email, password, firstName, lastName, photoURL)
      await recordLegalAcceptance(newUser.uid, 'register_email')
      setAwaitingVerification(true)
    } catch (err) {
      setErrorInfo(getAuthErrorInfo(err, 'No pudimos crear la cuenta. Intenta de nuevo.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    if (loading) return
    setErrorInfo(null)
    setLoading(true)
    try {
      const u = await loginWithGoogle()
      const { isGoogleProfileComplete } = await import('../firebase/auth')
      const complete = await isGoogleProfileComplete(u.uid)
      navigate(complete ? redirectTo : '/complete-profile')
    } catch (err) {
      if (isAuthCancellation(err)) return
      console.error('Error en login con Google:', err)
      captureException(err, { tags: { component: 'auth', action: 'login_google' } })
      setErrorInfo(getAuthErrorInfo(err, 'No pudimos iniciar sesión con Google.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleCheckVerified() {
    setChecking(true)
    setVerifyHint('')
    try {
      const verified = await checkEmailVerified()
      if (verified) {
        navigate(redirectTo)
      } else {
        setVerifyHint('Aún no detectamos la verificación. Revisa tu bandeja de entrada (o spam) e intenta de nuevo.')
      }
    } finally {
      setChecking(false)
    }
  }

  async function handleResend() {
    setResending(true)
    setVerifyHint('')
    try {
      await resendVerificationEmail()
      setVerifyHint('Te reenviamos el email de verificación.')
    } catch (err) {
      setVerifyHint(getAuthErrorInfo(err, 'No pudimos reenviar el email. Intenta de nuevo.').message)
    } finally {
      setResending(false)
    }
  }

  if (showVerificationGate) {
    return (
      <AuthLayout>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2 text-center">Verifica tu correo</h1>
        <p className="text-sm text-gray-600 text-center mb-6">
          Te enviamos un email a <span className="font-medium">{email}</span>. Verifica tu correo antes de continuar.
        </p>
        {verifyHint && <p className="text-sm text-amber-600 text-center mb-4">{verifyHint}</p>}
        <div className="space-y-2">
          <Button onClick={handleCheckVerified} disabled={checking} className="w-full">
            {checking ? 'Comprobando…' : 'Ya verifiqué mi correo'}
          </Button>
          <button
            onClick={handleResend}
            disabled={resending}
            className="w-full border border-gray-300 rounded-md py-3 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {resending ? 'Enviando…' : 'Reenviar email'}
          </button>
        </div>
        {import.meta.env.DEV && (
          <p className="text-xs text-gray-400 text-center mt-4">
            Modo desarrollo: continuará automáticamente en 30s sin verificar.
          </p>
        )}
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6 text-center">Crear cuenta</h1>

      {/* Avatar selector */}
      <div className="flex flex-col items-center mb-5">
        <button
          type="button"
          onClick={openPicker}
          aria-label="Elegir foto de perfil"
          className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-dashed border-gray-300 hover:border-primary transition-colors flex items-center justify-center bg-gray-100 dark:bg-gray-800"
        >
          {photoPreview
            ? <img src={photoPreview} alt="" className="w-full h-full object-cover" />
            : <span className="text-xs text-gray-500 text-center px-1">Foto<br/>(opcional)</span>
          }
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
        {pickError && <p className="text-xs text-red-500 mt-1.5">{pickError}</p>}
      </div>

      {rawImage && (
        <ImageCropModal
          imageSrc={rawImage}
          aspect={1}
          cropShape="round"
          maxOutputDimension={800}
          onCrop={onCropConfirmed}
          onCancel={onCropCancelled}
        />
      )}

      <form id="register-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="register-first-name" className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input id="register-first-name" type="text" required autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label htmlFor="register-last-name" className="block text-sm font-medium text-gray-700 mb-1">Apellido *</label>
            <input id="register-last-name" type="text" required autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>
        <div>
          <label htmlFor="register-email" className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
          <input id="register-email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div>
          <label htmlFor="register-password" className="block text-sm font-medium text-gray-700 mb-1">Contraseña *</label>
          <PasswordInput id="register-password" required autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} value={password} onChange={setPassword} />
          <p className="text-xs text-gray-500 mt-1">{PASSWORD_HINT}</p>
        </div>
        <LegalConsentCheckbox id="register-legal-consent" checked={legalAccepted} onChange={setLegalAccepted} />
        {errorInfo && <AuthErrorMessage info={errorInfo} />}
      </form>

      {/* CTA fijo: `form="register-form"` lo asocia al <form> de arriba
          aunque viva fuera de él (estándar HTML5, no un hack) — necesario
          para que `sticky` tenga contenido propio debajo (el divisor +
          Google + link de login) y así quede "pegado" mientras se completan
          los campos, en vez de exigir scroll hasta el final para encontrar
          el botón principal. */}
      <button
        type="submit"
        form="register-form"
        disabled={loading || !legalAccepted}
        className="sticky bottom-0 z-10 mt-3 w-full bg-primary text-white rounded-md pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 shadow-[0_-8px_20px_-6px_rgba(0,0,0,0.15)]"
      >
        {loading ? 'Creando cuenta…' : 'Crear cuenta'}
      </button>

      <div className="my-4 flex items-center gap-2">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400">o</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
      <button onClick={handleGoogle} disabled={loading}
        className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-md py-3 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
        <IconGoogle />
        Continuar con Google
      </button>
      <p className="text-sm text-gray-500 text-center mt-5">
        ¿Ya tienes cuenta? <Link to="/login" state={{ from }} className="text-primary font-medium">Inicia sesión</Link>
      </p>
    </AuthLayout>
  )
}
