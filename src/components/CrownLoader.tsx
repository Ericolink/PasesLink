// Animación de carga de marca — reemplaza el spinner genérico solo en
// pantallas de "carga de app completa" (login, rutas admin, ingreso de
// invitado por QR/link). Las cargas puntuales de una sección (listas,
// tablas) siguen usando LoadingInline a propósito: convertir un
// parpadeo de 200ms en una animación de marca sería más ruido que
// identidad.
export function CrownLoader({
  label = 'Cargando…',
  className = 'min-h-dvh',
}: {
  label?: string
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`} role="status">
      <img src="/logo-crown.png" alt="" className="crown-loader-icon w-14 h-auto" />
      <span className="text-sm text-gray-400 dark:text-gray-500">{label}</span>
    </div>
  )
}
