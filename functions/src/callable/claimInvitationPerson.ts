// Vincula UNA persona de una invitación (invitado principal o un
// acompañante/integrante puntual, ver `personIndex` abajo) a la cuenta
// autenticada que llama — sin crear ninguna invitación ni QR nuevo: todas
// las personas de esta invitación siguen compartiendo el mismo `qrToken`.
//
// A diferencia de claimGuestOwnership (src/firebase/guests.ts, escritura de
// cliente + regla de Firestore, usada para el reclamo AUTOMÁTICO y
// silencioso del invitado principal en una invitación de una sola persona),
// esta Callable cubre el caso de varias personas: cada una elige
// explícitamente "cuál de estas personas soy yo" (ver
// CompanionClaimRoster.tsx) y el resultado debe poder fallar visiblemente
// ("ya fue reclamado por otra cuenta"), no silenciarse. Se implementa como
// Cloud Function (Admin SDK) en vez de una regla de Firestore porque el
// campo a validar (GuestData.companionClaims, para personIndex >= 1) es un
// mapa cuya clave a agregar no se conoce de antemano — una transacción en
// TypeScript puede leerlo y validarlo completo; una regla de Firestore no
// puede expresar "se agregó exactamente una clave nueva, sin tocar las
// demás" para una clave arbitraria (ver el comentario de
// accessControlFieldsUntouched en firestore.rules, que por eso protege este
// campo de cualquier escritura de cliente).
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { withCallableObservability } from '../lib/observability/withObservability.js'

interface ClaimInvitationPersonInput {
  eventId: string
  guestId: string
  // 0 = invitado principal (mismo slot que GuestData.guestUid). 1..N =
  // companions[i-1] (mismo esquema de índices que presentIndices/
  // mapGuestForResponse) — nunca el id de un documento, `companions` no
  // tiene uno propio.
  personIndex: number
}

function companionsCountOf(data: FirebaseFirestore.DocumentData): number {
  const companions = data.companions
  if (Array.isArray(companions)) return companions.length
  // Formato legacy (invitados de antes del array de acompañantes con
  // nombre, ver el mismo fallback en functions/src/checkin/shared.ts):
  // un número plano de acompañantes sin identidad propia — ninguno de esos
  // índices es reclamable (no hay nombre que mostrar en el selector), pero
  // sí deben contar para no aceptar un personIndex fuera de rango.
  if (typeof companions === 'number' && companions > 0) return companions
  return 0
}

// timeoutSeconds bajo: una sola transacción de un documento, sin llamadas
// externas — mismo criterio que el resto de las Callables de autoservicio
// del invitado (setGuestPaymentStatus, checkInGuest).
export const claimInvitationPerson = onCall<ClaimInvitationPersonInput>({ timeoutSeconds: 20 }, (request) =>
  withCallableObservability(request, 'claimInvitationPerson', async (ctx) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    }
    const { eventId, guestId, personIndex } = request.data || {}
    const uid = request.auth.uid
    ctx.addContext({ uid, eventId, guestId })
    if (!eventId || !guestId || typeof personIndex !== 'number' || !Number.isInteger(personIndex) || personIndex < 0) {
      throw new HttpsError('invalid-argument', 'Faltan datos para vincular esta invitación.')
    }

    const db = getFirestore()
    const guestRef = db.collection('events').doc(eventId).collection('guests').doc(guestId)

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(guestRef)
      if (!snap.exists) {
        throw new HttpsError('not-found', 'La invitación no existe.')
      }
      const data = snap.data()!
      if (personIndex > companionsCountOf(data)) {
        throw new HttpsError('invalid-argument', 'Esa persona no existe en esta invitación.')
      }

      if (personIndex === 0) {
        const currentUid = (data.guestUid as string | null | undefined) ?? null
        if (currentUid === uid) return // ya era suyo — idempotente, mismo criterio que claimGuestOwnership
        if (currentUid) {
          throw new HttpsError('already-exists', 'Esta persona ya fue reclamada por otra cuenta.')
        }
        tx.update(guestRef, { guestUid: uid })
        return
      }

      const claims = (data.companionClaims && typeof data.companionClaims === 'object')
        ? data.companionClaims as Record<string, string>
        : {}
      const key = String(personIndex)
      const currentUid = claims[key] ?? null
      if (currentUid === uid) return // idempotente
      if (currentUid) {
        throw new HttpsError('already-exists', 'Esta persona ya fue reclamada por otra cuenta.')
      }
      // Notación de punto: escribe SOLO esa clave del mapa, sin pisar el
      // resto de companionClaims (equivalente a un merge de un solo campo
      // anidado) — misma razón por la que esta validación no es expresable
      // como regla de Firestore, ver el comentario de archivo.
      tx.update(guestRef, { [`companionClaims.${key}`]: uid })
    })

    return { ok: true }
  }),
)
