import {
  addDoc,
  collection,
  doc,
  getAggregateFromServer,
  getCountFromServer,
  getDoc,
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

// TODO Fase 6+: sin `limit()` a propósito todavía. Los totales de
// AdminDashboard.tsx ya NO dependen de esta descarga completa (ver
// getEventStats/getUserStats, agregaciones server-side más abajo) — pero la
// tabla de eventos (búsqueda por nombre/ubicación/email del dueño, cruce con
// usersById) sigue necesitando el conjunto completo, así que este listener
// se queda sin límite por ahora. Paginar la tabla en sí requeriría rehacer
// esa búsqueda como query server-side en vez de un filtro en memoria —
// esfuerzo mayor, pendiente como su propia fase.
export function subscribeToAllEvents(
  callback: (events: EventData[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'events'), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((d) => mapEvent(d.id, d.data())))
    },
    withListenerReporting('admin.allEvents', onError),
  )
}

export function subscribeToAllUsers(
  callback: (users: AdminUser[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            email: (data.email as string) || null,
            displayName: (data.displayName as string) || null,
            createdAt: toMillis(data.createdAt),
          }
        }),
      )
    },
    withListenerReporting('admin.allUsers', onError),
  )
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
