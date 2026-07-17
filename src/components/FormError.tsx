// Caja con fondo para errores de formulario completo (servidor/red) — a
// diferencia de FieldError (texto plano bajo un campo puntual), esta se usa
// cuando el fallo no es de un input específico. Estilo ya mayoritario en el
// código (AdminDashboard, Feedback, EventWall, AdminReportsTab). El texto
// usa el token semántico text-error; el fondo/borde quedan en los tintes
// red-50/red-900 de Tailwind porque el sistema de tokens del PR 01 solo
// define un valor por color semántico, sin variantes claras/oscuras de tinte.
export function FormError({ message, className = '' }: { message?: string | null; className?: string }) {
  if (!message) return null
  return (
    <p className={`text-sm text-error bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-3 py-2 ${className}`}>
      {message}
    </p>
  )
}
