import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { buildInviteThemeStyle, getEnterAnimationClass } from '../templates/registry'
import type { CommunityTemplateVars, TemplateId, ThemeOverrides } from '../types'

interface Props {
  templateId?: TemplateId
  accentOverride?: string
  // Resto de ThemeOverrides (Feature 2: personalización de plantillas) —
  // 'accent' queda afuera a propósito, sigue viniendo de accentOverride por
  // compatibilidad con los call sites existentes.
  themeOverrides?: Omit<ThemeOverrides, 'accent'>
  // EventData.communityTemplateSnapshot?.vars — snapshot congelado de una
  // plantilla comunitaria (ver src/types/index.ts). Se mezcla POR DEBAJO de
  // themeOverrides (los ajustes manuales del organizador siguen ganando) y
  // por encima de la plantilla base (que queda en 'default' cuando hay
  // snapshot, ver TemplatePicker). Ausente = comportamiento sin cambios.
  communityTemplateVars?: Partial<CommunityTemplateVars>
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
export function InvitationThemeRoot({ templateId, accentOverride, themeOverrides, communityTemplateVars, className, children }: Props) {
  const overrides = {
    ...communityTemplateVars,
    ...(accentOverride ? { accent: accentOverride } : undefined),
    ...themeOverrides,
  }
  const { dataTemplate, dataButtonVariant, style } = buildInviteThemeStyle(
    templateId,
    Object.keys(overrides).length > 0 ? overrides : undefined,
  )
  // La animación de entrada de una plantilla comunitaria no vive en
  // getEnterAnimationClass (que resuelve por TemplateId, y acá templateId se
  // queda en 'default' cuando hay snapshot) — se lee directo del snapshot,
  // con el mismo fallback (la de 'default') que ya usaría un tema sin uno.
  const enterAnimation = communityTemplateVars?.enterAnimation ?? getEnterAnimationClass(templateId)

  // Espeja las mismas variables --invite-* (y data-template) en
  // document.documentElement — GuestSignupPrompt, GuestEditModal,
  // ConfirmDialog y GuestConcessionsModal usan AccessibleModal, que monta
  // vía createPortal en document.body: ese nodo NO es descendiente de este
  // div (aunque sí lo sea en el árbol de React), así que `var(--invite-*)`
  // quedaba sin resolver ahí — un panel "bg-[var(--invite-surface)]"
  // transparente, con el fondo de la página transparentándose detrás
  // (bug reportado: el modal de checkout del menú se veía ilegible en
  // Fiesta Improvisada). Mismo patrón que useDashboardTheme.ts ya usa para
  // el mismo problema del lado admin — el nodo raíz del documento es el
  // único ancestro común entre el contenido normal y los nodos portados.
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-template', dataTemplate)
    for (const [key, value] of Object.entries(style)) {
      if (typeof value === 'string') root.style.setProperty(key, value)
    }
    return () => {
      root.removeAttribute('data-template')
      for (const key of Object.keys(style)) {
        root.style.removeProperty(key)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataTemplate, JSON.stringify(style)])

  return (
    <div data-template={dataTemplate} data-button-variant={dataButtonVariant} style={style} className="invite-theme-root">
      <div className={`${enterAnimation} ${className ?? ''}`}>{children}</div>
    </div>
  )
}
