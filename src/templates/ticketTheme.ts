import type { CSSProperties } from 'react'
import type { TemplateId } from '../types'
import { buildInviteThemeStyle } from './registry'

// Extensión explícita y separada del sistema de temas de invitación hacia
// los "tickets" (Dashboard "Mis eventos" y "Mis invitaciones") — ver nota en
// DESIGN_GOVERNANCE.md. Sin plantilla (o 'default') no se setea ningún
// --invite-*, así que todo el CSS de ticket (que usa var(--invite-x,
// <valor-actual>)) cae a sus fallbacks: el look nocturno/rosa de siempre,
// sin cambios. Con una plantilla real, reutiliza registry.ts tal cual —
// ningún token nuevo, ninguna paleta duplicada.
export function buildTicketThemeStyle(templateId?: TemplateId, accentOverride?: string): CSSProperties | undefined {
  if (!templateId || templateId === 'default') return undefined
  return buildInviteThemeStyle(templateId, accentOverride ? { accent: accentOverride } : undefined).style
}
