import { IconCrown } from './Icons'

// Extraído de EventWall.tsx (donde vivía como función local no exportada) —
// mismo render exacto, ahora compartido con PhotoFeedCard.tsx y cualquier
// otro lugar del muro que necesite mostrar un nombre de autor destacando al
// organizador.
export function AuthorName({
  name,
  role,
  inline = false,
}: {
  name: string
  role: 'owner' | 'guest'
  inline?: boolean
}) {
  if (role !== 'owner') {
    return <span className={`text-xs font-semibold text-gray-700 dark:text-gray-300 ${inline ? 'inline' : ''}`}>{name}</span>
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-bold ${inline ? '' : ''}`}
      style={{
        color: '#E8B84B',
        textShadow: '0 0 8px rgba(232,184,75,.8), 0 0 16px rgba(232,184,75,.4)',
      }}
    >
      <IconCrown className="w-3 h-3" />
      {name}
    </span>
  )
}
