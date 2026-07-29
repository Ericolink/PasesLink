import { memo } from 'react'
import { INVITATION_TEMPLATES } from '../templates/registry'
import { useIsAdmin } from '../hooks/useIsAdmin'
import type { CommunityTemplate, CommunityTemplateSnapshot, TemplateId, ThemeOverrides, TimelineEntry } from '../types'
import { CommunityTemplatePreviewCard } from './CommunityTemplatePreviewCard'
import { CommunityTemplateSwatchRow } from './CommunityTemplateSwatchRow'
import { InvitationPreview } from './InvitationPreview'
import { TemplateIconButton } from './TemplateIconButton'

interface PreviewData {
  eventName?: string
  date?: string
  location?: string
  mapsUrl?: string
  coverImage?: string
  accentColor?: string
  themeOverrides?: Omit<ThemeOverrides, 'accent'>
  welcomeMessage?: string
  description?: string
  dressCode?: string
  timeline?: TimelineEntry[]
}

interface TemplatePickerProps {
  selected: TemplateId
  onSelect: (id: TemplateId) => void
  previewData?: PreviewData
  // Plantillas de la comunidad ya aprobadas (ver communityTemplates.ts) — solo
  // se pasan desde los formularios que quieren ofrecerlas (EditEventForm,
  // StepReviewTemplate). Ausentes = el picker se comporta exactamente igual
  // que antes de esta feature, sin sección "Comunidad".
  communityTemplates?: CommunityTemplate[]
  selectedCommunityTemplate?: CommunityTemplateSnapshot | null
  onSelectCommunity?: (snapshot: CommunityTemplateSnapshot | null) => void
}

// Fila compacta de botones con ícono (uno por plantilla, ver pickerIcons.ts)
// que se "ilumina" con el acento propio del tema al seleccionarlo + una
// invitación de muestra real y completa debajo. Si el caller pasa
// `previewData` (el estado actual del formulario), el preview completo lo
// usa en vivo; si no, cae 100% en los datos de ejemplo de cada tema.
// memo: este componente renderiza InvitationPreview completo (gradientes,
// fuentes, animaciones por tema) — el paso final del wizard (StepReviewTemplate)
// es el más pesado y no debería volver a montar todo esto si `previewData`
// sigue siendo el mismo objeto (ver useMemo ahí).
export const TemplatePicker = memo(function TemplatePicker({
  selected,
  onSelect,
  previewData,
  communityTemplates,
  selectedCommunityTemplate,
  onSelectCommunity,
}: TemplatePickerProps) {
  const { isAdmin } = useIsAdmin()
  // Los temas `adminOnly` (ver registry.ts) quedan ocultos para anfitriones
  // normales — salvo que el evento ya los tenga seleccionados (p.ej. un
  // evento existente creado por el admin), para no hacer "desaparecer" la
  // plantilla activa del selector.
  const visibleTemplates = INVITATION_TEMPLATES.filter((tpl) => !tpl.adminOnly || isAdmin || tpl.id === selected)

  return (
    <div className="space-y-5">
      <div role="group" aria-label="Plantilla de invitación" className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-3">
        {visibleTemplates.map((tpl) => (
          <TemplateIconButton
            key={tpl.id}
            template={tpl}
            isSelected={selected === tpl.id && !selectedCommunityTemplate}
            onSelect={(id) => { onSelect(id); onSelectCommunity?.(null) }}
          />
        ))}
      </div>

      {!!communityTemplates?.length && onSelectCommunity && (
        <CommunityTemplateSwatchRow
          templates={communityTemplates}
          selectedId={selectedCommunityTemplate?.id}
          onSelect={(t) => { onSelect('default'); onSelectCommunity({ id: t.id, name: t.name, vars: t.vars }) }}
        />
      )}

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <p className="text-xs font-medium text-gray-500 bg-gray-50 dark:bg-gray-800/60 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700">
          Vista previa — así se verá la invitación completa
        </p>
        <div className="max-h-[600px] overflow-y-auto">
          {selectedCommunityTemplate ? (
            // Las plantillas de la comunidad no tienen ornamentos/muro/sello
            // propios en v1 (ver CommunityTemplateSnapshot) — se muestra la
            // misma tarjeta compacta que usan el formulario de envío y la
            // moderación admin, no el recorrido completo de InvitationPreview.
            <div className="p-4">
              <CommunityTemplatePreviewCard
                vars={{ ...INVITATION_TEMPLATES[0].vars, ...selectedCommunityTemplate.vars }}
              />
            </div>
          ) : (
            // key={selected} fuerza remount al cambiar de plantilla, para que
            // InvitationThemeRoot re-dispare la animación de entrada propia
            // del tema nuevo (enterAnimation) en vez de quedar estático.
            <InvitationPreview key={selected} templateId={selected} {...previewData} />
          )}
        </div>
      </div>
    </div>
  )
})
