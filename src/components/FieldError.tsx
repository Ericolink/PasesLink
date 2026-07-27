// Generalización de AuthErrorMessage para cualquier error de campo/formulario
// que no necesite el link de acción (info.actionTo/actionLabel) — mismo tono
// (text-sm text-error, el token semántico del PR 01) para que un error se
// vea igual en toda la app, reemplazando los `text-xs text-red-500` sueltos
// repartidos por el código.
//
// `id` + `role="alert"`: sin esto, ningún llamador puede enlazar el mensaje a
// su campo vía `aria-describedby`, y un lector de pantalla nunca se entera de
// que apareció un error de validación (no hay ningún cambio de foco que lo
// dispare a leerlo por su cuenta).
//
// `tabIndex={-1}`: un <p> no es focuseable por default — sin esto,
// useFocusFirstInvalidField no podría mover el foco acá como respaldo cuando
// el error es de nivel de formulario (no hay un campo puntual inválido que
// marcar con aria-invalid).
export function FieldError({ message, id, className = '' }: { message?: string | null; id?: string; className?: string }) {
  if (!message) return null
  return <p id={id} role="alert" tabIndex={-1} className={`text-sm text-error ${className}`}>{message}</p>
}
