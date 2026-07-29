import { useEffect, useState } from 'react'
import { subscribeToApprovedCommunityTemplates } from '../firebase/communityTemplates'
import type { CommunityTemplate } from '../types'

// Solo se monta mientras el picker de plantillas está abierto (EditEventForm,
// StepReviewTemplate) — nunca en el camino de renderizado del invitado, ver
// comentario en TemplatePicker.tsx.
export function useApprovedCommunityTemplates(): CommunityTemplate[] {
  const [templates, setTemplates] = useState<CommunityTemplate[]>([])

  useEffect(() => {
    return subscribeToApprovedCommunityTemplates(setTemplates, () => setTemplates([]))
  }, [])

  return templates
}
