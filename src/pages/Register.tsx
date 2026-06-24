import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { checkEmailVerified, loginWithGoogle, registerWithEmail, resendVerificationEmail } from '../firebase/auth'
import { AuthLayout } from '../components/AuthLayout'
import { AuthErrorMessage } from '../components/AuthErrorMessage'
import { useAuth } from '../hooks/useAuth'
import { uploadImage } from '../utils/cloudinary'
import { getAuthErrorInfo, isAuthCancellation, type AuthErrorInfo } from '../utils/firebaseErrorMessages'
import { getPasswordError, PASSWORD_HINT, PASSWORD_MIN_LENGTH } from '../utils/validationRules'

const DEV_AUTO_SKIP_MS = 30000

export function Register() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [errorInfo, setErrorInfo] = useState<AuthErrorInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [awaitingVerification, setAwaitingVerification] = useState(false)
  const [checking, setChecking] = useState(false)
  const [resending, setResending] = useState(false)
  const [verifyHint, setVerifyHint] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // No redirige mientras se espera la verificación: createUserWithEmailAndPassword
  // ya deja a `user` autenticado al instante, pero la pantalla de "verifica tu
  // correo" debe mostrarse antes de mandarlo al dashboard.
  const showVerificationGate = awaitingVerification && !!user

  useEffect(() => {
    if (!showVerificationGate || !import.meta.env.DEV) return
    const id = setTimeout(() => navigate('/dashboard'), DEV_AUTO_SKIP_MS)
    return () => clearTimeout(id)
  }, [showVerificationGate, navigate])

  if (user && !awaitingVerification) return <Navigate to="/dashboard" replace />

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

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
      await registerWithEmail(email, password, firstName, lastName, birthDate, photoURL)
      setAwaitingVerification(true)
    } catch (err) {
      setErrorInfo(getAuthErrorInfo(err, 'No pudimos crear la cuenta. Intenta de nuevo.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setErrorInfo(null)
    setLoading(true)
    try {
      const u = await loginWithGoogle()
      // Check if profile is already complete (has birthDate)
      const { isGoogleProfileComplete } = await import('../firebase/auth')
      const complete = await isGoogleProfileComplete(u.uid)
      navigate(complete ? '/dashboard' : '/complete-profile')
    } catch (err) {
      if (isAuthCancellation(err)) return
      console.error('Error en login con Google:', err)
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
        navigate('/dashboard')
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
          <button
            onClick={handleCheckVerified}
            disabled={checking}
            className="w-full bg-primary text-white rounded-md py-2 font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {checking ? 'Comprobando…' : 'Ya verifiqué mi correo'}
          </button>
          <button
            onClick={handleResend}
            disabled={resending}
            className="w-full border border-gray-300 rounded-md py-2 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
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
      <div className="flex justify-center mb-5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Elegir foto de perfil"
          className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-dashed border-gray-300 hover:border-primary transition-colors flex items-center justify-center bg-gray-100 dark:bg-gray-800"
        >
          {photoPreview
            ? <img src={photoPreview} alt="" className="w-full h-full object-cover" />
            : <span className="text-xs text-gray-500 text-center px-1">Foto<br/>(opcional)</span>
          }
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="register-first-name" className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input id="register-first-name" type="text" required autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label htmlFor="register-last-name" className="block text-sm font-medium text-gray-700 mb-1">Apellido *</label>
            <input id="register-last-name" type="text" required autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>
        <div>
          <label htmlFor="register-birth-date" className="block text-sm font-medium text-gray-700 mb-1">Fecha de nacimiento *</label>
          <input id="register-birth-date" type="date" required autoComplete="bday" value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div>
          <label htmlFor="register-email" className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
          <input id="register-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div>
          <label htmlFor="register-password" className="block text-sm font-medium text-gray-700 mb-1">Contraseña *</label>
          <input id="register-password" type="password" required autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          <p className="text-xs text-gray-400 mt-1">{PASSWORD_HINT}</p>
        </div>
        {errorInfo && <AuthErrorMessage info={errorInfo} />}
        <button type="submit" disabled={loading}
          className="w-full bg-primary text-white rounded-md py-2 font-medium hover:bg-primary-dark transition-colors disabled:opacity-50">
          {loading ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>

      <div className="my-4 flex items-center gap-2">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400">o</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
      <button onClick={handleGoogle} disabled={loading}
        className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-md py-2 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
        <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Continuar con Google
      </button>
      <p className="text-sm text-gray-500 text-center mt-5">
        ¿Ya tienes cuenta? <Link to="/login" className="text-primary font-medium">Inicia sesión</Link>
      </p>
    </AuthLayout>
  )
}
