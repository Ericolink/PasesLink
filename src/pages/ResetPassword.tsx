import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { confirmPasswordReset, verifyPasswordResetCode } from '../firebase/auth'
import { AuthLayout } from '../components/AuthLayout'
import { AuthErrorMessage } from '../components/AuthErrorMessage'
import { PasswordInput } from '../components/PasswordInput'
import { IconCheckCircle, IconXCircle } from '../components/Icons'
import { getAuthErrorInfo, type AuthErrorInfo } from '../utils/firebaseErrorMessages'
import { getPasswordError, PASSWORD_HINT, PASSWORD_MIN_LENGTH } from '../utils/validationRules'

export function ResetPassword() {
  const [searchParams] = useSearchParams()
  const oobCode = searchParams.get('oobCode') || ''
  const navigate = useNavigate()

  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid' | 'done'>(() => oobCode ? 'checking' : 'invalid')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorInfo, setErrorInfo] = useState<AuthErrorInfo | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!oobCode) return
    verifyPasswordResetCode(oobCode)
      .then((userEmail) => {
        setEmail(userEmail)
        setStatus('ready')
      })
      .catch(() => setStatus('invalid'))
  }, [oobCode])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorInfo(null)
    const passwordError = getPasswordError(password)
    if (passwordError) {
      setErrorInfo({ message: passwordError })
      return
    }
    if (password !== confirmPassword) {
      setErrorInfo({ message: 'Las contraseñas no coinciden.' })
      return
    }
    setLoading(true)
    try {
      await confirmPasswordReset(oobCode, password)
      setStatus('done')
    } catch (err) {
      setErrorInfo(getAuthErrorInfo(err, 'No pudimos restablecer tu contraseña. El enlace puede haber expirado.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-gray-900 mb-2 text-center">Restablecer contraseña</h1>

      {status === 'checking' && <p className="text-sm text-gray-500 text-center mt-6">Verificando enlace…</p>}

      {status === 'invalid' && (
        <div className="text-center py-4">
          <IconXCircle className="w-10 h-10 mx-auto mb-3 text-red-600" />
          <p className="text-sm text-gray-700">
            Este enlace para restablecer la contraseña no es válido o ya expiró. Solicita uno nuevo.
          </p>
          <Link to="/forgot-password" className="text-primary font-medium text-sm mt-4 inline-block">
            Solicitar nuevo enlace
          </Link>
        </div>
      )}

      {status === 'ready' && (
        <>
          <p className="text-sm text-gray-500 text-center mb-6">
            Elige una nueva contraseña para <span className="font-medium">{email}</span>.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="reset-password" className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
              <PasswordInput
                id="reset-password"
                required
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                value={password}
                onChange={setPassword}
              />
              <p className="text-xs text-gray-400 mt-1">{PASSWORD_HINT}</p>
            </div>
            <div>
              <label htmlFor="reset-confirm-password" className="block text-sm font-medium text-gray-700 mb-1">Confirmar contraseña</label>
              <PasswordInput
                id="reset-confirm-password"
                required
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                value={confirmPassword}
                onChange={setConfirmPassword}
              />
            </div>
            {errorInfo && <AuthErrorMessage info={errorInfo} />}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white rounded-md py-3 font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {loading ? 'Guardando…' : 'Restablecer contraseña'}
            </button>
          </form>
        </>
      )}

      {status === 'done' && (
        <div className="text-center py-4">
          <IconCheckCircle className="w-10 h-10 mx-auto mb-3 text-green-600" />
          <p className="text-sm text-gray-700 mb-4">Tu contraseña fue actualizada correctamente.</p>
          <button
            onClick={() => navigate('/login')}
            className="bg-primary text-white rounded-md px-4 py-3 font-medium hover:bg-primary-dark transition-colors"
          >
            Ir a iniciar sesión
          </button>
        </div>
      )}
    </AuthLayout>
  )
}
