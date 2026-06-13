import type { ReactNode } from 'react'
import { Logo } from './Logo'
import { IconBarChart, IconCamera, IconTicket } from './Icons'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary to-primary-dark text-white flex-col items-center justify-center p-12 text-center">
        <div className="animate-fade-in-up">
          <Logo className="text-2xl justify-center [&_span]:text-white [&_.text-primary]:text-blue-200" />
          <h2 className="text-2xl font-semibold mt-6 max-w-sm">
            La forma más simple de organizar tu próximo evento
          </h2>
          <p className="text-blue-100 mt-3 max-w-sm">
            Pases QR individuales, check-in en tiempo real y reportes, todo en un solo lugar.
          </p>
          <div className="flex items-center justify-center gap-4 mt-8">
            <IconTicket className="w-8 h-8" />
            <IconCamera className="w-8 h-8" />
            <IconBarChart className="w-8 h-8" />
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm animate-fade-in-up">{children}</div>
      </div>
    </div>
  )
}
