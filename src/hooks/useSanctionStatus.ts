import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import {
  activeRestrictionUntilLabel,
  isCommentRestricted,
  isCurrentlyBanned,
  isPhotoRestricted,
  subscribeToUserSanctionSummary,
} from '../firebase/sanctions'
import type { UserSanctionSummary } from '../types'

const EMPTY_SUMMARY: UserSanctionSummary = {
  uid: '',
  warningsCount: 0,
  global: { bannedUntil: 0, commentBanUntil: 0, photoBanUntil: 0, reason: '' },
  events: {},
  updatedAt: 0,
}

function mostRestrictiveScope(summary: UserSanctionSummary, eventId: string | undefined, field: 'bannedUntil' | 'commentBanUntil' | 'photoBanUntil') {
  const now = Date.now()
  const eventScope = eventId ? summary.events[eventId] : undefined
  const globalActive = summary.global[field] > now
  const eventActive = !!eventScope && eventScope[field] > now
  if (globalActive && (!eventActive || summary.global[field] >= (eventScope?.[field] || 0))) {
    return { until: summary.global[field], reason: summary.global.reason }
  }
  if (eventActive && eventScope) return { until: eventScope[field], reason: eventScope.reason }
  return null
}

function buildMessage(verb: string, scope: { until: number; reason: string } | null): string | null {
  if (!scope) return null
  const reasonPart = scope.reason ? ` Motivo: ${scope.reason}.` : ''
  return `${verb} ${activeRestrictionUntilLabel(scope.until)}.${reasonPart}`
}

// Gatea la UI de publicar (comentario/foto) contra sanciones activas del
// usuario logueado — Firestore rules es la barrera real (ver
// commentsBlocked/photosBlocked en firestore.rules), esto es solo para que el
// usuario vea un mensaje claro en vez de un error de permisos genérico al
// intentar publicar. Sin sesión no hay sanción posible (ver sanctions.ts).
export function useSanctionStatus(eventId?: string) {
  const { user } = useAuth()
  const [summary, setSummary] = useState<UserSanctionSummary>(EMPTY_SUMMARY)

  // Depende del uid (primitivo), no del objeto `user` completo — mismo
  // criterio que useUserProfile.ts, ver comentario ahí.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!user) {
      setSummary(EMPTY_SUMMARY)
      return
    }
    return subscribeToUserSanctionSummary(user.uid, setSummary, (err) => {
      console.error('Error leyendo el estado de sanciones del usuario:', err)
    })
  }, [user?.uid])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const banned = isCurrentlyBanned(summary, eventId)
  const commentBlocked = isCommentRestricted(summary, eventId)
  const photoBlocked = isPhotoRestricted(summary, eventId)

  const banMessage = buildMessage('Tu cuenta está suspendida', mostRestrictiveScope(summary, eventId, 'bannedUntil'))
  const commentBlockedMessage = banMessage
    || buildMessage('No puedes comentar', mostRestrictiveScope(summary, eventId, 'commentBanUntil'))
  const photoBlockedMessage = banMessage
    || buildMessage('No puedes subir fotos', mostRestrictiveScope(summary, eventId, 'photoBanUntil'))

  return { summary, banned, commentBlocked, photoBlocked, banMessage, commentBlockedMessage, photoBlockedMessage }
}
