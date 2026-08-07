// Mantiene platformStats/funnel.usersWithEventsCount — cuántos usuarios
// ÚNICOS crearon al menos un evento (paso "Creó su primer evento" del
// funnel del Centro de Control, ver src/firebase/platformFunnel.ts).
// Firestore no tiene distinct-count nativo, así que este número no se
// puede calcular con una agregación server-side como el resto de las
// métricas de admin.ts — hace falta mantenerlo, y el único punto que sabe
// con certeza "es la primera vez que este uid crea un evento" es este
// trigger.
//
// Dedup vía `.create()` sobre un doc marcador por uid (mismo patrón de
// idempotencia que sendWelcomeEmailForNewUser en onUserCreated.ts) en vez
// de una count query de "cuántos eventos tiene este uid": una count query
// no es atómica frente a dos eventos creados en paralelo por el mismo
// usuario (ambos podrían leer count==0 antes de que el otro escriba), el
// `.create()` sí — el segundo intento simplemente falla porque el doc ya
// existe, sin necesidad de transacción.
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'
import { withTriggerObservability } from '../lib/observability/withObservability.js'

interface NewEventData {
  ownerId?: string
}

// Extraída de onEventCreated para poder testearla contra el emulador de
// Firestore sin levantar el emulador de Functions (mismo criterio que
// sendWelcomeEmailForNewUser en onUserCreated.ts).
export async function recordFirstEventForFunnel(db: Firestore, ownerId: string, eventId: string): Promise<void> {
  const markerRef = db.doc(`platformStats/funnelMarkers/users/${ownerId}`)
  try {
    await markerRef.create({ firstEventId: eventId, createdAt: FieldValue.serverTimestamp() })
  } catch {
    return // ya tenía un evento previo — no es su "primer evento", no duplicar el conteo
  }

  await db.doc('platformStats/funnel').set(
    { usersWithEventsCount: FieldValue.increment(1) },
    { merge: true },
  )
}

export const onEventCreated = onDocumentCreated(
  { document: 'events/{eventId}', maxInstances: 10 },
  (event) => withTriggerObservability(event, 'onEventCreated', async () => {
    const snap = event.data
    if (!snap) return
    const ownerId = (snap.data() as NewEventData).ownerId
    if (!ownerId) return

    await recordFirstEventForFunnel(getFirestore(), ownerId, event.params.eventId)
  }),
)
