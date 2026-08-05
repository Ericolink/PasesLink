import { useState, type ChangeEvent, type FocusEvent, type MouseEvent } from 'react'

// Un <input type="number"> controlado por un valor `number` falla al editar
// en mobile: la Selection API (seleccionar todo el contenido al enfocar,
// para que escribir reemplace en vez de insertar) no está definida por el
// estándar HTML para type="number" — solo aplica a type="text"/"tel"/etc.
// Por eso ".select()" no tiene efecto confiable ahí, y escribir "5" sobre
// un "1" termina insertando el dígito donde cayó el cursor ("51") en vez
// de reemplazarlo. La solución es tratarlo como texto con teclado numérico
// (inputMode="numeric") y separar el string crudo que el usuario está
// tipeando del valor numérico ya validado — así se puede dejar vacío
// mientras se edita, sin forzar un mínimo en cada tecla.
//
// `value` es `null` mientras el texto esté vacío o fuera de [min, max] —
// el caller lo usa para bloquear el envío hasta que haya un número válido,
// en vez de que el campo se autocomplete con un valor que el organizador
// no eligió. `clampOnBlur` (default true) sí normaliza al perder el foco —
// útil para edición, donde siempre debe quedar un número concreto; se
// desactiva en altas donde el campo debe poder quedar vacío hasta que el
// organizador escriba algo.
export function useIntegerFieldInput(
  initialValue: number | null,
  min: number,
  max: number,
  options: { clampOnBlur?: boolean } = {},
) {
  const { clampOnBlur = true } = options
  const clamp = (n: number) => Math.max(min, Math.min(max, n))
  const [text, setText] = useState(initialValue === null ? '' : String(clamp(initialValue)))

  const parsed = text === '' ? null : Number(text)
  const value = parsed !== null && parsed >= min && parsed <= max ? parsed : null

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    setText(e.target.value.replace(/\D/g, ''))
  }

  function onBlur() {
    if (!clampOnBlur) return
    setText((prev) => (prev === '' ? String(min) : String(clamp(Number(prev)))))
  }

  function selectAll(e: FocusEvent<HTMLInputElement> | MouseEvent<HTMLInputElement>) {
    const input = e.currentTarget
    // iOS Safari: llamar a .select() de forma síncrona dentro del propio
    // evento "focus" a veces no selecciona nada (bug conocido de WebKit);
    // diferirlo un frame lo hace confiable también ahí.
    requestAnimationFrame(() => input.select())
  }

  function reset(n: number | null) {
    setText(n === null ? '' : String(clamp(n)))
  }

  return { value, text, onChange, onBlur, onFocus: selectAll, onClick: selectAll, reset }
}
