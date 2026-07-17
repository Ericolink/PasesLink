import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Modal } from './Modal'
import { DialogFooter } from './DialogFooter'
import { Button } from './Button'

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
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Foco intencional en "Confirmar" (no en "Cancelar", que aparece primero
  // en el DOM). Este efecto vive en el padre de <Modal>, así que corre
  // DESPUÉS del useModalA11y interno de Modal (los efectos de hijos corren
  // antes que los del padre en el mismo commit) — el resultado es el mismo
  // que antes: el fallback del hook enfoca "Cancelar" por un instante sin
  // pintar, y este efecto le roba el foco a "Confirmar" en el mismo commit.
  useEffect(() => {
    if (open) confirmRef.current?.focus()
  }, [open])

  return (
    <Modal open={open} onClose={onCancel} label={title}>
      {/* Header + mensaje son la única región que scrollea — el mensaje
          puede ser largo (p.ej. la lista de cambios del "modo anti-tontos"
          de EditEventForm.tsx) y sin esto el diálogo simplemente se
          recortaba contra el viewport, dejando los botones inalcanzables. */}
      <div className="overflow-y-auto">
        {danger && (
          <div className="flex items-center justify-center pt-6 pb-2">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
          </div>
        )}
        <div className="px-6 pt-4 pb-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{title}</h2>
          <div className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{message}</div>
        </div>
      </div>
      {/* gap-4 (en vez del gap-3 del footer por defecto): separación extra
          pensada para reducir el riesgo de tocar el botón equivocado en una
          acción destructiva. */}
      <DialogFooter className="gap-4">
        <Button variant="secondary" onClick={onCancel} className="flex-1">
          {cancelLabel}
        </Button>
        <Button ref={confirmRef} variant={danger ? 'danger' : 'primary'} onClick={onConfirm} className="flex-1">
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Modal>
  )
}
