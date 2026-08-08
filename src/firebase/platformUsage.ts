import { collection, collectionGroup, getAggregateFromServer, getCountFromServer, query, sum, where, type Query } from 'firebase/firestore'
import { db } from './config'

// Cierra la brecha que dejaba el Centro de Control (getEventStats/
// getUserStats/getFunnelStats en admin.ts y platformFunnel.ts): invitados,
// check-ins, RSVP, lista de espera y concesiones a nivel PLATAFORMA (no por
// evento, eso ya existe en Reports gateado por resolveEventPermissions). Todo
// vía agregaciones server-side, nunca recorriendo `guests` — reutiliza los
// contadores que cada evento ya mantiene (ver
// functions/src/lib/counters/config.ts) en vez de sumarlos a mano.
//
// `null` = "no se pudo calcular esta vuelta" (no "cero"): lista de
// espera/concesiones dependen de una regla de firestore.rules que puede no
// estar deployada todavía (ver comentario junto a esas match en
// firestore.rules) — un permission-denied puntual no debe mostrar un 0
// engañoso.
export interface PlatformUsageStats {
  activeEvents: number | null
  cancelledEvents: number | null
  archivedEvents: number | null
  totalGuests: number | null
  totalCheckedIn: number | null
  rsvpYes: number | null
  rsvpNo: number | null
  rsvpPending: number | null
  concessionsEnabledEvents: number | null
  totalConcessionOrders: number | null
  activeWaitlistEntries: number | null
}

// Mismo criterio que resolveSignal en
// functions/src/scheduled/refreshPlatformHealth.ts: cada métrica se resuelve
// por separado, así que si una falla (típicamente lista de
// espera/concesiones antes de deployar la regla nueva) las demás igual se
// muestran, en vez de que un solo permission-denied tumbe toda la sección.
async function resolveCount(name: string, run: () => Promise<number>): Promise<number | null> {
  try {
    return await run()
  } catch (err) {
    console.error(`platformUsage: no se pudo calcular "${name}"`, err)
    return null
  }
}

function countOf(q: Query): Promise<number> {
  return getCountFromServer(q).then((snap) => snap.data().count)
}

// sum('guestCount') + sum('checkedInCount') + ... en UNA sola
// getAggregateFromServer exige un índice compuesto que no existe (Firestore
// lo pide recién al ejecutar la query, con un link para crearlo). En vez de
// depender de ese deploy extra, cada contador va en su propia query — sigue
// siendo una agregación server-side barata (1 lectura facturada por cada
// 1000 entradas de índice), solo que son 5 lecturas en vez de 1.
function sumOf(field: string): Promise<number> {
  const eventsCol = collection(db, 'events')
  return getAggregateFromServer(eventsCol, { total: sum(field) }).then((snap) => snap.data().total)
}

export async function getPlatformUsageStats(): Promise<PlatformUsageStats> {
  const eventsCol = collection(db, 'events')

  const [
    activeEvents,
    cancelledEvents,
    archivedEvents,
    totalGuests,
    totalCheckedIn,
    rsvpYes,
    rsvpNo,
    rsvpPending,
    concessionsEnabledEvents,
    totalConcessionOrders,
    activeWaitlistEntries,
  ] = await Promise.all([
    resolveCount('activeEvents', () => countOf(query(eventsCol, where('status', '==', 'active')))),
    resolveCount('cancelledEvents', () => countOf(query(eventsCol, where('status', '==', 'cancelled')))),
    resolveCount('archivedEvents', () => countOf(query(eventsCol, where('status', '==', 'archived')))),
    resolveCount('totalGuests', () => sumOf('guestCount')),
    resolveCount('totalCheckedIn', () => sumOf('checkedInCount')),
    resolveCount('rsvpYes', () => sumOf('rsvpYesCount')),
    resolveCount('rsvpNo', () => sumOf('rsvpNoCount')),
    resolveCount('rsvpPending', () => sumOf('rsvpPendingCount')),
    resolveCount('concessionsEnabledEvents', () => countOf(query(eventsCol, where('concessions.enabled', '==', true)))),
    resolveCount('totalConcessionOrders', () => countOf(collectionGroup(db, 'concessionsOrders'))),
    resolveCount('activeWaitlistEntries', () => countOf(query(collectionGroup(db, 'waitlist'), where('status', 'in', ['waiting', 'offered'])))),
  ])

  return {
    activeEvents,
    cancelledEvents,
    archivedEvents,
    totalGuests,
    totalCheckedIn,
    rsvpYes,
    rsvpNo,
    rsvpPending,
    concessionsEnabledEvents,
    totalConcessionOrders,
    activeWaitlistEntries,
  }
}
