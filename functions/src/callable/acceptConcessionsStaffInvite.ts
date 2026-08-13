// Canjea un token de invitación de encargado de "Ventas del evento" (ver
// createConcessionsStaffInvite.ts) — mismo motivo que
// acceptCoOrganizerInvite.ts para necesitar una Cloud Function: el token
// vive en una subcolección ilegible desde el cliente y su validez
// (vencido/usado/inexistente) debe verificarse del lado del servidor.
//
// A diferencia de coorganizador, el rol se MERGEA en el
// ConcessionsStaffEntry existente en vez de sobrescribirlo — una misma
// persona puede terminar con ambos roles (caja y preparación) si acepta dos
// invitaciones distintas.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { withCallableObservability } from '../lib/observability/withObservability.js'
import { BUSINESS_EVENTS, logBusinessEvent } from '../lib/observability/businessEvents.js'

type ConcessionsStaffRole = 'cashier' | 'prep'

interface AcceptConcessionsStaffInviteInput {
  eventId: string
  token: string
}

export type AcceptConcessionsStaffInviteResponse =
  | { status: 'success'; eventName: string; role: ConcessionsStaffRole }
  | { status: 'already_member'; eventName: string; role: ConcessionsStaffRole }
  | { status: 'expired' }
  | { status: 'used' }
  | { status: 'not_found' }

export const acceptConcessionsStaffInvite = onCall<AcceptConcessionsStaffInviteInput>(
  { timeoutSeconds: 20 },
  (request) => withCallableObservability(request, 'acceptConcessionsStaffInvite', async (ctx): Promise<AcceptConcessionsStaffInviteResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    const { eventId, token } = request.data || {}
    const uid = request.auth.uid
    ctx.addContext({ uid, eventId })
    if (!eventId || !token) throw new HttpsError('invalid-argument', 'Falta el token de invitación.')

    const db = getFirestore()
    const eventRef = db.collection('events').doc(eventId)
    const inviteRef = eventRef.collection('concessionsStaffInvites').doc(String(token))
    const userRef = db.collection('users').doc(uid)

    const result = await db.runTransaction(async (tx): Promise<AcceptConcessionsStaffInviteResponse> => {
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
      const role = invite.role as ConcessionsStaffRole

      if (invite.usedBy) return { status: 'used' }
      const expiresAt = invite.expiresAt as Timestamp
      if (expiresAt.toMillis() < Date.now()) return { status: 'expired' }

      const staffMap = (event.concessions?.concessionsStaffMap as Record<string, unknown> | undefined) || {}
      const existingRaw = staffMap[uid]
      const existing = typeof existingRaw === 'string'
        ? { email: existingRaw, roles: { cashier: false, prep: true } }
        : existingRaw as { email: string; roles: { cashier: boolean; prep: boolean } } | undefined

      if (existing?.roles?.[role]) {
        // Idempotente: ya tiene este rol (doble clic, o volvió a abrir el
        // mismo enlace) — se marca el token usado igual, sin tratarlo como
        // error de cara al usuario.
        tx.update(inviteRef, { usedBy: uid, usedAt: FieldValue.serverTimestamp() })
        return { status: 'already_member', eventName, role }
      }

      const email = (userSnap.data()?.email as string | undefined) || request.auth!.token.email || ''
      const mergedRoles = {
        cashier: role === 'cashier' || !!existing?.roles?.cashier,
        prep: role === 'prep' || !!existing?.roles?.prep,
      }

      tx.update(eventRef, {
        [`concessions.concessionsStaffMap.${uid}`]: { email: existing?.email || email, roles: mergedRoles },
      })
      tx.update(inviteRef, { usedBy: uid, usedAt: FieldValue.serverTimestamp() })

      return { status: 'success', eventName, role }
    })

    if (result.status === 'success') {
      logBusinessEvent(ctx.logger, BUSINESS_EVENTS.CONCESSIONS_STAFF_INVITE_ACCEPTED, { eventId, uid })
    }
    return result
  }),
)
