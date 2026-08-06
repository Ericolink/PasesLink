// Expone la misma aggregate query que ya usa promote.ts/cascade.ts (Admin
// SDK, sin restricción de rules) para que el cliente pueda hacer el mismo
// chequeo best-effort antes de sus propias transacciones de alta (ver
// fetchOfferedWaitlistCount en src/firebase/attendeeLimit.ts). Se resolvió
// como Callable Function en vez de una aggregate query directa desde el
// cliente porque `allow list` en firestore.rules está escrito en términos
// de `request.query.limit` (mismo patrón que ya usa `guests` para el acceso
// por token) — una query de agregación no lleva `limit`, así que esa regla
// no aplica limpio ahí. No devuelve datos sensibles (ningún nombre/
// contacto, solo un número), así que no hace falta autenticación.
import { onCall } from 'firebase-functions/v2/https'
import { AggregateField, getFirestore } from 'firebase-admin/firestore'
import { withCallableObservability } from '../lib/observability/withObservability.js'

interface GetOfferedWaitlistCountInput {
  eventId: string
}

// Sin memory/timeoutSeconds propios (hereda 256MiB/60s del default global,
// ver index.ts) aunque el trabajo real es una sola aggregate query: bajarlos
// a 128MiB/10s rompió el despliegue de otra función de este mismo codebase
// (onGuestWritten) — con un solo codebase, el contenedor de CUALQUIER
// función carga el módulo completo del proyecto al arrancar, y 128MiB no le
// alcanzaba ni para terminar de cargar antes del healthcheck de Cloud Run.
export const getOfferedWaitlistCount = onCall<GetOfferedWaitlistCountInput>((request) =>
  withCallableObservability(request, 'getOfferedWaitlistCount', async (ctx): Promise<{ count: number }> => {
    const eventId = request.data?.eventId
    ctx.addContext({ eventId })
    if (!eventId) return { count: 0 }

    const db = getFirestore()
    const snap = await db.collection('events').doc(eventId).collection('waitlist')
      .where('status', '==', 'offered')
      .aggregate({ total: AggregateField.sum('partySize') })
      .get()

    return { count: snap.data().total ?? 0 }
  }),
)
