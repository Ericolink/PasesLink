import type { EventData, GuestSegmentTag, VisibilitySection } from '../types'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { useReorderableList } from '../hooks/useReorderableList'
import { TagMultiSelect } from './TagMultiSelect'

const TITLE_MAX = 60
const BODY_MAX = 1000
const MAX_SECTIONS = 10

type BuiltinSectionKey = keyof NonNullable<EventData['sectionVisibility']>

const BUILTIN_SECTIONS: { key: BuiltinSectionKey; label: string }[] = [
  { key: 'timeline', label: 'Programa del evento' },
  { key: 'welcomeMessage', label: 'Mensaje de bienvenida' },
  { key: 'map', label: 'Mapa y clima' },
  { key: 'transport', label: 'Cómo llegar' },
  { key: 'faq', label: 'Preguntas frecuentes' },
]

interface Props {
  guestTags: GuestSegmentTag[]
  sections: VisibilitySection[]
  onChangeSections: (sections: VisibilitySection[]) => void
  sectionVisibility: EventData['sectionVisibility']
  onChangeSectionVisibility: (value: EventData['sectionVisibility']) => void
}

// Editor de secciones nuevas y libres (After Party, Cena VIP, Hospedaje...)
// + visibilidad de las secciones YA existentes del evento — mismo patrón
// visual que FaqEditor.tsx (useReorderableList, "+ Agregar"). El gating por
// segmento reusa TagMultiSelect contra EventData.guestTags; sin segmentos
// definidos, cada sección queda visible para todos (sin controles extra que
// mostrar) — ver TagMultiSelect.emptyHint.
export function SectionsEditor({ guestTags, sections, onChangeSections, sectionVisibility, onChangeSectionVisibility }: Props) {
  const list = useReorderableList<VisibilitySection>(sections, onChangeSections, { max: MAX_SECTIONS })

  function setBuiltinVisibility(key: BuiltinSectionKey, tags: string[]) {
    const next = { ...(sectionVisibility || {}) }
    if (tags.length === 0) {
      delete next[key]
    } else {
      next[key] = { tags }
    }
    onChangeSectionVisibility(Object.keys(next).length > 0 ? next : undefined)
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Secciones nuevas</p>
        {sections.length === 0 && (
          <p className="text-xs text-gray-400">
            Sin secciones nuevas aún. Agrega una para mostrar contenido exclusivo (After Party, Cena VIP, Hospedaje) a un segmento de invitados.
          </p>
        )}
        {sections.map((section, index) => (
          <div key={section.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={section.title}
                maxLength={TITLE_MAX}
                onChange={(e) => list.update(section.id, { title: e.target.value })}
                placeholder="Título (ej: After Party)"
                aria-label={`Título de sección ${index + 1}`}
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800"
              />
              <AccessibleButton
                iconOnly
                variant="text"
                onClick={() => list.moveUp(section.id)}
                disabled={index === 0}
                aria-label={`Subir sección ${index + 1}`}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-30 shrink-0"
              >
                ▲
              </AccessibleButton>
              <AccessibleButton
                iconOnly
                variant="text"
                onClick={() => list.moveDown(section.id)}
                disabled={index === sections.length - 1}
                aria-label={`Bajar sección ${index + 1}`}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-30 shrink-0"
              >
                ▼
              </AccessibleButton>
              <AccessibleButton
                iconOnly
                variant="text"
                onClick={() => list.remove(section.id)}
                aria-label={`Quitar sección ${index + 1}`}
                className="text-gray-400 hover:text-red-500 text-lg leading-none shrink-0"
              >
                ×
              </AccessibleButton>
            </div>
            <textarea
              value={section.body || ''}
              maxLength={BODY_MAX}
              onChange={(e) => list.update(section.id, { body: e.target.value })}
              placeholder="Contenido"
              aria-label={`Contenido de sección ${index + 1}`}
              rows={2}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800 resize-y"
            />
            <div>
              <p className="text-xs text-gray-500 mb-1">Visible para</p>
              <TagMultiSelect
                tags={guestTags}
                selected={section.visibility?.tags || []}
                onChange={(ids) => list.update(section.id, { visibility: ids.length > 0 ? { tags: ids } : undefined })}
                emptyHint="Sin segmentos definidos: visible para todos los invitados."
              />
            </div>
          </div>
        ))}
        {list.canAdd && (
          <button
            type="button"
            onClick={() => list.add({ id: crypto.randomUUID(), title: '', body: '' })}
            className="text-sm text-primary font-medium hover:underline"
          >
            + Agregar sección
          </button>
        )}
      </div>

      {guestTags.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Visibilidad de secciones existentes</p>
          <p className="text-xs text-gray-400">Restringí a un segmento las secciones que ya usa el evento. Sin selección, quedan visibles para todos.</p>
          {BUILTIN_SECTIONS.map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-1">
              <span className="text-xs text-gray-600 dark:text-gray-300">{label}</span>
              <TagMultiSelect
                tags={guestTags}
                selected={sectionVisibility?.[key]?.tags || []}
                onChange={(ids) => setBuiltinVisibility(key, ids)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
