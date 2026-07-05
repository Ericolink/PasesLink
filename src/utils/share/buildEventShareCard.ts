import type { EventData } from '../../types'
import { getTemplate } from '../../templates/registry'
import { formatDate, formatTime12h } from '../time'
import { optimizedImageUrl } from '../cloudinary'
import type { ShareCardContent } from './types'

// Mismo mapeo de evento -> tema visual que ya usa buildInviteThemeStyle
// (templates/registry.ts): la plantilla del evento + el override puntual de
// accentColor, sin duplicar la paleta en ningún otro lugar.
export function buildEventShareCard(event: EventData, joinUrl: string): ShareCardContent {
  const template = getTemplate(event.templateId)
  const vars = { ...template.vars, ...(event.accentColor ? { accent: event.accentColor } : {}) }

  const timeLabel = event.startTime
    ? `${formatTime12h(event.startTime)}${event.endTime ? ` – ${formatTime12h(event.endTime)}` : ''}`
    : undefined

  return {
    title: event.name,
    dateLabel: formatDate(event.date),
    timeLabel,
    locationLabel: event.location,
    coverImageUrl: event.coverImage ? optimizedImageUrl(event.coverImage, 800) : undefined,
    ctaLabel: 'Únete al evento',
    url: joinUrl,
    theme: {
      accent: vars.accent,
      accentDark: vars.accentDark,
      accentSoft: vars.accentSoft,
      surface: vars.surface,
      text: vars.text,
      textMuted: vars.textMuted,
      fontFamily: vars.fontFamily,
      borderRadius: vars.borderRadius,
    },
  }
}
