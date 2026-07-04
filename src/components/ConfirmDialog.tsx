import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useModalA11y } from '../hooks/useModalA11y'

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
  // en el DOM). Se declara ANTES de useModalA11y a propósito: los efectos
  // corren en orden de declaración, así este foco explícito ya está puesto
  // cuando el hook revisa si hace falta su fallback (focar el primer
  // elemento enfocable) — evitando que el hook enfoque "Cancelar" primero.
  useEffect(() => {
    if (open) confirmRef.current?.focus()
  }, [open])

  const dialogRef = useModalA11y<HTMLDivElement>(open, onCancel)

  if (!open) return null

  // Portal a document.body: ver el comentario equivalente en WelcomeModal.tsx
  // — anidado bajo <main>, este overlay podía quedar por debajo del <Footer>
  // (hermano posterior fuera de ese árbol) en navegadores donde position:fixed
  // + backdrop-filter interactúan mal con el contexto de apilamiento.
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 pb-[env(safe-area-inset-bottom)] sm:pb-0 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm animate-bounce-in"
      >
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
        <div className="flex gap-3 p-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6">
          <button
            onClick={onCancel}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-xl py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`flex-1 rounded-xl py-3 text-sm font-medium text-white transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-dark'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
