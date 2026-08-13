// Piezas visuales compartidas por las hojas de detalle/acciones de la lista
// de invitados (GuestDetailSheet.tsx) y de la lista de espera
// (WaitlistEntryDetailSheet.tsx) — extraídas para que ambas se vean/comporten
// idénticas sin duplicar las clases.
export function Pill({ tone, icon, children }: { tone: 'amber' | 'green' | 'gray' | 'red' | 'blue' | 'violet'; icon?: React.ReactNode; children: React.ReactNode }) {
  const classes: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    green: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    gray: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300',
    red: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${classes[tone]}`}>
      {icon}
      {children}
    </span>
  )
}

export function ActionButton({
  tone = 'default',
  icon,
  onClick,
  disabled = false,
  children,
}: {
  tone?: 'default' | 'subtle' | 'danger'
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'subtle'
        ? 'text-gray-500 dark:text-gray-400 font-medium'
        : 'text-gray-900 dark:text-white'
  const iconWrapClass =
    tone === 'danger'
      ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
      : tone === 'subtle'
        ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
        : 'bg-primary/10 text-primary'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-semibold text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:pointer-events-none ${toneClass}`}
    >
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconWrapClass}`}>{icon}</span>
      {children}
    </button>
  )
}
