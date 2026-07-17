import { useState } from 'react'
import { Link } from 'react-router-dom'
import { resetPassword } from '../firebase/auth'
import { AuthLayout } from '../components/AuthLayout'
import { AuthErrorMessage } from '../components/AuthErrorMessage'
import { IconCheckCircle } from '../components/Icons'
import { Button } from '../components/Button'
import { TextField } from '../components/TextField'
import { getAuthErrorInfo, type AuthErrorInfo } from '../utils/firebaseErrorMessages'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [errorInfo, setErrorInfo] = useState<AuthErrorInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorInfo(null)
    setLoading(true)
    try {
      await resetPassword(email)
      setSent(true)
    } catch (err) {
      setErrorInfo(getAuthErrorInfo(err, 'No pudimos enviar el correo. Verifica que el email sea correcto.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-gray-900 mb-2 text-center">Recuperar contraseña</h1>
      {sent ? (
        <div className="text-center py-4">
          <IconCheckCircle className="w-10 h-10 mx-auto mb-3 text-green-600" />
          <p className="text-sm text-gray-700">
            Te enviamos un correo a <span className="font-medium">{email}</span> con instrucciones para restablecer
            tu contraseña.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 text-center mb-6">
            Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <TextField
              label="Email"
              type="email"
              size="lg"
              required
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errorInfo && <AuthErrorMessage info={errorInfo} />}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </Button>
          </form>
        </>
      )}
      <p className="text-sm text-gray-500 text-center mt-6">
        <Link to="/login" className="text-primary font-medium">
          Volver a iniciar sesión
        </Link>
      </p>
    </AuthLayout>
  )
}
