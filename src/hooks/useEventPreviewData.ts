import { useMemo } from 'react'
import { formatDate } from '../utils/time'
import type { ThemeOverrides, TimelineEntry } from '../types'

interface EventPreviewFields {
  name: string
  date: string
  location: string
  mapsUrl: string
  coverImage: string
  accentColor: string
  secondaryFontFamily: string
  buttonVariant: 'solid' | 'outline'
  welcomeMessage: string
  description: string
  dressCode: string
  timeline: TimelineEntry[]
}

export interface EventPreviewData {
  eventName: string
  date?: string
  location: string
  mapsUrl: string
  coverImage: string
  accentColor: string
  themeOverrides: Omit<ThemeOverrides, 'accent'>
  welcomeMessage: string
  description: string
  dressCode: string
  timeline: TimelineEntry[]
}

// Memoizado: alimenta InvitationPreview (vía TemplatePicker en el paso de
// revisión, y vía el panel persistente del wizard) — sin memo, cada tecla en
// cualquier campo del formulario recrearía la referencia y forzaría un
// re-render del preview temático completo, el componente más pesado del
// wizard. Extraído de StepReviewTemplate.tsx para que ambos lugares construyan
// el mismo objeto de la misma forma.
export function useEventPreviewData(fields: EventPreviewFields): EventPreviewData {
  const {
    name, date, location, mapsUrl, coverImage, accentColor,
    secondaryFontFamily, buttonVariant, welcomeMessage, description, dressCode, timeline,
  } = fields

  return useMemo(
    () => ({
      eventName: name,
      date: date ? formatDate(date) : undefined,
      location,
      mapsUrl,
      coverImage,
      accentColor,
      themeOverrides: {
        ...(secondaryFontFamily ? { secondaryFontFamily } : {}),
        ...(buttonVariant !== 'solid' ? { buttonVariant } : {}),
      },
      welcomeMessage,
      description,
      dressCode,
      timeline,
    }),
    [name, date, location, mapsUrl, coverImage, accentColor, secondaryFontFamily, buttonVariant, welcomeMessage, description, dressCode, timeline],
  )
}
