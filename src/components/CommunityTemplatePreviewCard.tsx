import type { CommunityTemplateVars } from '../types'

interface Props {
  vars: CommunityTemplateVars
  className?: string
}

// Tarjeta de muestra compartida por los 3 lugares que necesitan previsualizar
// una plantilla comunitaria (formulario de envío, detalle de moderación
// admin, TemplatePicker) — estilada directo desde `vars` (no var(--invite-*)):
// esas custom properties solo pintan algo dentro de .invite-theme-root, cuyo
// árbol no está presente en ninguno de estos 3 contextos.
export function CommunityTemplatePreviewCard({ vars, className = '' }: Props) {
  return (
    <div
      className={`rounded-xl border p-4 text-center ${className}`}
      style={{ backgroundColor: vars.pageBg, borderColor: vars.border }}
    >
      <div
        className="rounded-lg p-3"
        style={{ backgroundColor: vars.surface, borderRadius: vars.borderRadius, boxShadow: vars.shadow === 'none' ? undefined : vars.shadow }}
      >
        <p className="text-lg font-semibold" style={{ color: vars.text, fontFamily: vars.fontFamily }}>
          Cumpleaños de Sofía
        </p>
        <p className="text-xs mt-1" style={{ color: vars.textMuted, fontFamily: vars.secondaryFontFamily || vars.fontFamily }}>
          14 oct 2026 · Salón Jardín
        </p>
        <div
          className="mt-3 inline-block px-4 py-2 text-sm font-medium"
          style={{
            background: vars.buttonVariant === 'outline' ? 'transparent' : vars.accent,
            color: vars.buttonVariant === 'outline' ? vars.accent : '#fff',
            border: vars.buttonVariant === 'outline' ? `1px solid ${vars.accent}` : 'none',
            borderRadius: vars.borderRadius,
          }}
        >
          Confirmar asistencia
        </div>
      </div>
    </div>
  )
}
