import { useEffect } from 'react'
import type { TemplateId } from '../types'
import { buildDashboardThemeVars } from '../templates/dashboardTheme'

// Aplica la identidad visual de la plantilla del evento a las pantallas de
// administración (dashboard del evento, reportes, check-in). Setea las
// custom properties directamente en document.documentElement en vez de un
// wrapper JSX: GuestDetailSheet y ConfirmDialog se montan vía createPortal
// en document.body, fuera de cualquier árbol JSX de la página — el elemento
// raíz del documento es el único ancestro común entre el contenido normal y
// los nodos portados. Mismo patrón que ya usa useTheme.ts para el toggle
// .dark.
export function useDashboardTheme(templateId?: TemplateId, accentOverride?: string) {
  useEffect(() => {
    const root = document.documentElement
    const theme = buildDashboardThemeVars(templateId, accentOverride)

    if (!theme) {
      root.removeAttribute('data-dash-template')
      return
    }

    root.setAttribute('data-dash-template', theme.id)
    for (const [key, value] of Object.entries(theme.vars)) {
      root.style.setProperty(key, value)
    }

    return () => {
      root.removeAttribute('data-dash-template')
      for (const key of Object.keys(theme.vars)) {
        root.style.removeProperty(key)
      }
    }
  }, [templateId, accentOverride])
}
