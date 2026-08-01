// Inicia (o relanza) una campaña de reconfirmación — fan-out de escrituras
// sobre potencialmente cientos de guests, por eso vive en una Cloud
// Function y no en el cliente (mismo criterio que "menos lógica crítica en
// React" ya aplicado en la lista de espera).
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { startCampaign, type ReminderRuleInput } from '../reconfirm/campaign.js'
import { canManageGuests } from '../lib/permissions.js'

interface StartReconfirmCampaignInput {
  eventId: string
  deadline: number
  excludeTagIds?: string[]
  reminderRules: ReminderRuleInput[]
}

export const startReconfirmCampaign = onCall<StartReconfirmCampaignInput>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Necesitás iniciar sesión.')
  }
  const { eventId, deadline, excludeTagIds, reminderRules } = request.data || {}
  if (!eventId || !deadline || !Array.isArray(reminderRules)) {
    throw new HttpsError('invalid-argument', 'Faltan datos para iniciar la campaña.')
  }

  const db = getFirestore()
  const eventSnap = await db.collection('events').doc(eventId).get()
  if (!eventSnap.exists) {
    throw new HttpsError('not-found', 'El evento no existe.')
  }
  if (!canManageGuests(eventSnap.data()!, request.auth.uid)) {
    throw new HttpsError('permission-denied', 'No tenés permiso para gestionar este evento.')
  }

  return startCampaign(db, {
    eventId,
    deadline,
    excludeTagIds: excludeTagIds ?? [],
    reminderRules,
  })
})
