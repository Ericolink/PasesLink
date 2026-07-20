import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase/config'
import { Avatar } from './Avatar'
import { REACTIONS, REACTION_BY_TYPE } from '../utils/reactions'
import type { InteractiveCollection } from '../firebase/interactions'
import type { ReactionType, WallReaction } from '../types'
import { Modal } from './Modal'
import { DialogHeader } from './DialogHeader'

// Auditoría de escalabilidad (F14): tope duro de lectura — sin esto, un post
// viral con miles de reacciones (justo el escenario que la subcolección de
// F2/F11 dejó de bloquear del lado de la escritura) pagaba un getDocs() sin
// límite y renderizaba una fila de <li> por cada una. 300 alcanza para
// mostrar "quién reaccionó" en la enorme mayoría de los casos reales; para
// el resto, se avisa que la lista está truncada en vez de fingir que es
// completa.
const REACTION_LIST_PAGE_SIZE = 300

interface Props {
  eventId: string
  collectionName: InteractiveCollection
  docId: string
  // Ambos denormalizados (reactionCount/reactionCountsByType), ya
  // disponibles en el padre sin esperar este fetch — el total se muestra de
  // inmediato en el título, y los conteos por tipo (badges de las pestañas)
  // quedan siempre correctos aunque la lista de abajo esté truncada.
  total: number
  countsByType: Partial<Record<ReactionType, number>>
  onClose: () => void
}

// Bottom sheet "quién reaccionó". Auditoría F2/F11: antes recibía el mapa
// `reactions` completo, ya en memoria (gratis, parte del mismo snapshot del
// mensaje/foto) — ahora que la fuente de verdad es la subcolección
// events/{eventId}/{wall|photos}/{docId}/reactions (un doc por reactor, sin
// tope de tamaño), esta hoja pide su propia página de datos AL ABRIRSE, con
// un único `getDocs` (no un listener: es contenido bajo demanda, el usuario
// recién tocó el contador). Mientras carga, el título ya muestra `total`
// (denormalizado, sin esperar la red).
export function ReactionListSheet({ eventId, collectionName, docId, total, countsByType, onClose }: Props) {
  const [tab, setTab] = useState<ReactionType | 'all'>('all')
  const [entries, setEntries] = useState<[string, WallReaction][] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    const q = query(
      collection(db, 'events', eventId, collectionName, docId, 'reactions'),
      orderBy('reactedAt', 'desc'),
      limit(REACTION_LIST_PAGE_SIZE),
    )
    getDocs(q)
      .then((snap) => {
        if (cancelled) return
        setEntries(snap.docs.map((d) => [d.id, d.data() as WallReaction]))
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [eventId, collectionName, docId])

  const sorted = useMemo(() => {
    const list = entries || []
    return tab === 'all' ? list : list.filter(([, r]) => r.type === tab)
  }, [entries, tab])

  const typesPresent = REACTIONS.filter((r) => (countsByType[r.type] || 0) > 0)
  const truncated = entries !== null && entries.length >= REACTION_LIST_PAGE_SIZE && entries.length < total

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
              {r.emoji} {countsByType[r.type]}
            </button>
          ))}
        </div>
      )}

      <ul className="overflow-y-auto px-5 pb-5 pt-3 flex-1">
        {entries === null && !error && (
          <li className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">Cargando…</li>
        )}
        {error && (
          <li className="text-sm text-red-500 text-center py-6">No se pudo cargar la lista. Intenta de nuevo.</li>
        )}
        {entries !== null && sorted.length === 0 && (
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
        {truncated && (
          <li className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">
            Mostrando las primeras {REACTION_LIST_PAGE_SIZE} personas de {total}.
          </li>
        )}
      </ul>
    </Modal>
  )
}
