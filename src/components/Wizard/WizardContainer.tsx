import type { ReactNode } from 'react'
import { IconArrowLeft } from '../Icons'

interface WizardContainerProps {
  currentStep: number
  totalSteps: number
  stepLabels: string[]
  onNext: () => void
  onPrevious: () => void
  onCancel: () => void
  canProceed: boolean
  isSubmitting: boolean
  nextLabel?: string
  /** "Guardado 14:32" — indicador del autoguardado de borrador (ver useFormDraft). Ausente = todavía no se guardó nada en esta sesión. */
  savedLabel?: string
  children: ReactNode
}

export function WizardContainer({
  currentStep,
  totalSteps,
  stepLabels,
  onNext,
  onPrevious,
  onCancel,
  canProceed,
  isSubmitting,
  nextLabel,
  savedLabel,
  children,
}: WizardContainerProps) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 animate-fade-in">
      {/* Encabezado con progreso */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Crear evento</h1>
          <span className="text-sm text-gray-400">{currentStep} / {totalSteps}</span>
        </div>

        {/* Barra de progreso segmentada */}
        <div className="flex gap-1.5 mb-2">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i + 1 <= currentStep ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-primary">{stepLabels[currentStep - 1]}</p>
          {savedLabel && <p className="text-xs text-gray-400">{savedLabel}</p>}
        </div>
      </div>

      {/* Contenido del paso actual — padding inferior extra para que la
          navegación fija (ver más abajo) no tape el final de pasos largos
          (ej. StepInvitationMethod con varios campos de pago). */}
      <div className="mb-8 pb-24 sm:pb-8">{children}</div>

      {/* Navegación — fija al pie del viewport en mobile (antes vivía en el
          flujo normal, así que en pasos largos había que scrollear hasta el
          final para encontrar "Siguiente"). AppShell monta esta pantalla en
          mode="focus" (sin BottomTabBar, ver AppShell.tsx), así que no hay
          otra barra inferior con la que pueda chocar. En sm+ (desktop, sin
          necesidad de scroll para ver los botones) vuelve al flujo normal. */}
      <div className="fixed sm:static bottom-0 left-0 right-0 sm:left-auto sm:right-auto z-40 bg-white dark:bg-gray-900 sm:bg-transparent dark:sm:bg-transparent border-t border-gray-100 dark:border-gray-800 sm:border-t-0 px-4 sm:px-0 pt-3 sm:pt-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-0 max-w-2xl sm:max-w-none mx-auto">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onPrevious}
            disabled={currentStep === 1}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed hover:text-gray-700 dark:hover:text-gray-200 transition-colors py-2 px-1"
          >
            <IconArrowLeft className="w-4 h-4" />
            Atrás
          </button>

          <button
            type="button"
            onClick={onNext}
            disabled={!canProceed || isSubmitting}
            className="px-7 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            {isSubmitting
              ? 'Creando…'
              : nextLabel
              ? nextLabel
              : currentStep === totalSteps
              ? 'Crear evento'
              : 'Siguiente →'}
          </button>
        </div>
      </div>
    </div>
  )
}
