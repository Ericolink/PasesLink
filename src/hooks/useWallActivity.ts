import { useEffect, useState } from 'react'
import { subscribeToLatestWallMessage } from '../firebase/wall'

// Mismo patrón que StoriesBar (stories_seen_<eventId> en localStorage): nada
// de Firestore ni de firestore.rules nuevos, "visto" vive en el dispositivo
// que lo vio. Un mensaje del propio organizador (authorRole 'owner') nunca
// prende el punto — solo lo que escriben otros (invitados, o un co-organizador
// posteando como invitado, ver EventWall.tsx) cuenta como novedad real.
function seenKey(eventId: string) {
  return `wall_seen_${eventId}`
}

function loadSeen(eventId: string): number {
  return Number(localStorage.getItem(seenKey(eventId))) || 0
}

export function markWallSeen(eventId: string) {
  localStorage.setItem(seenKey(eventId), String(Date.now()))
}

export function useHasUnseenWallMessage(eventId: string | undefined): boolean {
  const [hasUnseen, setHasUnseen] = useState(false)

  useEffect(() => {
    if (!eventId) return
    return subscribeToLatestWallMessage(eventId, (message) => {
      setHasUnseen(!!message && message.authorRole !== 'owner' && message.createdAt > loadSeen(eventId))
    })
  }, [eventId])

  return hasUnseen
}
