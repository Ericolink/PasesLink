// Inicia (o relanza) una campaña de reconfirmación — fan-out de escrituras
// sobre potencialmente cientos de guests, por eso vive en una Cloud
// Function y no en el cliente (mismo criterio que "menos lógica crítica en
// React" ya aplicado en la lista de espera).
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { startCampaign, type ReminderRuleInput } from '../reconfirm/campaign.js'
import { canManageGuests } from '../lib/permissions.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'

interface StartReconfirmCampaignInput {
  eventId: string
  deadline: number
  excludeTagIds?: string[]
  reminderRules: ReminderRuleInput[]
}

// timeoutSeconds por encima del default: fan-out sin tope explícito sobre
// todos los invitados elegibles del evento, en lotes de 400 (WRITE_CHUNK_SIZE)
// — puede ser una lista larga en un evento grande.
export const startReconfirmCampaign = onCall<StartReconfirmCampaignInput>({ timeoutSeconds: 120 }, (request) =>
  withCallableObservability(request, 'startReconfirmCampaign', async (ctx) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    }
    const { eventId, deadline, excludeTagIds, reminderRules } = request.data || {}
    ctx.addContext({ uid: request.auth.uid, eventId })
    if (!eventId || !deadline || !Array.isArray(reminderRules)) {
      throw new HttpsError('invalid-argument', 'Faltan datos para iniciar la campaña.')
    }

    const db = getFirestore()
    const eventSnap = await db.collection('events').doc(eventId).get()
    if (!eventSnap.exists) {
      throw new HttpsError('not-found', 'El evento no existe.')
    }
    if (!canManageGuests(eventSnap.data()!, request.auth.uid)) {
      throw new HttpsError('permission-denied', 'No tienes permiso para gestionar este evento.')
    }

    return startCampaign(db, {
      eventId,
      deadline,
      excludeTagIds: excludeTagIds ?? [],
      reminderRules,
    })
  }),
)
