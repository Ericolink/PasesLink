import type { GuestSegmentTag } from '../types'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { useReorderableList } from '../hooks/useReorderableList'

const LABEL_MAX = 40
const MAX_TAGS = 20

// Paleta acotada (no un color picker libre) — mismo criterio que
// SECONDARY_FONT_OPTIONS en registry.ts: suficiente variedad para
// distinguir segmentos a simple vista sin volverse una configuración
// arbitraria.
const TAG_COLORS = ['#2563eb', '#c1501e', '#916e30', '#0e7490', '#7c3aed', '#be123c']

interface Props {
  tags: GuestSegmentTag[]
  onChange: (tags: GuestSegmentTag[]) => void
}

// Catálogo de segmentos del evento (Feature 1: visibilidad de secciones por
// tipo de invitado) — define QUÉ segmentos existen; asignarlos a un
// invitado puntual se hace desde GuestEditModal/GuestList (ver
// bulkSetGuestTags en firebase/guests.ts), no acá.
export function GuestTagsEditor({ tags, onChange }: Props) {
  const list = useReorderableList<GuestSegmentTag>(tags, onChange, { max: MAX_TAGS })

  return (
    <div className="space-y-2">
      {tags.length === 0 && (
        <p className="text-xs text-gray-400">
          Sin segmentos aún. Agrega uno (ej. "VIP", "Familia") para poder mostrar secciones exclusivas a ese grupo.
        </p>
      )}
      {tags.map((tag, index) => (
        <div key={tag.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
          <input
            type="color"
            value={tag.color || TAG_COLORS[index % TAG_COLORS.length]}
            onChange={(e) => list.update(tag.id, { color: e.target.value })}
            className="h-8 w-8 shrink-0 border border-gray-300 rounded-md cursor-pointer"
            aria-label={`Color del segmento ${tag.label || index + 1}`}
          />
          <input
            type="text"
            value={tag.label}
            maxLength={LABEL_MAX}
            onChange={(e) => list.update(tag.id, { label: e.target.value })}
            placeholder="Nombre del segmento (ej: VIP)"
            aria-label={`Nombre del segmento ${index + 1}`}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800"
          />
          <AccessibleButton
            iconOnly
            variant="text"
            onClick={() => list.remove(tag.id)}
            aria-label={`Quitar segmento ${index + 1}`}
            className="text-gray-400 hover:text-red-500 text-lg leading-none shrink-0"
          >
            ×
          </AccessibleButton>
        </div>
      ))}
      {list.canAdd && (
        <button
          type="button"
          onClick={() => list.add({ id: crypto.randomUUID(), label: '', color: TAG_COLORS[tags.length % TAG_COLORS.length] })}
          className="text-sm text-primary font-medium hover:underline"
        >
          + Agregar segmento
        </button>
      )}
    </div>
  )
}
