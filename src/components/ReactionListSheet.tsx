import { useMemo, useState } from 'react'
import { Avatar } from './Avatar'
import { REACTIONS, REACTION_BY_TYPE } from '../utils/reactions'
import type { ReactionType, WallReaction } from '../types'
import { Modal } from './Modal'
import { DialogHeader } from './DialogHeader'

interface Props {
  reactions: Record<string, WallReaction>
  onClose: () => void
}

// Bottom sheet "quién reaccionó" — mismo esqueleto que GuestSearchSheet.tsx
// (Modal compartido, ver PR de consolidación de overlays). Recibe el mapa
// `reactions` tal cual vive en el doc del mensaje/foto: no dispara ninguna
// consulta propia, así que si el padre lo tiene vivo por un listener
// (EventWall) los cambios (nueva reacción, reacción retirada) se reflejan
// acá solos mientras el sheet está abierto.
export function ReactionListSheet({ reactions, onClose }: Props) {
  const [tab, setTab] = useState<ReactionType | 'all'>('all')

  const { total, byType, sorted } = useMemo(() => {
    const entries = Object.entries(reactions)
    const byType = new Map<ReactionType, number>()
    for (const [, r] of entries) byType.set(r.type, (byType.get(r.type) || 0) + 1)

    // Más recientes primero (mejor señal social — igual que otras redes):
    // entradas sin `reactedAt` (reacciones hechas antes de que ese campo
    // existiera) quedan al final, ordenadas por nombre para que no salten de
    // posición en cada re-render.
    const filtered = tab === 'all' ? entries : entries.filter(([, r]) => r.type === tab)
    const sorted = filtered.sort(([, a], [, b]) => {
      if (a.reactedAt != null && b.reactedAt != null) return b.reactedAt - a.reactedAt
      if (a.reactedAt != null) return -1
      if (b.reactedAt != null) return 1
      return (a.name || '').localeCompare(b.name || '')
    })
    return { total: entries.length, byType, sorted }
  }, [reactions, tab])

  const typesPresent = REACTIONS.filter((r) => byType.has(r.type))

  return (
    <Modal open onClose={onClose} label="Personas que reaccionaron">
      <DialogHeader title={`Reacciones (${total})`} onClose={onClose} />

      {typesPresent.length > 1 && (
        <div className="flex items-center gap-1.5 px-5 pt-3 pb-3 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setTab('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border shrink-0 transition-colors ${
              tab === 'all'
                ? 'bg-primary border-primary text-white'
                : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'
            }`}
          >
            Todas {total}
          </button>
          {typesPresent.map((r) => (
            <button
              key={r.type}
              type="button"
              onClick={() => setTab(r.type)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border shrink-0 transition-colors ${
                tab === r.type
                  ? 'bg-primary border-primary text-white'
                  : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'
              }`}
            >
              {r.emoji} {byType.get(r.type)}
            </button>
          ))}
        </div>
      )}

      <ul className="overflow-y-auto px-5 pb-5 pt-3 flex-1">
        {sorted.length === 0 && (
          <li className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">Sin reacciones</li>
        )}
        {sorted.map(([token, r]) => {
          const emoji = REACTION_BY_TYPE.get(r.type)?.emoji
          const name = r.name || 'Invitado'
          return (
            <li key={token} className="flex items-center gap-3 py-2.5">
              <Avatar name={name} photoURL={r.photoURL} size={36} />
              <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">{name}</span>
              {emoji && <span aria-hidden="true" className="text-lg shrink-0">{emoji}</span>}
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
