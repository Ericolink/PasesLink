// Genera un enlace/código de invitación para sumar un coorganizador —
// reemplaza el alta directa por email (buscar por getUserByEmail +
// addCoOrganizer, ver src/hooks/useCoOrganizers.ts) como flujo PRINCIPAL:
// no requiere que la otra persona ya tenga cuenta creada, ni que el
// organizador sepa su correo exacto de antemano (rediseño del Dashboard del
// Evento — "Coorganizadores"). El alta por correo se conserva como
// alternativa secundaria, sin cambios, para cuando el organizador ya sabe
// exactamente a quién agregar.
//
// El token vive en events/{eventId}/coOrganizerInvites/{token}, ilegible
// desde el cliente (firestore.rules: read/write false en esa subcolección) —
// solo se crea acá y se canjea en acceptCoOrganizerInvite.ts, nunca por una
// escritura directa del navegador.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { randomUUID } from 'node:crypto'
import { hasPermission, LEGACY_COORG_DEFAULTS } from '../lib/permissions.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'

// Mismo tope que EVENT_CO_ORGANIZERS_MAX (src/utils/validation.ts) y
// eventContentCapsOk() en firestore.rules — duplicado acá por el mismo
// motivo que el resto de las constantes de este archivo.
const EVENT_CO_ORGANIZERS_MAX = 20
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 días

interface CreateCoOrganizerInviteInput {
  eventId: string
}

export type CreateCoOrganizerInviteResponse =
  | { status: 'success'; token: string; expiresAt: number }
  | { status: 'full' }

export const createCoOrganizerInvite = onCall<CreateCoOrganizerInviteInput>(
  { timeoutSeconds: 20 },
  (request) => withCallableObservability(request, 'createCoOrganizerInvite', async (ctx): Promise<CreateCoOrganizerInviteResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    const { eventId } = request.data || {}
    ctx.addContext({ uid: request.auth.uid, eventId })
    if (!eventId) throw new HttpsError('invalid-argument', 'Falta el evento.')

    const db = getFirestore()
    const eventRef = db.collection('events').doc(eventId)
    const eventSnap = await eventRef.get()
    if (!eventSnap.exists) throw new HttpsError('not-found', 'El evento no existe.')
    const event = eventSnap.data()!
    if (!hasPermission(event, request.auth.uid, 'manageCoOrganizers', { isAdmin: request.auth.token.admin === true })) {
      throw new HttpsError('permission-denied', 'No tienes permiso para invitar coorganizadores a este evento.')
    }

    const coOrganizersMap = (event.coOrganizersMap as Record<string, string> | undefined) || {}
    const invitesCol = eventRef.collection('coOrganizerInvites')

    // Cuenta coorganizadores ya sumados + invitaciones pendientes (sin
    // canjear) contra el mismo tope que firestore.rules aplica a
    // coOrganizersMap.size() — sin esto, alguien podría generar más
    // invitaciones de las que el evento podría aceptar todas juntas. No
    // filtra por vencidas (evitaría necesitar un índice compuesto por un
    // caso límite raro): en el peor caso, alguna invitación vieja sin
    // canjear se cuenta de más, nunca de menos.
    const pendingSnap = await invitesCol.where('usedBy', '==', null).count().get()
    const pendingCount = pendingSnap.data().count
    if (Object.keys(coOrganizersMap).length + pendingCount >= EVENT_CO_ORGANIZERS_MAX) {
      return { status: 'full' }
    }

    const token = randomUUID().replace(/-/g, '')
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
    await invitesCol.doc(token).set({
      createdBy: request.auth.uid,
      createdByEmail: request.auth.token.email || null,
      permissions: LEGACY_COORG_DEFAULTS,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
      usedBy: null,
      usedAt: null,
    })

    return { status: 'success', token, expiresAt: expiresAt.getTime() }
  }),
)
