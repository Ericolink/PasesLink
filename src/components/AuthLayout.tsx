import type { ReactNode } from 'react'
import { IconBarChart, IconCamera, IconTicket } from './Icons'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Panel izquierdo — solo visible en desktop */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 text-center relative overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #160A1E 0%, #150D1C 60%, #1E1428 100%)',
          borderRight: '1px solid rgba(255,20,100,.15)',
        }}
      >
        {/* Glow de fondo */}
        <div
          className="pointer-events-none absolute"
          style={{
            width: '500px', height: '500px',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(circle, rgba(255,20,100,.1) 0%, transparent 70%)',
          }}
        />

        <div className="relative animate-fade-in-up">
          {/* Ícono */}
          <img
            src="/Icon.png"
            alt="PaseLink icon"
            className="h-24 w-auto mx-auto mb-6 animate-float logo-glow"
          />

          <h2 className="text-2xl font-bold text-white mt-2 max-w-sm">
            La forma más simple de organizar tu próximo evento
          </h2>
          <p className="mt-3 max-w-sm" style={{ color: 'rgba(240,244,255,.6)' }}>
            Pases QR individuales, check-in en tiempo real y reportes, todo en un solo lugar.
          </p>

          {/* Íconos decorativos */}
          <div className="flex items-center justify-center gap-5 mt-8">
            {[IconTicket, IconCamera, IconBarChart].map((Icon, i) => (
              <div
                key={i}
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: 'rgba(255,20,100,.1)',
                  border: '1px solid rgba(255,20,100,.25)',
                  boxShadow: '0 0 10px rgba(255,20,100,.12)',
                }}
              >
                <Icon className="w-5 h-5 text-primary" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm animate-fade-in-up">{children}</div>
      </div>
    </div>
  )
}
