import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Logo } from '../components/Logo'
import { IconBarChart, IconCake, IconCamera, IconCheck, IconCheckCircle, IconHeart, IconTicket } from '../components/Icons'

const FEATURES = [
  {
    icon: IconTicket,
    title: 'QR único por invitado',
    description: 'Genera un pase digital individual para cada invitado, listo para compartir por link o PDF.',
  },
  {
    icon: IconCamera,
    title: 'Check-in en tiempo real',
    description: 'Escanea los pases desde el navegador del celular y confirma la asistencia al instante.',
  },
  {
    icon: IconBarChart,
    title: 'Reportes y notificaciones',
    description: 'El plan Premium suma reportes detallados, recordatorios automáticos y mensajes personalizados.',
  },
]

const STEPS = [
  {
    number: '1',
    title: 'Crea tu evento',
    description: 'Elige una plantilla, define fecha, lugar y plan. Listo en menos de un minuto.',
  },
  {
    number: '2',
    title: 'Invita a tus contactos',
    description: 'Agrega invitados uno a uno o en grupo. Cada uno recibe un pase con QR único.',
  },
  {
    number: '3',
    title: 'Escanea y disfruta',
    description: 'El día del evento, escanea cada pase desde el celular y mira el aforo en vivo.',
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
      <section className="relative overflow-hidden bg-gradient-to-b from-primary-light to-transparent">
        <div className="max-w-5xl mx-auto px-4 pt-16 pb-20 text-center animate-fade-in-up">
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
              className="bg-primary text-white rounded-md px-5 py-2.5 font-medium hover:bg-primary-dark transition-colors hover:-translate-y-0.5 hover:shadow-lg"
            >
              Crear mi primer evento
            </Link>
            <Link
              to="/login"
              className="border border-gray-300 rounded-md px-5 py-2.5 font-medium bg-white hover:bg-gray-50 transition-colors"
            >
              Iniciar sesión
            </Link>
          </div>
          <div className="flex items-center justify-center gap-3 mt-8 text-primary">
            <IconTicket className="w-7 h-7" />
            <IconCheckCircle className="w-7 h-7" />
            <IconCake className="w-7 h-7" />
            <IconHeart className="w-7 h-7" />
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-semibold text-gray-900 text-center mb-8">Todo lo que necesitas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className={`card-hover animate-fade-in-up animate-delay-${i + 1} border border-gray-200 rounded-lg bg-white p-5 text-center`}
            >
              <feature.icon className="w-7 h-7 mb-2 mx-auto text-primary" />
              <h3 className="font-medium text-gray-900 mb-1">{feature.title}</h3>
              <p className="text-sm text-gray-500">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-semibold text-gray-900 text-center mb-8">Cómo funciona</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {STEPS.map((step, i) => (
            <div key={step.number} className={`text-center animate-fade-in-up animate-delay-${i + 1}`}>
              <div className="w-10 h-10 rounded-full bg-primary text-white font-semibold flex items-center justify-center mx-auto mb-3">
                {step.number}
              </div>
              <h3 className="font-medium text-gray-900 mb-1">{step.title}</h3>
              <p className="text-sm text-gray-500">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-semibold text-gray-900 text-center mb-2">Planes</h2>
        <p className="text-gray-500 text-center mb-8">Pago único por evento. Sin suscripciones.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`card-hover border rounded-lg bg-white p-6 ${
                plan.id === 'premium' ? 'border-primary ring-1 ring-primary/20' : 'border-gray-200'
              }`}
            >
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  {plan.title}
                  {plan.id === 'premium' && (
                    <span className="text-xs bg-primary-light text-primary px-2 py-0.5 rounded-full font-medium">
                      Recomendado
                    </span>
                  )}
                </h3>
                <div className="text-right">
                  <span className="text-2xl font-semibold text-primary">{plan.price}</span>
                  <span className="text-sm text-gray-500"> / {plan.description}</span>
                </div>
              </div>
              <ul className="text-sm text-gray-600 space-y-1.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <IconCheck className="w-4 h-4 mt-0.5 text-primary shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link
            to="/register"
            className="bg-primary text-white rounded-md px-5 py-2.5 font-medium hover:bg-primary-dark transition-colors hover:-translate-y-0.5 hover:shadow-lg"
          >
            Empezar ahora
          </Link>
        </div>
      </section>
    </div>
  )
}
