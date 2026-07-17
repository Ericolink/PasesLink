// Generalización de AuthErrorMessage para cualquier error de campo/formulario
// que no necesite el link de acción (info.actionTo/actionLabel) — mismo tono
// (text-sm text-error, el token semántico del PR 01) para que un error se
// vea igual en toda la app, reemplazando los `text-xs text-red-500` sueltos
// repartidos por el código.
export function FieldError({ message, className = '' }: { message?: string | null; className?: string }) {
  if (!message) return null
  return <p className={`text-sm text-error ${className}`}>{message}</p>
}
