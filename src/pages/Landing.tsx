import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Logo } from '../components/Logo'

const FEATURES = [
  {
    icon: '🎟️',
    title: 'QR único por invitado',
    description: 'Genera un pase digital individual para cada invitado, listo para compartir por link o PDF.',
  },
  {
    icon: '📷',
    title: 'Check-in en tiempo real',
    description: 'Escanea los pases desde el navegador del celular y confirma la asistencia al instante.',
  },
  {
    icon: '📊',
    title: 'Reportes y notificaciones',
    description: 'El plan Premium suma reportes detallados, recordatorios automáticos y mensajes personalizados.',
  },
]

const PLANS = [
  {
    id: 'basic',
    title: 'Básico',
    price: '$9',
    description: 'pago único por evento',
    features: ['Invitados ilimitados', 'QR individual por invitado', 'Check-in en tiempo real', 'Exportar pases a PDF'],
  },
  {
    id: 'premium',
    title: 'Premium',
    price: '$19',
    description: 'pago único por evento',
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

export function Landing() {
  const { user, loading } = useAuth()

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div>
      <section className="max-w-5xl mx-auto px-4 pt-16 pb-12 text-center">
        <div className="flex justify-center mb-6">
          <Logo className="text-2xl" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 max-w-2xl mx-auto">
          Gestiona los invitados de tu próximo evento sin complicaciones
        </h1>
        <p className="text-gray-500 mt-4 max-w-xl mx-auto">
          Crea tu evento, genera un pase QR para cada invitado y confirma la asistencia escaneando
          desde el celular. Sin instalar nada, pago único por evento.
        </p>
        <div className="flex items-center justify-center gap-3 mt-8">
          <Link
            to="/register"
            className="bg-primary text-white rounded-md px-5 py-2.5 font-medium hover:bg-primary-dark transition-colors"
          >
            Crear mi primer evento
          </Link>
          <Link
            to="/login"
            className="border border-gray-300 rounded-md px-5 py-2.5 font-medium hover:bg-gray-50 transition-colors"
          >
            Iniciar sesión
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="border border-gray-200 rounded-lg bg-white p-5 text-center">
              <div className="text-3xl mb-2">{feature.icon}</div>
              <h3 className="font-medium text-gray-900 mb-1">{feature.title}</h3>
              <p className="text-sm text-gray-500">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-semibold text-gray-900 text-center mb-2">Planes</h2>
        <p className="text-gray-500 text-center mb-8">Pago único por evento. Sin suscripciones.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {PLANS.map((plan) => (
            <div key={plan.id} className="border border-gray-200 rounded-lg bg-white p-6">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">{plan.title}</h3>
                <div className="text-right">
                  <span className="text-2xl font-semibold text-primary">{plan.price}</span>
                  <span className="text-sm text-gray-500"> / {plan.description}</span>
                </div>
              </div>
              <ul className="text-sm text-gray-600 space-y-1.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-primary">✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link
            to="/register"
            className="bg-primary text-white rounded-md px-5 py-2.5 font-medium hover:bg-primary-dark transition-colors"
          >
            Empezar ahora
          </Link>
        </div>
      </section>
    </div>
  )
}
