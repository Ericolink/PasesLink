import { useState } from 'react'
import { Link } from 'react-router-dom'
import { resetPassword } from '../firebase/auth'
import { AuthLayout } from '../components/AuthLayout'
import { IconCheckCircle } from '../components/Icons'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await resetPassword(email)
      setSent(true)
    } catch {
      setError('No pudimos enviar el correo. Verifica que el email sea correcto.')
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white rounded-md py-2 font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {loading ? 'Enviando...' : 'Enviar enlace'}
            </button>
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
