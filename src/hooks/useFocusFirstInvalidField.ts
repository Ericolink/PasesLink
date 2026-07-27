import { useEffect } from 'react'
import type { RefObject } from 'react'

// Tras un submit fallido, mueve el foco al primer campo inválido (o, si no
// hay ninguno marcado por FormField, al primer role="alert" visible dentro
// del formulario — cubre errores de nivel de formulario que no están
// atados a un campo puntual). `trigger` es cualquier valor que cambie en
// cada intento de submit (ej. un contador, o el propio mensaje de error) —
// sin esto, un usuario de teclado/lector de pantalla no se entera de por
// qué "no pasó nada" tras enviar (el foco se queda en el botón de submit).
export function useFocusFirstInvalidField(containerRef: RefObject<HTMLElement | null>, trigger: unknown) {
  useEffect(() => {
    if (!trigger) return
    const container = containerRef.current
    if (!container) return
    const target = container.querySelector<HTMLElement>('[aria-invalid="true"]') || container.querySelector<HTMLElement>('[role="alert"]')
    target?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger])
}
