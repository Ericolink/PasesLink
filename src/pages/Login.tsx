import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import type { Location } from 'react-router-dom'
import { loginWithEmail, loginWithGoogle } from '../firebase/auth'
import { AuthLayout } from '../components/AuthLayout'
import { AuthErrorMessage } from '../components/AuthErrorMessage'
import { PasswordInput } from '../components/PasswordInput'
import { Button } from '../components/Button'
import { IconGoogle } from '../components/Icons'
import { useAuth } from '../hooks/useAuth'
import { getAuthErrorInfo, isAuthCancellation, type AuthErrorInfo } from '../utils/firebaseErrorMessages'
import { captureException } from '../lib/sentry'

export function Login() {
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorInfo, setErrorInfo] = useState<AuthErrorInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  // ProtectedRoute guarda la ruta original en location.state.from (ver ese
  // componente) para volver ahí después de autenticar, en vez de siempre a
  // /dashboard — descartada si por algún motivo apuntara de nuevo a /login.
  const from = (location.state as { from?: Location } | null)?.from
  const redirectTo = from && from.pathname !== '/login' ? `${from.pathname}${from.search}` : '/dashboard'

  if (user) return <Navigate to={redirectTo} replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorInfo(null)
    setLoading(true)
    try {
      await loginWithEmail(email, password)
      navigate(redirectTo)
    } catch (err) {
      setErrorInfo(getAuthErrorInfo(err, 'No pudimos iniciar sesión. Revisa tu email y contraseña.'))
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

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6 text-center">Iniciar sesión</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-3 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          {/* flex-wrap: los flex items no se achican por debajo de su ancho
              de texto sin envolver a menos que se les permita — sin esto,
              en pantallas angostas (320px) o con letra grande de
              accesibilidad, "¿Olvidaste tu contraseña?" desbordaba la fila
              en vez de bajar de línea. */}
          <div className="flex items-center flex-wrap justify-between gap-x-2 gap-y-0.5 mb-1">
            <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">Contraseña</label>
            <Link to="/forgot-password" className="text-xs text-primary font-medium">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <PasswordInput
            id="login-password"
            required
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
          />
        </div>
        {errorInfo && <AuthErrorMessage info={errorInfo} />}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>
      <div className="my-4 flex items-center gap-2">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400">o</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
      <button
        onClick={handleGoogle}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-md py-3 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        <IconGoogle />
        Continuar con Google
      </button>
      <p className="text-sm text-gray-500 text-center mt-6">
        ¿No tienes cuenta?{' '}
        <Link to="/register" state={{ from }} className="text-primary font-medium">
          Regístrate
        </Link>
      </p>
    </AuthLayout>
  )
}
