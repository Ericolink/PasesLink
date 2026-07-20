import { collectionGroup, doc, getDoc, getDocs, limit, query, updateDoc, where } from 'firebase/firestore'
import { db } from './config'
import { saveUserInvitation } from './userProfile'
import type { TemplateId } from '../types'

// Cuántos guestContacts distintos puede encontrar (y reclamar) una sola
// pasada — una persona real no debería tener más que un puñado de
// invitaciones bajo el mismo email; el tope es solo para no dejar la
// consulta sin cota ante datos anómalos.
const RECLAIM_MATCH_LIMIT = 25

// Reconstruye lo mínimo de EventData que necesita saveUserInvitation (ver
// UserInvitation en src/types) a partir de un doc de events/{eventId} ya
// leído — evita traer firebase/events.ts (con su propia validación Zod
// completa) para leer 6 campos. Mismos defaults que mapEvent (events.ts) —
// NO `|| undefined`: Firestore rechaza escribir un campo con valor
// `undefined` (a diferencia de mapEvent, esto lee el doc crudo, sin pasar
// por su normalización habitual).
function pickInvitationEventFields(data: Record<string, unknown>) {
  return {
    eventName: data.name as string,
    eventDate: data.date as string,
    eventLocation: data.location as string,
    eventCoverImage: (data.coverImage as string) || '',
    eventTemplateId: (data.templateId as TemplateId) || 'default',
    eventAccentColor: (data.accentColor as string) || '',
  }
}

// Recuperación entre dispositivos: encuentra invitaciones que esta cuenta
// NUNCA abrió (no hay qrToken guardado en ningún lado del navegador actual)
// cruzando el email VERIFICADO de Firebase Auth contra guestContacts de
// TODOS los eventos (collectionGroup — ver el índice en
// firestore.indexes.json). Es el mecanismo que resuelve el caso reportado:
// un invitado se registra desde el navegador integrado de Instagram, ese
// navegador borra su almacenamiento antes de que vuelva a abrir el pase, y
// después crea/usa su cuenta de PaseLink desde Chrome — sin esto, esa
// invitación quedaba huérfana para siempre (ver guestUid en firestore.rules,
// que exige email_verified para este camino).
//
// Siempre en minúsculas: Firestore compara el filtro de una query por
// igualdad EXACTA de string (no case-insensitive), y firestore.rules exige
// que la query traiga ese mismo valor para poder demostrar de antemano que
// ningún resultado puede pertenecer a otra persona (comparación real:
// `resource.data.email == request.auth.token.email.lower()` — el `.lower()`
// va del lado de la cuenta, un único valor por request; aplicarlo al campo
// del documento en cambio rompe esa demostración, verificado con el
// emulador). Los registros escritos desde este cambio en adelante ya
// guardan `email` en minúsculas (ver capacity.ts/guests.ts) — un
// guestContacts histórico con otra capitalización no matchea por esta vía,
// limitación conocida y aceptada (sin migración: no hay backend/Cloud
// Functions en este proyecto para reescribir datos viejos).
//
// Devuelve cuántas invitaciones nuevas quedaron vinculadas (0 si no hay
// nada que reclamar, o si ya estaban todas vinculadas antes).
export async function reclaimInvitationsByEmail(uid: string, email: string): Promise<number> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return 0

  const q = query(
    collectionGroup(db, 'guestContacts'),
    where('email', '==', normalized),
    limit(RECLAIM_MATCH_LIMIT),
  )
  let snap
  try {
    snap = await getDocs(q)
  } catch (err) {
    console.error('Error buscando invitaciones por email:', err)
    return 0
  }

  let claimed = 0
  for (const contactDoc of snap.docs) {
    const eventId = contactDoc.ref.parent.parent?.id
    if (!eventId) continue
    const guestId = contactDoc.id

    try {
      const guestRef = doc(db, 'events', eventId, 'guests', guestId)
      const guestSnap = await getDoc(guestRef)
      if (!guestSnap.exists()) continue
      const guestData = guestSnap.data()
      const existingUid = (guestData.guestUid as string) || null
      if (existingUid && existingUid !== uid) continue // ya es de otra cuenta

      if (existingUid !== uid) {
        await updateDoc(guestRef, { guestUid: uid })
      }

      const eventSnap = await getDoc(doc(db, 'events', eventId))
      if (!eventSnap.exists()) continue
      const eventData = eventSnap.data()

      await saveUserInvitation(uid, {
        eventId,
        ...pickInvitationEventFields(eventData),
        guestName: guestData.isGroup ? (guestData.name as string) : `${guestData.name as string} ${(guestData.lastName as string) || ''}`.trim(),
        qrToken: guestData.qrToken as string,
        type: 'walkin',
      })
      claimed++
    } catch (err) {
      // Carrera con otra reclamación, o el guest ya no existe — no debe
      // tumbar el resto de la pasada.
      console.error('No se pudo reclamar una invitación encontrada por email:', err)
    }
  }

  return claimed
}
