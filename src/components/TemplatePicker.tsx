import { INVITATION_TEMPLATES } from '../templates/registry'
import { useIsAdmin } from '../hooks/useIsAdmin'
import type { TemplateId } from '../types'
import { InvitationPreview } from './InvitationPreview'
import { TemplateIconButton } from './TemplateIconButton'

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

// Fila compacta de botones con ícono (uno por plantilla, ver pickerIcons.ts)
// que se "ilumina" con el acento propio del tema al seleccionarlo + una
// invitación de muestra real y completa debajo. Si el caller pasa
// `previewData` (el estado actual del formulario), el preview completo lo
// usa en vivo; si no, cae 100% en los datos de ejemplo de cada tema.
export function TemplatePicker({ selected, onSelect, previewData }: TemplatePickerProps) {
  const { isAdmin } = useIsAdmin()
  // Los temas `adminOnly` (ver registry.ts) quedan ocultos para anfitriones
  // normales — salvo que el evento ya los tenga seleccionados (p.ej. un
  // evento existente creado por el admin), para no hacer "desaparecer" la
  // plantilla activa del selector.
  const visibleTemplates = INVITATION_TEMPLATES.filter((tpl) => !tpl.adminOnly || isAdmin || tpl.id === selected)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-3">
        {visibleTemplates.map((tpl) => (
          <TemplateIconButton key={tpl.id} template={tpl} isSelected={selected === tpl.id} onSelect={onSelect} />
        ))}
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <p className="text-xs font-medium text-gray-500 bg-gray-50 dark:bg-gray-800/60 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700">
          Vista previa — así se verá la invitación completa
        </p>
        <div className="max-h-[600px] overflow-y-auto">
          {/* key={selected} fuerza remount al cambiar de plantilla, para que
              InvitationThemeRoot re-dispare la animación de entrada propia
              del tema nuevo (enterAnimation) en vez de quedar estático. */}
          <InvitationPreview key={selected} templateId={selected} {...previewData} />
        </div>
      </div>
    </div>
  )
}
