import { useEffect, useRef } from 'react'
import type { TextareaHTMLAttributes } from 'react'

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  // Alturas en px, no en `rows` — el auto-resize mide `scrollHeight` real
  // del contenido, así que pedir un número de líneas de antemano no
  // encajaría con fuentes/anchos distintos entre callers.
  minHeight?: number
  maxHeight?: number
}

// Textarea que crece verticalmente con el contenido, sin que el usuario
// pueda redimensionarlo a mano (`resize-none`) — pedido explícito: el campo
// de descripción de un producto (y las instrucciones de pago/recolección de
// ConcessionSettingsPanel) no deben depender del asa nativa del navegador.
// Con altura mínima/máxima fijas y scroll interno una vez alcanzado el
// máximo. Sigue siendo un textarea controlado normal — `value`/`onChange`
// vienen del caller, esto solo le agrega el efecto de altura.
export function AutoResizeTextarea({ minHeight = 76, maxHeight = 240, className = '', style, value, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, minHeight), maxHeight)}px`
  }, [value, minHeight, maxHeight])

  return (
    <textarea
      ref={ref}
      value={value}
      className={`resize-none overflow-y-auto ${className}`}
      style={{ minHeight, maxHeight, ...style }}
      {...rest}
    />
  )
}
