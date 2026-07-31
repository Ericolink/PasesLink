import { useEffect, useState } from 'react'
import { setConcessionItemAvailability, subscribeToConcessionsCatalog } from '../../../firebase/concessions'
import type { ConcessionItem } from '../../../types/concessions'
import { CONCESSIONS_CATEGORY_LABELS } from '../../../types/concessions'
import { LoadingInline } from '../../LoadingInline'
import { IconInbox } from '../../accessibility/AccessibleIcon'

interface Props {
  eventId: string
}

// Único poder del Menu Manager sobre el catálogo: marcar/desmarcar
// "agotado" a mano (ver RFC §11.4 — independiente del contador de stock,
// para el caso "se acabó el hielo aunque el sistema diga que quedan
// sodas"). Sin precio, sin edición de nombre/foto/stock — firestore.rules
// ya lo restringe del lado servidor (concessionsCatalog.update, rama de
// staff), esta pantalla ni siquiera ofrece esos campos.
export function ConcessionAvailabilityPanel({ eventId }: Props) {
  const [items, setItems] = useState<ConcessionItem[] | null>(null)
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    return subscribeToConcessionsCatalog(eventId, setItems, () => setError('No se pudo cargar el catálogo.'))
  }, [eventId])

  async function handleToggle(item: ConcessionItem) {
    setError('')
    setBusyItemId(item.id)
    try {
      await setConcessionItemAvailability(eventId, item.id, item.status === 'active' ? 'outOfStock' : 'active')
    } catch {
      setError('No se pudo actualizar la disponibilidad. Intenta de nuevo.')
    } finally {
      setBusyItemId(null)
    }
  }

  if (items === null) return <LoadingInline label="Cargando catálogo…" />

  const visibleItems = items.filter((i) => i.status !== 'archived')

  if (visibleItems.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <IconInbox className="w-8 h-8 mx-auto mb-2" />
        <p className="text-sm">Todavía no hay productos en el catálogo.</p>
      </div>
    )
  }

  return (
    <div>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      <div className="space-y-2">
        {visibleItems.map((item) => (
          <label
            key={item.id}
            className="flex items-center justify-between gap-3 px-3.5 py-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 cursor-pointer"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{CONCESSIONS_CATEGORY_LABELS[item.category]}</p>
            </div>
            <span className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-gray-500 dark:text-gray-400">Agotado</span>
              <input
                type="checkbox"
                checked={item.status === 'outOfStock'}
                disabled={busyItemId === item.id}
                onChange={() => handleToggle(item)}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary focus:ring-offset-0"
              />
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
