import { useState } from 'react'

interface UseAccountConfirmGateResult {
  gateOpen: boolean
  requestConfirm: (action: () => void | Promise<void>) => void
  resolve: () => void
  cancel: () => void
}

// Envuelve una acción de escritura (confirmar RSVP, registrarse) detrás de
// la decisión de cuenta (crear / iniciar sesión / continuar sin cuenta)
// cuando el invitado todavía no tiene sesión — ver GuestSignupPrompt
// (gateMode) y el rediseño de invitación de Fiesta Improvisada. Un invitado
// ya logueado nunca ve el gate: `requestConfirm` ejecuta la acción de una,
// igual que el comportamiento de siempre (nunca lo interrumpe).
export function useAccountConfirmGate(hasAccount: boolean): UseAccountConfirmGateResult {
  const [pendingAction, setPendingAction] = useState<(() => void | Promise<void>) | null>(null)

  function requestConfirm(action: () => void | Promise<void>) {
    if (hasAccount) {
      void action()
      return
    }
    setPendingAction(() => action)
  }

  function resolve() {
    const action = pendingAction
    setPendingAction(null)
    if (action) void action()
  }

  function cancel() {
    setPendingAction(null)
  }

  return { gateOpen: pendingAction !== null, requestConfirm, resolve, cancel }
}
