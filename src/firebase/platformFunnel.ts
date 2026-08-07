import { collection, doc, getCountFromServer, getDoc, query, where } from 'firebase/firestore'
import { db } from './config'

// Funnel del Centro de Control, redefinido con pasos 100% reales (ver
// docs/platform-health-roadmap.md para por qué "Publicó evento" y
// "Compartió" quedan fuera: EventStatus no tiene draft/publicado, y
// "compartió" no está instrumentado en ningún lado). Los pasos 3-5 cuentan
// sobre TODOS los eventos, no solo los activos — el funnel mide si el
// organizador alguna vez llegó a ese hito, no si el evento sigue vivo hoy;
// cada uno es una única desigualdad sobre un campo, cubierta por el índice
// automático de campo simple (sin índice compuesto nuevo).
export interface FunnelStats {
  registered: number
  createdFirstEvent: number
  addedGuests: number
  receivedRsvps: number
  firstCheckin: number
}

export async function getFunnelStats(): Promise<FunnelStats> {
  const eventsCol = collection(db, 'events')
  const [registeredSnap, funnelDocSnap, addedGuestsSnap, receivedRsvpsSnap, firstCheckinSnap] = await Promise.all([
    getCountFromServer(collection(db, 'users')),
    // Mantenido por functions/src/triggers/onEventCreated.ts — Firestore no
    // tiene distinct-count nativo, así que "usuarios únicos con ≥1 evento"
    // no se puede calcular con una agregación server-side como el resto.
    getDoc(doc(db, 'platformStats', 'funnel')),
    getCountFromServer(query(eventsCol, where('guestCount', '>', 0))),
    getCountFromServer(query(eventsCol, where('rsvpYesCount', '>', 0))),
    getCountFromServer(query(eventsCol, where('checkedInCount', '>', 0))),
  ])

  return {
    registered: registeredSnap.data().count,
    createdFirstEvent: (funnelDocSnap.data()?.usersWithEventsCount as number) || 0,
    addedGuests: addedGuestsSnap.data().count,
    receivedRsvps: receivedRsvpsSnap.data().count,
    firstCheckin: firstCheckinSnap.data().count,
  }
}
