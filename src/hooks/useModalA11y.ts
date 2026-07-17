import { useEffect, useRef } from 'react'
import { useScrollLock } from './useScrollLock'

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

// Accesibilidad compartida para los modales del proyecto: focus trap (Tab
// cíclico dentro del modal), Escape cierra, devolución de foco al elemento
// que lo tenía antes de abrir, y bloqueo de scroll del fondo (useScrollLock)
// mientras está abierto — así ningún modal nuevo puede "olvidarse" de sumar
// el scroll-lock por separado. Deliberadamente NO fuerza un foco inicial
// propio si el modal ya enfocó algo por su cuenta (ej. `autoFocus` en un
// input, o un ref específico como el botón de confirmar en ConfirmDialog) —
// solo entra como respaldo si nada dentro del modal tiene foco todavía, así
// no compite con comportamiento de foco ya intencional en cada modal.
//
// `open` puede pasarse como `true` fijo en modales que el padre monta/
// desmonta condicionalmente (en vez de mantenerlos montados con un flag
// `open` interno) — el montaje ya equivale a "abierto".
export function useModalA11y<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const dialogRef = useRef<T>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  useScrollLock(open)

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    previousActiveElement.current = document.activeElement as HTMLElement | null

    if (dialog && !dialog.contains(document.activeElement)) {
      dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus()
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialog) return
      const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousActiveElement.current?.focus()
    }
  }, [open, onClose])

  return dialogRef
}
