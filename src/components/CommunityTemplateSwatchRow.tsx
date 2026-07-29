import type { CommunityTemplate } from '../types'

interface Props {
  templates: CommunityTemplate[]
  selectedId?: string
  onSelect: (template: CommunityTemplate) => void
}

// Fila horizontal de swatches (un círculo de acento + nombre) para las
// plantillas de la comunidad ya aprobadas — deliberadamente más simple que
// TemplateIconButton (que usa un ícono por-tema, ver pickerIcons.ts): las
// plantillas comunitarias no tienen arte propio en v1, así que el swatch es
// su propio color de acento.
export function CommunityTemplateSwatchRow({ templates, selectedId, onSelect }: Props) {
  if (templates.length === 0) return null

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Comunidad</p>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Plantillas de la comunidad">
        {templates.map((t) => {
          const isSelected = t.id === selectedId
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t)}
              aria-pressed={isSelected}
              title={t.name}
              className={`shrink-0 flex flex-col items-center gap-1 w-16 rounded-lg py-2 border-2 transition-colors ${
                isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-gray-200 dark:hover:border-gray-600'
              }`}
            >
              <span
                className="w-7 h-7 rounded-full border border-gray-200 dark:border-gray-600"
                style={{ background: t.vars.accent }}
                aria-hidden="true"
              />
              <span className="text-2xs text-gray-600 dark:text-gray-300 truncate w-full text-center">{t.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
