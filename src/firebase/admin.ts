import {
  addDoc,
  collection,
  doc,
  getAggregateFromServer,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  sum,
  Timestamp,
  where,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import { mapEvent } from './events'
import { withListenerReporting } from '../lib/sentry'
import type { EventData } from '../types'

export interface AdminUser {
  id: string
  email: string | null
  displayName: string | null
  createdAt: number
}

export type AdminAuditAction = 'event_status_change' | 'event_delete'

export interface AdminAuditLogEntry {
  id: string
  adminUid: string
  adminEmail: string | null
  action: AdminAuditAction
  targetType: 'event'
  targetId: string
  targetName: string
  meta?: string
  createdAt: number
}

// Admin = tener un documento propio en /admins/{uid} (ver firestore.rules
// para por qué no se usa customClaims: requeriría Cloud Functions, y este
// proyecto está deliberadamente en el plan Spark/gratis). Alta de admins:
// a mano desde la consola de Firebase, nunca desde la app.
export async function checkIsAdmin(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'admins', uid))
  return snap.exists()
}

// Auditoría de escalabilidad (F10): antes eran listeners EN VIVO sin
// `limit()` (subscribeToAllEvents/subscribeToAllUsers) — cualquier escritura
// a CUALQUIER evento/usuario de TODA la plataforma (no solo los que el admin
// mira) reenviaba la colección completa a cada admin con el panel abierto.
// Los totales de las tarjetas de resumen ya no dependían de esto (ver
// getEventStats/getUserStats, agregaciones server-side más abajo), pero la
// tabla de eventos (búsqueda por nombre/ubicación/email del dueño, cruce con
// usersById) sigue necesitando el conjunto completo en memoria para filtrar
// — reescribir esa búsqueda como query server-side (ej. un índice de
// búsqueda tipo Algolia) es un esfuerzo mayor, pendiente como su propia
// fase. Lo que SÍ se resuelve acá: ya no es un listener — es una lectura
// puntual, refrescada a pedido desde AdminDashboard.tsx (mismo patrón que
// getAllGuests en guests.ts) y automáticamente después de cada acción que
// cambia un evento (archivar/cancelar/borrar) desde este mismo panel.
export async function getAllEvents(): Promise<EventData[]> {
  const q = query(collection(db, 'events'), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => mapEvent(d.id, d.data()))
}

export async function getAllUsers(): Promise<AdminUser[]> {
  const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      email: (data.email as string) || null,
      displayName: (data.displayName as string) || null,
      createdAt: toMillis(data.createdAt),
    }
  })
}

export interface AdminEventStats {
  totalEvents: number
  activeEvents: number
  totalGuests: number
  totalPeople: number
  totalCheckins: number
}

// Reemplaza el patrón anterior (descargar TODOS los eventos solo para sumar
// 5 números en el cliente) por agregaciones server-side: cada
// getCountFromServer/getAggregateFromServer cuesta 1 lectura sin importar
// cuántos documentos matcheen, en vez de 1 lectura POR documento. Las
// tarjetas de resumen del panel ya no dependen de subscribeToAllEvents.
export async function getEventStats(): Promise<AdminEventStats> {
  const eventsCol = collection(db, 'events')
  const [totalSnap, activeSnap, sumsSnap] = await Promise.all([
    getCountFromServer(eventsCol),
    getCountFromServer(query(eventsCol, where('status', '==', 'active'))),
    getAggregateFromServer(eventsCol, {
      totalGuests: sum('guestCount'),
      totalPeople: sum('peopleCount'),
      totalCheckins: sum('checkedInCount'),
    }),
  ])
  return {
    totalEvents: totalSnap.data().count,
    activeEvents: activeSnap.data().count,
    totalGuests: sumsSnap.data().totalGuests,
    totalPeople: sumsSnap.data().totalPeople,
    totalCheckins: sumsSnap.data().totalCheckins,
  }
}

export interface AdminUserStats {
  totalUsers: number
  newUsers7d: number
}

// `sinceMs`: borde de la ventana de "nuevos en 7 días", calculado por quien
// llama (mismo criterio que el `now` fijado al montar que ya usaba
// AdminDashboard, para que el número no cambie de un render a otro dentro de
// la misma sesión).
export async function getUserStats(sinceMs: number): Promise<AdminUserStats> {
  const usersCol = collection(db, 'users')
  const [totalSnap, newSnap] = await Promise.all([
    getCountFromServer(usersCol),
    getCountFromServer(query(usersCol, where('createdAt', '>=', Timestamp.fromMillis(sinceMs)))),
  ])
  return {
    totalUsers: totalSnap.data().count,
    newUsers7d: newSnap.data().count,
  }
}

// No usa serverTimestamp() para createdAt del payload local, pero sí lo
// escribe en Firestore — la bitácora se lee vía subscribeToAdminAuditLog,
// nunca se necesita el valor recién creado en el mismo tick.
export async function logAdminAction(entry: {
  adminUid: string
  adminEmail: string | null
  action: AdminAuditAction
  targetType: 'event'
  targetId: string
  targetName: string
  meta?: string
}): Promise<void> {
  await addDoc(collection(db, 'adminAuditLog'), {
    ...entry,
    createdAt: serverTimestamp(),
  })
}

export function subscribeToAdminAuditLog(
  callback: (entries: AdminAuditLogEntry[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'adminAuditLog'), orderBy('createdAt', 'desc'), limit(50))
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            adminUid: data.adminUid as string,
            adminEmail: (data.adminEmail as string) || null,
            action: data.action as AdminAuditAction,
            targetType: data.targetType as 'event',
            targetId: data.targetId as string,
            targetName: data.targetName as string,
            meta: (data.meta as string) || undefined,
            createdAt: toMillis(data.createdAt),
          }
        }),
      )
    },
    withListenerReporting('admin.auditLog', onError),
  )
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}
