// Canjea un token de invitación (ver createCoOrganizerInvite.ts) y suma a
// quien llama como coorganizador del evento — reemplaza el addCoOrganizer()
// directo desde el cliente para este flujo: acá SÍ hace falta una Cloud
// Function (no un simple updateDoc), porque el token vive en una subcolección
// ilegible desde el cliente y su validez (vencido/usado/inexistente) tiene
// que verificarse del lado del servidor antes de otorgar acceso.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { withCallableObservability } from '../lib/observability/withObservability.js'
import { BUSINESS_EVENTS, logBusinessEvent } from '../lib/observability/businessEvents.js'

// Mismo tope que createCoOrganizerInvite.ts / EVENT_CO_ORGANIZERS_MAX
// (src/utils/validation.ts) — revalidado acá porque entre que se generó el
// enlace y que alguien lo abre puede haber pasado cualquier cosa (otros
// coorganizadores agregados mientras tanto).
const EVENT_CO_ORGANIZERS_MAX = 20

interface AcceptCoOrganizerInviteInput {
  eventId: string
  token: string
}

export type AcceptCoOrganizerInviteResponse =
  | { status: 'success'; eventName: string }
  | { status: 'already_member'; eventName: string }
  | { status: 'expired' }
  | { status: 'used' }
  | { status: 'not_found' }
  | { status: 'full' }

export const acceptCoOrganizerInvite = onCall<AcceptCoOrganizerInviteInput>(
  { timeoutSeconds: 20 },
  (request) => withCallableObservability(request, 'acceptCoOrganizerInvite', async (ctx): Promise<AcceptCoOrganizerInviteResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    const { eventId, token } = request.data || {}
    const uid = request.auth.uid
    ctx.addContext({ uid, eventId })
    if (!eventId || !token) throw new HttpsError('invalid-argument', 'Falta el token de invitación.')

    const db = getFirestore()
    const eventRef = db.collection('events').doc(eventId)
    const inviteRef = eventRef.collection('coOrganizerInvites').doc(String(token))
    const userRef = db.collection('users').doc(uid)

    const result = await db.runTransaction(async (tx): Promise<AcceptCoOrganizerInviteResponse> => {
      // Todas las lecturas antes de cualquier escritura (regla de
      // runTransaction) — userSnap se trae siempre, aunque solo haga falta
      // en el camino de éxito, para no reordenar reads/writes según el caso.
      const [eventSnap, inviteSnap, userSnap] = await Promise.all([
        tx.get(eventRef),
        tx.get(inviteRef),
        tx.get(userRef),
      ])

      if (!eventSnap.exists) throw new HttpsError('not-found', 'El evento no existe.')
      if (!inviteSnap.exists) return { status: 'not_found' }

      const event = eventSnap.data()!
      const invite = inviteSnap.data()!
      const eventName = (event.name as string) || 'este evento'

      if (invite.usedBy) return { status: 'used' }
      const expiresAt = invite.expiresAt as Timestamp
      if (expiresAt.toMillis() < Date.now()) return { status: 'expired' }

      const coOrganizersMap = (event.coOrganizersMap as Record<string, string> | undefined) || {}
      if (uid === event.ownerId || uid in coOrganizersMap) {
        // Idempotente: ya es dueño/coorganizador (doble clic, dos pestañas,
        // o volvió a abrir el mismo enlace) — se marca el token usado igual
        // (que no quede reutilizable) pero no se trata como error de cara
        // al usuario.
        tx.update(inviteRef, { usedBy: uid, usedAt: FieldValue.serverTimestamp() })
        return { status: 'already_member', eventName }
      }
      if (Object.keys(coOrganizersMap).length >= EVENT_CO_ORGANIZERS_MAX) {
        return { status: 'full' }
      }

      const email = (userSnap.data()?.email as string | undefined) || request.auth!.token.email || ''

      tx.update(eventRef, {
        [`coOrganizersMap.${uid}`]: email,
        [`coOrganizerPermissions.${uid}`]: invite.permissions,
      })
      tx.update(inviteRef, { usedBy: uid, usedAt: FieldValue.serverTimestamp() })

      return { status: 'success', eventName }
    })

    if (result.status === 'success') {
      logBusinessEvent(ctx.logger, BUSINESS_EVENTS.CO_ORGANIZER_INVITE_ACCEPTED, { eventId, uid })
    }
    return result
  }),
)
