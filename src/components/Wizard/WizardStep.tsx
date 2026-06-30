import type { ReactNode } from 'react'

interface WizardStepProps {
  number: number
  currentStep: number
  children: ReactNode
}

export function WizardStep({ number, currentStep, children }: WizardStepProps) {
  if (number !== currentStep) return null
  // key en el padre (WizardContainer renderiza distinto número cada vez)
  // hace que este div se re-monte en cada cambio de paso → la animación re-dispara.
  return <div className="animate-fade-in-up">{children}</div>
}
