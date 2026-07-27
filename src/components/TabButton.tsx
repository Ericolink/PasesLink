// Botón de tab para usar dentro de <ScrollableTabs> — subrayado en vez de
// pill sólido, mismo lenguaje que Navbar.tsx. Extraído de AdminDashboard.tsx
// (única implementación con soporte dark completo) para que GuestAddForm.tsx
// deje de tener su propia variante pill sin dark mode (hallazgo H4 de la
// auditoría — los tabs inactivos quedaban ilegibles en oscuro).
export function TabButton({
  label,
  count,
  unreadCount,
  active,
  onClick,
}: {
  label: string
  count?: number
  unreadCount?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      // Activo = tonal pink, no solo el subrayado (Design Memory: "item
      // activo = tonal pink, no fill pleno") — bg-primary-subtle + radio
      // arriba, conservando el underline que ya usa el mismo lenguaje que
      // Navbar.tsx. text-primary ya resuelve a primary-ink en claro (ver
      // .text-primary en index.css), no hace falta tocarlo acá. El tonal
      // solo se agrega en CLARO: dark:bg-transparent restaura el activo sin
      // fondo que ya había en oscuro, para no tocar su apariencia.
      className={`shrink-0 whitespace-nowrap min-h-11 px-3 text-sm font-medium border-b-2 -mb-px rounded-t-md transition-colors ${
        active
          ? 'border-primary text-primary bg-primary-subtle dark:bg-transparent'
          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
      }`}
    >
      {label}
      {count !== undefined && <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">{count}</span>}
      {!!unreadCount && (
        <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-2xs font-bold leading-none">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}
