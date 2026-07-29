import { collection, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import type { CheckinLog } from '../types'
import { CheckinSchema, warnIfInvalidShape } from '../types/schemas'
import { withListenerReporting } from '../lib/sentry'

function mapCheckin(id: string, data: Record<string, unknown>): CheckinLog {
  const checkin: CheckinLog = {
    id,
    guestId: data.guestId as string,
    guestName: data.guestName as string,
    type: (data.type as CheckinLog['type']) || 'check_in',
    exitKind: (data.exitKind as CheckinLog['exitKind']) || undefined,
    reentry: (data.reentry as boolean) || undefined,
    reason: (data.reason as CheckinLog['reason']) || undefined,
    scannedBy: data.scannedBy as string,
    scannedByEmail: (data.scannedByEmail as string) || null,
    timestamp: toMillis(data.timestamp),
  }
  warnIfInvalidShape(CheckinSchema, 'Checkin', checkin)
  return checkin
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}

// Antes era un listener permanente (onSnapshot): en un evento con
// reingresos frecuentes y Reports abierto durante horas de puerta activa,
// eso redescargaba un delta por cada escaneo mientras la pantalla siguiera
// abierta, sin ningún techo — el patrón de lectura más costoso de la app
// (ver auditoría). El historial de check-ins no necesita estar "en vivo" en
// el mismo sentido que el conteo de asistencia (que sigue actualizándose en
// tiempo real vía event.checkedInCount/occupancyCount, alimentado por
// useEvent — eso no cambia). "Llegadas por hora" agrupa por hora del día
// sobre el historial COMPLETO del evento, así que un límite parcial daría un
// gráfico incorrecto sin avisar en vez de simplemente más lento — se prefirió
// una carga puntual completa, con un botón "Actualizar" para refrescar bajo
// demanda, sobre truncar silenciosamente el conteo real. Mismo criterio ya
// usado por getGuestCheckins (historial de un invitado) más abajo.
export async function getCheckins(eventId: string): Promise<CheckinLog[]> {
  const q = query(collection(db, 'events', eventId, 'checkins'), orderBy('timestamp', 'asc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => mapCheckin(d.id, d.data()))
}

// A diferencia de getCheckins (lectura puntual, ver comentario arriba): esta
// SÍ es un listener en vivo, pero acotado con limit() — no repite el patrón
// costoso que ese comentario describe porque nunca vuelve a bajar la
// colección completa, solo los últimos `limitCount`. Pensada para Anfitrión
// en Vivo (feed de ingresos/rechazos recientes) y reutilizable a futuro por
// cualquier pantalla que solo necesite "lo último que pasó", no el historial
// entero.
export function subscribeToRecentCheckins(
  eventId: string,
  limitCount: number,
  callback: (checkins: CheckinLog[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'events', eventId, 'checkins'),
    orderBy('timestamp', 'desc'),
    limit(limitCount),
  )
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => mapCheckin(d.id, d.data()))),
    withListenerReporting('reports.recentCheckins', onError),
  )
}

// Historial de accesos de UN invitado (entradas, salidas y reingresos), para
// el panel de administración (GuestList). Consulta puntual (no listener) —
// se pide bajo demanda al expandir el historial de un invitado puntual, no
// hace falta tenerla en vivo como el resto de las estadísticas del dashboard.
export async function getGuestCheckins(eventId: string, guestId: string): Promise<CheckinLog[]> {
  const q = query(
    collection(db, 'events', eventId, 'checkins'),
    where('guestId', '==', guestId),
    orderBy('timestamp', 'asc'),
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => mapCheckin(d.id, d.data()))
}
