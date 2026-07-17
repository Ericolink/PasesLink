import { memo } from 'react'
import { PICKER_ICONS } from '../templates/pickerIcons'
import type { InvitationTemplate } from '../templates/registry'
import type { TemplateId } from '../types'

interface TemplateIconButtonProps {
  template: InvitationTemplate
  isSelected: boolean
  onSelect: (id: TemplateId) => void
}

// Botón compacto: ícono que identifica la plantilla (ver pickerIcons.ts) +
// nombre corto. Sin seleccionar es neutro; al seleccionar "se ilumina" con
// el acento propio de esa plantilla (mismo `vars.accent` que ya pinta toda
// la invitación) — no un color fijo por ícono, para no duplicar la paleta
// en un segundo lugar. memo: con 6+ botones en TemplatePicker, cambiar de
// selección re-renderizaba los N-1 botones cuyo `isSelected` en realidad no
// cambió.
export const TemplateIconButton = memo(function TemplateIconButton({ template, isSelected, onSelect }: TemplateIconButtonProps) {
  const Icon = PICKER_ICONS[template.id]
  const accent = template.vars.accent

  return (
    <button
      type="button"
      onClick={() => onSelect(template.id)}
      aria-pressed={isSelected}
      title={template.description}
      className="group flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 px-2 py-3 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      style={
        isSelected
          ? {
              borderColor: accent,
              backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`,
              boxShadow: `0 0 0 3px color-mix(in srgb, ${accent} 22%, transparent), 0 0 18px color-mix(in srgb, ${accent} 55%, transparent)`,
            }
          : undefined
      }
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-transform duration-200 ${
          isSelected ? 'scale-110' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400'
        }`}
        style={isSelected ? { color: accent } : undefined}
      >
        <Icon className="w-7 h-7" />
      </span>
      <span
        className="text-2xs font-medium leading-tight text-gray-700 dark:text-gray-300"
        style={isSelected ? { color: accent } : undefined}
      >
        {template.label}
      </span>
    </button>
  )
})
