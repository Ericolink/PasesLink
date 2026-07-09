import type { WallReply } from '../types'
import { AuthorName } from './AuthorName'

const OWNER_DISPLAY = 'Anfitrión'

// Extraído del bloque de respuestas que antes vivía inline en EventWall.tsx
// (solo para mensajes de texto) — mismo render exacto, ahora reutilizado
// también por PhotoFeedCard.tsx para respuestas a fotos/historias.
export function RepliesList({ replies }: { replies: WallReply[] }) {
  if (replies.length === 0) return null
  return (
    <div className="border-l-2 border-gray-100 dark:border-gray-700 pl-3 mb-3 space-y-2 ml-9">
      {replies.map((r) => (
        <div key={r.id}>
          <AuthorName name={r.authorName || OWNER_DISPLAY} role={r.authorRole} inline />
          <span className="text-xs text-gray-700 dark:text-gray-300 ml-1">{r.text}</span>
        </div>
      ))}
    </div>
  )
}
