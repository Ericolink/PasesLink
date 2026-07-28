import type { GuestSegmentTag } from '../types'

interface Props {
  tags: GuestSegmentTag[]
  selected: string[]
  onChange: (ids: string[]) => void
  emptyHint?: string
}

// Selector de chips reutilizable para "a qué segmentos aplica esto" — usado
// por SectionsEditor (visibilidad de secciones) y GuestEditModal/GuestList
// (asignar tags a un invitado). Sin selected.length > 0 significa "sin
// restricción" en el llamador (ver SectionVisibilityRule), no "oculto para
// todos" — este componente no conoce esa semántica, solo refleja el array.
export function TagMultiSelect({ tags, selected, onChange, emptyHint }: Props) {
  if (tags.length === 0) {
    return <p className="text-xs text-gray-400">{emptyHint || 'Todavía no definiste segmentos de invitado.'}</p>
  }

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id])
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => {
        const active = selected.includes(tag.id)
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => toggle(tag.id)}
            aria-pressed={active}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
            }`}
            style={active && tag.color ? { borderColor: tag.color, color: tag.color, backgroundColor: `${tag.color}1a` } : undefined}
          >
            {tag.label}
          </button>
        )
      })}
    </div>
  )
}
