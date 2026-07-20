import { useState } from 'react'
import type { WallReply } from '../types'
import { AuthorName } from './AuthorName'

const OWNER_DISPLAY = 'Anfitrión'

// Auditoría de escalabilidad (F14): `replies` puede tener hasta 500 entradas
// (tope de firestore.rules, ver isValidWallReplyAppend) — mostrarlas TODAS
// siempre, sin colapsar, significaba montar hasta 500 nodos por card en un
// mensaje/foto muy comentado. Se muestran las más recientes primero (recorte
// desde el final del array) y el resto queda a un tap de distancia.
const INITIAL_REPLIES_SHOWN = 10

// Extraído del bloque de respuestas que antes vivía inline en EventWall.tsx
// (solo para mensajes de texto) — mismo render exacto, ahora reutilizado
// también por PhotoFeedCard.tsx para respuestas a fotos/historias.
export function RepliesList({ replies }: { replies: WallReply[] }) {
  const [expanded, setExpanded] = useState(false)
  if (replies.length === 0) return null

  const hidden = replies.length - INITIAL_REPLIES_SHOWN
  const visible = expanded || hidden <= 0 ? replies : replies.slice(hidden)

  return (
    <div className="border-l-2 border-gray-100 dark:border-gray-700 pl-3 mb-3 space-y-2 ml-9">
      {!expanded && hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs font-medium text-gray-400 hover:text-primary transition-colors"
        >
          Ver {hidden} respuesta{hidden === 1 ? '' : 's'} anterior{hidden === 1 ? '' : 'es'}
        </button>
      )}
      {visible.map((r) => (
        <div key={r.id}>
          <AuthorName name={r.authorName || OWNER_DISPLAY} role={r.authorRole} inline />
          <span className="text-xs text-gray-700 dark:text-gray-300 ml-1">{r.text}</span>
        </div>
      ))}
    </div>
  )
}
