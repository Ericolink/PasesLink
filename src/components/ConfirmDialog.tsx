import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AccessibleModal } from './accessibility/AccessibleModal'
import { DialogFooter } from './DialogFooter'
import { AccessibleButton } from './accessibility/AccessibleButton'

interface Props {
  open: boolean
  title: string
  // ReactNode (no solo string) para permitir mensajes compuestos, p.ej. la
  // lista de cambios del "modo anti-tontos" de EditEventForm.tsx — todo
  // caller existente que ya pasaba un string sigue siendo válido sin tocarlo.
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  // Mismo patrón que GitHub para borrar un repositorio: si se pasa, el botón
  // de confirmar queda deshabilitado hasta que se escriba EXACTAMENTE este
  // texto (case-sensitive a propósito — "Eliminar EVENTO" vs "eliminar
  // evento" no deberían confundirse entre sí). Pensado para la acción más
  // irreversible del panel de administración del evento (eliminar evento
  // definitivamente); cualquier otro ConfirmDialog puede sumarlo si necesita
  // el mismo nivel de fricción.
  confirmationText?: string
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  onConfirm,
  onCancel,
  confirmationText,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const typedInputRef = useRef<HTMLInputElement>(null)
  const [typedText, setTypedText] = useState('')
  const requiresTypedConfirmation = confirmationText !== undefined
  const canConfirm = !requiresTypedConfirmation || typedText === confirmationText

  // Foco intencional en "Confirmar" (no en "Cancelar", que aparece primero
  // en el DOM) — salvo que haya que escribir un texto antes: ahí el foco va
  // al input, porque el botón "Confirmar" arranca deshabilitado y no tiene
  // sentido enfocar un control inerte. Este efecto vive en el padre de
  // <AccessibleModal>, así que corre DESPUÉS del useAccessibleModal interno
  // de AccessibleModal (los efectos de hijos corren antes que los del padre
  // en el mismo commit) — el resultado es el mismo que antes: el fallback
  // del hook enfoca "Cancelar" por un instante sin pintar, y este efecto le
  // roba el foco al control correcto en el mismo commit.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      // Limpia el texto tecleado al cerrarse (cancelar, ESC, confirmar) —
      // sin esto, reabrir el mismo diálogo (ej. el organizador cancela y
      // vuelve a intentar) arrancaría con la confirmación ya "desbloqueada"
      // de la vez anterior, justo lo que este control busca evitar.
      setTypedText('')
      return
    }
    if (requiresTypedConfirmation) typedInputRef.current?.focus()
    else confirmRef.current?.focus()
  }, [open, requiresTypedConfirmation])
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <AccessibleModal open={open} onClose={onCancel} label={title} role={danger ? 'alertdialog' : 'dialog'}>
      {/* Header + mensaje son la única región que scrollea — el mensaje
          puede ser largo (p.ej. la lista de cambios del "modo anti-tontos"
          de EditEventForm.tsx) y sin esto el diálogo simplemente se
          recortaba contra el viewport, dejando los botones inalcanzables. */}
      <div className="overflow-y-auto">
        {danger && (
          <div className="flex items-center justify-center pt-6 pb-2">
            {/* dark:bg-red-900/30 — antes sin variante oscura, quedaba un
                círculo rojo claro sobre fondo oscuro. Mismo idiom que ya usa
                AccessibleButton.tsx variant="danger-outline". */}
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
          </div>
        )}
        <div className="px-6 pt-4 pb-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{title}</h2>
          <div className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{message}</div>
        </div>
        {requiresTypedConfirmation && (
          <div className="px-6 pb-2">
            <label htmlFor="confirm-dialog-typed-text" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Para confirmar, escribe <span className="font-mono font-semibold text-gray-900 dark:text-white break-all">{confirmationText}</span>
            </label>
            <input
              ref={typedInputRef}
              id="confirm-dialog-typed-text"
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        )}
      </div>
      {/* gap-4 (en vez del gap-3 del footer por defecto): separación extra
          pensada para reducir el riesgo de tocar el botón equivocado en una
          acción destructiva. */}
      <DialogFooter className="gap-4">
        <AccessibleButton variant="secondary" onClick={onCancel} className="flex-1">
          {cancelLabel}
        </AccessibleButton>
        <AccessibleButton
          ref={confirmRef}
          variant={danger ? 'danger' : 'primary'}
          onClick={onConfirm}
          disabled={!canConfirm}
          className="flex-1"
        >
          {confirmLabel}
        </AccessibleButton>
      </DialogFooter>
    </AccessibleModal>
  )
}
