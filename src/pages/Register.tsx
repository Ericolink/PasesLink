import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loginWithGoogle, registerWithEmail } from '../firebase/auth'
import { AuthLayout } from '../components/AuthLayout'

export function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await registerWithEmail(email, password, name)
      navigate('/dashboard')
    } catch {
      setError('No pudimos crear tu cuenta. Verifica los datos e intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setError('')
    setLoading(true)
    try {
      await loginWithGoogle()
      navigate('/dashboard')
    } catch {
      setError('No pudimos iniciar sesión con Google.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6 text-center">Crear cuenta</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-white rounded-md py-2 font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {loading ? 'Creando cuenta...' : 'Crear cuenta'}
        </button>
      </form>
      <div className="my-4 flex items-center gap-2">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400">o</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
      <button
        onClick={handleGoogle}
        disabled={loading}
        className="w-full border border-gray-300 rounded-md py-2 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        Continuar con Google
      </button>
      <p className="text-sm text-gray-500 text-center mt-6">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="text-primary font-medium">
          Inicia sesión
        </Link>
      </p>
    </AuthLayout>
  )
}
