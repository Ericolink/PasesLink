import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { createEvent } from '../firebase/events'
import type { Plan } from '../types'

const PLANS: { id: Plan; title: string; price: string; features: string[] }[] = [
  {
    id: 'basic',
    title: 'Básico',
    price: '$9 / evento',
    features: ['Invitados ilimitados', 'QR individual por invitado', 'Check-in en tiempo real'],
  },
  {
    id: 'premium',
    title: 'Premium',
    price: '$19 / evento',
    features: [
      'Todo lo del plan Básico',
      'Reportes detallados de asistencia',
      'Notificaciones de check-in en tiempo real',
      'Recordatorios automáticos a invitados',
      'Mensaje de bienvenida personalizado',
      'Soporte prioritario',
    ],
  },
]

export function EventCreate() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [plan, setPlan] = useState<Plan>('basic')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setError('')
    setLoading(true)
    try {
      const eventId = await createEvent(user.uid, { name, date, location, description, plan })
      navigate(`/events/${eventId}/checkout`)
    } catch {
      setError('No pudimos crear el evento. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Crear evento</h1>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del evento</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cumpleaños de Sofía"
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lugar</label>
            <input
              type="text"
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Salón Los Olivos"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción (opcional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Elige tu plan</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PLANS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlan(p.id)}
                className={`text-left border rounded-lg p-4 transition-colors ${
                  plan === p.id ? 'border-primary ring-2 ring-primary/20' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-900">{p.title}</span>
                  <span className="text-sm font-medium text-primary">{p.price}</span>
                </div>
                <ul className="text-sm text-gray-600 space-y-1">
                  {p.features.map((f) => (
                    <li key={f}>· {f}</li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-white rounded-md py-2.5 font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {loading ? 'Creando...' : 'Continuar al pago'}
        </button>
      </form>
    </div>
  )
}
