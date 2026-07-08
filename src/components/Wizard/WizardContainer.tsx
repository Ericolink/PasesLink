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

        <p className="text-sm font-medium text-primary">{stepLabels[currentStep - 1]}</p>
      </div>

      {/* Contenido del paso actual */}
      <div className="mb-8">{children}</div>

      {/* Navegación */}
      <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 pt-5">
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
            : currentStep === totalSteps
            ? 'Crear evento'
            : 'Siguiente →'}
        </button>
      </div>
    </div>
  )
}
