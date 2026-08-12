import type { EventData } from '../../types'
import { ConcessionSettingsPanel } from './ConcessionSettingsPanel'
import { IconCheckCircle } from '../accessibility/AccessibleIcon'

interface Props {
  event: EventData
  isAdmin: boolean
}

const STEPS = [
  { title: 'Configura tus ventas', done: false },
  { title: 'Agrega lo que vas a vender', done: false },
  { title: 'Gestiona los pedidos', done: false },
  { title: 'Caja y preparación durante el evento', done: false },
  { title: 'Revisa tu historial de ventas', done: false },
]

// Primera pantalla que ve el organizador cuando "Ventas del evento" todavía
// no tiene configuración válida/completa (ver isConcessionsSetupComplete en
// src/types/concessions.ts) — nada de Catálogo/Pedidos/Historial se muestra
// todavía, a propósito: el pedido explícito es no exponer funciones sin
// contexto antes de que el organizador entienda el flujo completo.
export function ConcessionsOnboarding({ event, isAdmin }: Props) {
  return (
    <div className="space-y-5">
      <div className="text-center max-w-sm mx-auto">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">¿Cómo funciona esto?</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Primero configura cómo van a funcionar tus ventas. Después vas a poder cargar productos, recibir pedidos y
          usar caja/preparación durante el evento.
        </p>
      </div>

      <ol className="space-y-1.5 max-w-sm mx-auto">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm ${
              i === 0
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            {i === 0 ? (
              <span className="w-5 h-5 rounded-full bg-primary text-white text-xs font-semibold inline-flex items-center justify-center shrink-0">1</span>
            ) : (
              <span className="w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600 text-xs inline-flex items-center justify-center shrink-0">{i + 1}</span>
            )}
            {step.title}
          </li>
        ))}
      </ol>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 max-w-sm mx-auto">
        <ConcessionSettingsPanel event={event} canManage isAdmin={isAdmin} />
      </div>

      <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1.5 max-w-sm mx-auto">
        <IconCheckCircle className="w-3.5 h-3.5 shrink-0" />
        Cuando termines de configurar, esta pantalla desaparece y aparecen Catálogo, Pedidos e Historial.
      </p>
    </div>
  )
}
