import { useMemo } from 'react'
import type { EventData } from '../types'
import { getTemplate } from '../templates/registry'

interface TemplateUsage {
  templateId: string
  label: string
  count: number
  percent: number
}

// No llama a Firestore — recibe `events` ya cargado por el shell de /admin
// (getAllEvents, ver AdminDashboard.tsx) y solo agrupa en memoria. Evita una
// segunda descarga completa de eventos solo para esto. QR/Compartir/
// Estadísticas quedan fuera a propósito (sin instrumentación de uso hoy, ver
// docs/platform-health-roadmap.md) — acá solo van las dos señales que ya
// están en EventData sin agregar tracking nuevo.
export function useUsageAnalytics(events: EventData[]) {
  return useMemo(() => {
    const countByTemplate = new Map<string, number>()
    let withCoOrganizers = 0

    for (const event of events) {
      const templateId = event.templateId || 'default'
      countByTemplate.set(templateId, (countByTemplate.get(templateId) || 0) + 1)
      if (Object.keys(event.coOrganizersMap ?? {}).length > 0) withCoOrganizers += 1
    }

    const templateRanking: TemplateUsage[] = Array.from(countByTemplate.entries())
      .map(([templateId, count]) => ({
        templateId,
        label: getTemplate(templateId).label,
        count,
        percent: events.length ? Math.round((count / events.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)

    const coOrganizerRate = events.length ? Math.round((withCoOrganizers / events.length) * 100) : 0

    return { templateRanking, coOrganizerRate }
  }, [events])
}
