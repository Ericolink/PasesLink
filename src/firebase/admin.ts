import { collection, doc, getDoc, onSnapshot, orderBy, query } from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import { mapEvent } from './events'
import type { EventData } from '../types'

export interface AdminUser {
  id: string
  email: string | null
  displayName: string | null
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

// TODO Fase 4+: sin `limit()` a propósito. AdminDashboard.tsx usa
// `events.length`/`users.length` como "Eventos totales"/"Clientes" (métricas
// reales del negocio, no de una página) y cuenta eventos por organizador
// sobre el array completo. Un `limit(100)` haría que esos totales queden
// silenciosamente truncados y mal en cuanto el volumen real supere el
// límite — exactamente el tipo de bug "dato incorrecto sin aviso" que es
// peor que el problema que se buscaba resolver. Es un panel de un solo
// admin (no público ni de alto tráfico, a diferencia del muro), así que el
// riesgo de costo es bajo hoy; agregar límite real requeriría separar la
// query de la tabla (paginada) de un conteo agregado para los totales.
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
    onError,
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
    onError,
  )
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}
