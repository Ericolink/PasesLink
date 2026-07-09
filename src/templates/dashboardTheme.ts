import type { TemplateId } from '../types'
import { buildInviteThemeStyle } from './registry'

// Extensión explícita y separada del sistema de temas de invitación hacia el
// dashboard del organizador/coanfitrión — ver nota en DESIGN_GOVERNANCE.md.
// Mismo espíritu que ticketTheme.ts: no duplica la lógica de merge de
// overrides, delega en buildInviteThemeStyle (registry.ts) — la misma
// función que ya usa InvitationThemeRoot, con el mismo patrón correcto de
// "solo pisar accent si accentOverride es truthy" (event.accentColor se
// persiste como '' en Firestore cuando el anfitrión no lo personalizó, no
// como undefined — un `??` ahí pisaría el accent del tema con una cadena
// vacía). Sin plantilla (o 'default') no devuelve nada, así que
// useDashboardTheme no toca document.documentElement: el dashboard
// conserva exactamente el look fijo de PaseLink.
export function buildDashboardThemeVars(
  templateId?: TemplateId,
  accentOverride?: string,
): { id: TemplateId; vars: Record<string, string> } | undefined {
  if (!templateId || templateId === 'default') return undefined

  const { dataTemplate, style } = buildInviteThemeStyle(templateId, accentOverride ? { accent: accentOverride } : undefined)
  const inviteVars = style as Record<string, string>
  const accent = inviteVars['--invite-accent']
  const accentDark = inviteVars['--invite-accent-dark']
  const accentSoft = inviteVars['--invite-accent-soft']

  return {
    id: dataTemplate,
    vars: {
      // Custom properties que ya usan las utilidades Tailwind (bg-primary,
      // text-primary, focus:ring-primary) — reusar el nombre repinta botones/
      // links/badges/focus-rings en todo el dashboard sin tocar componentes.
      '--color-primary': accent,
      '--color-primary-dark': accentDark,
      // Mismas custom properties que ya consumen ThemeOrnament y
      // StatCard/EventTicketCard (.invite-stat-card) — reutilizarlas permite
      // reusar esos componentes tal cual en el dashboard.
      '--invite-accent': accent,
      '--invite-accent-dark': accentDark,
      '--invite-accent-soft': accentSoft,
    },
  }
}
