import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { IconBarChart, IconCamera, IconCheck, IconCheckCircle, IconTicket } from '../components/Icons'

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
    description: 'Reportes detallados, recordatorios automáticos y mensajes de bienvenida personalizados.',
  },
]

const FREE_FEATURES = [
  'Invitados ilimitados',
  'QR individual por invitado',
  'Check-in en tiempo real',
  'Exportar pases a PDF',
  'Reportes detallados de asistencia',
  'Notificaciones de check-in en tiempo real',
  'Recordatorios automáticos a invitados',
  'Mensaje de bienvenida personalizado',
]

const STEPS = [
  {
    number: '01',
    title: 'Crea tu evento',
    description: 'Define nombre, fecha, lugar y plan. Listo en menos de un minuto.',
  },
  {
    number: '02',
    title: 'Agrega invitados',
    description: 'Uno a uno o en grupo. Cada invitado recibe un pase con QR único.',
  },
  {
    number: '03',
    title: 'Escanea y disfruta',
    description: 'El día del evento escanea cada pase y mira el aforo actualizarse en vivo.',
  },
]

export function Landing() {
  const { user, loading } = useAuth()

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="text-gray-900 dark:text-gray-900">

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-grid min-h-[88vh] flex items-center">
        {/* Decorative corner glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(255,0,77,.1) 0%, transparent 60%)',
          }}
        />

        <div className="relative max-w-5xl mx-auto px-4 py-20 text-center animate-fade-in-up w-full">
          {/* Chip */}
          <span
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full mb-6"
            style={{
              background: 'rgba(255,0,77,.12)',
              border: '1px solid rgba(255,0,77,.35)',
              color: '#FF004D',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Pases digitales para eventos
          </span>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-3xl mx-auto mb-6">
            Gestiona tus invitados{' '}
            <span
              className="relative inline-block"
              style={{ color: '#FAEF5D', textShadow: '0 0 24px rgba(250,239,93,.45)' }}
            >
              sin complicaciones
              <span
                className="absolute -bottom-1 left-0 w-full h-0.5 rounded-full"
                style={{ background: 'linear-gradient(90deg, #FF004D, #FAEF5D)' }}
              />
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-gray-500 dark:text-gray-500 text-lg max-w-xl mx-auto mb-10">
            Crea un evento, genera un QR por invitado y confirma la asistencia escaneando desde el celular.
            Sin instalar nada. Gratis mientras lanzamos el servicio.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/register"
              className="bg-primary text-white rounded-lg px-6 py-3 font-semibold text-sm hover:-translate-y-0.5 transition-all"
            >
              Crear mi primer evento →
            </Link>
            <Link
              to="/login"
              className="rounded-lg px-6 py-3 font-semibold text-sm transition-all hover:-translate-y-0.5"
              style={{
                background: 'rgba(255,255,255,.06)',
                border: '1px solid rgba(255,255,255,.15)',
                color: '#C4CEEA',
              }}
            >
              Iniciar sesión
            </Link>
          </div>

          {/* Floating icon row */}
          <div className="flex items-center justify-center gap-6 mt-14">
            {[IconTicket, IconCheckCircle, IconBarChart, IconCamera].map((Icon, i) => (
              <div
                key={i}
                className="w-11 h-11 rounded-xl flex items-center justify-center animate-float"
                style={{
                  animationDelay: `${i * 0.4}s`,
                  background: 'rgba(26,37,72,.9)',
                  border: '1px solid rgba(255,0,77,.25)',
                  boxShadow: '0 0 10px rgba(255,0,77,.15)',
                }}
              >
                <Icon className="w-5 h-5 text-primary" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Funcionalidades</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Todo lo que necesitas</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className={`card-hover glass rounded-2xl p-6 animate-fade-in-up animate-delay-${i + 1}`}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                style={{
                  background: 'rgba(255,0,77,.12)',
                  boxShadow: '0 0 16px rgba(255,0,77,.2)',
                }}
              >
                <feature.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-500 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Steps ─────────────────────────────────────────────── */}
      <section
        className="py-20"
        style={{ background: 'linear-gradient(180deg, transparent, rgba(255,0,77,.04), transparent)' }}
      >
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">¿Cómo funciona?</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Tres pasos. Eso es todo.</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 relative">
            {/* Connecting line on desktop */}
            <div
              className="hidden sm:block absolute top-6 left-1/6 right-1/6 h-px"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,0,77,.3) 20%, rgba(255,0,77,.3) 80%, transparent)',
              }}
            />

            {STEPS.map((step, i) => (
              <div key={step.number} className={`text-center animate-fade-in-up animate-delay-${i + 1} relative`}>
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-sm relative z-10"
                  style={{
                    background: 'rgba(255,0,77,.15)',
                    border: '2px solid #FF004D',
                    color: '#FF004D',
                    boxShadow: '0 0 16px rgba(255,0,77,.35)',
                  }}
                >
                  {step.number}
                </div>
                <h3 className="font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-500 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Precio ────────────────────────────────────────────── */}
      <section className="max-w-2xl mx-auto px-4 py-20">
        <div
          className="card-hover glass rounded-2xl p-8 text-center relative overflow-hidden"
          style={{ border: '1px solid rgba(255,0,77,.5)', boxShadow: '0 0 28px rgba(255,0,77,.15), inset 0 0 40px rgba(255,0,77,.03)' }}
        >
          <span
            className="absolute top-4 right-4 text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: '#FF004D', color: '#fff' }}
          >
            LANZAMIENTO
          </span>

          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Precio</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-1">Premium, totalmente gratis</h2>
          <p className="text-gray-500 dark:text-gray-500 mb-6">
            Mientras damos a conocer el servicio, todas las funciones están incluidas sin costo. Sin tarjeta, sin
            límite de invitados.
          </p>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left max-w-md mx-auto mb-8">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-600">
                <IconCheck className="w-4 h-4 shrink-0 text-primary" />
                {f}
              </li>
            ))}
          </ul>

          <Link
            to="/register"
            className="inline-block rounded-lg px-8 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5"
            style={{ background: '#FF004D', color: '#fff', boxShadow: '0 0 14px rgba(255,0,77,.45)' }}
          >
            Crear mi evento gratis
          </Link>
        </div>
      </section>

      {/* ── Bottom CTA ────────────────────────────────────────── */}
      <section className="bg-grid border-t py-20" style={{ borderColor: 'rgba(42,58,106,.5)' }}>
        <div className="max-w-xl mx-auto px-4 text-center animate-fade-in-up">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            ¿Listo para tu próximo evento?
          </h2>
          <p className="text-gray-500 dark:text-gray-500 mb-8">
            Crea tu cuenta gratis y configura tu primer evento en minutos.
          </p>
          <Link
            to="/register"
            className="inline-block bg-primary text-white rounded-lg px-8 py-3.5 font-semibold text-sm hover:-translate-y-0.5 transition-all"
          >
            Comenzar ahora →
          </Link>
        </div>
      </section>
    </div>
  )
}
