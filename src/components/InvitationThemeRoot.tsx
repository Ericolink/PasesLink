import type { ReactNode } from 'react'
import { buildInviteThemeStyle, getEnterAnimationClass } from '../templates/registry'
import type { TemplateId, ThemeOverrides } from '../types'

interface Props {
  templateId?: TemplateId
  accentOverride?: string
  // Resto de ThemeOverrides (Feature 2: personalización de plantillas) —
  // 'accent' queda afuera a propósito, sigue viniendo de accentOverride por
  // compatibilidad con los call sites existentes.
  themeOverrides?: Omit<ThemeOverrides, 'accent'>
  className?: string
  children: ReactNode
}

// Capa exterior (.invite-theme-root) sin restricción de ancho: ocupa todo
// <main> de borde a borde y pinta el fondo + patrón del tema ahí, no en la
// columna de lectura. La capa interior es la que lleva el className de
// layout que ya traía cada llamador (max-w-sm mx-auto px-4 py-12, etc.) —
// así el tema cubre TODA la página, no solo la tarjeta. Nadie más necesita
// recibir templateId como prop: todo lo de adentro hereda las variables
// --invite-* por cascada de CSS.
export function InvitationThemeRoot({ templateId, accentOverride, themeOverrides, className, children }: Props) {
  const overrides = { ...(accentOverride ? { accent: accentOverride } : undefined), ...themeOverrides }
  const { dataTemplate, dataButtonVariant, style } = buildInviteThemeStyle(
    templateId,
    Object.keys(overrides).length > 0 ? overrides : undefined,
  )
  const enterAnimation = getEnterAnimationClass(templateId)

  return (
    <div data-template={dataTemplate} data-button-variant={dataButtonVariant} style={style} className="invite-theme-root">
      <div className={`${enterAnimation} ${className ?? ''}`}>{children}</div>
    </div>
  )
}
