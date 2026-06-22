import { INVITATION_TEMPLATES } from '../templates/registry'
import type { TemplateId } from '../types'
import { InvitationPreview } from './InvitationPreview'

interface PreviewData {
  eventName?: string
  date?: string
  location?: string
  mapsUrl?: string
  coverImage?: string
  accentColor?: string
  welcomeMessage?: string
}

interface TemplatePickerProps {
  selected: TemplateId
  onSelect: (id: TemplateId) => void
  previewData?: PreviewData
}

// Selector compacto (chips) + una invitación de muestra real y completa
// debajo — no miniaturas recortadas. Si el caller pasa `previewData` (el
// estado actual del formulario), el preview lo usa en vivo; si no, cae 100%
// en los datos de ejemplo de cada tema.
export function TemplatePicker({ selected, onSelect, previewData }: TemplatePickerProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {INVITATION_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => onSelect(tpl.id)}
            className={`flex items-center gap-2 text-sm rounded-full pl-2 pr-3 py-1.5 font-medium border-2 transition-all ${
              selected === tpl.id
                ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
            }`}
          >
            <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: tpl.vars.accent }} />
            <span className="text-gray-700 dark:text-gray-300">{tpl.label}</span>
          </button>
        ))}
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <p className="text-xs font-medium text-gray-500 bg-gray-50 dark:bg-gray-800/60 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700">
          Vista previa — así se verá la invitación completa
        </p>
        <div className="max-h-[600px] overflow-y-auto">
          <InvitationPreview templateId={selected} {...previewData} />
        </div>
      </div>
    </div>
  )
}
