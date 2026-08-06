// Marca al evento padre como countersDirty cada vez que cambia un
// documento de invitado (alta, edición, borrado, check-in/out, pago, RSVP —
// cualquier camino, cliente o Cloud Function). No recalcula nada acá mismo
// a propósito: si lo hiciera, un alta masiva de 50 invitados (addGuestsBulk)
// dispararía 50 recálculos completos de guests/ en paralelo. En cambio,
// solo deja una marca (con timestamp) que el barrido liviano
// (scheduled/reconcileDirtyGuestCounters.ts, cada 10 min) recoge una sola
// vez, sin importar cuántas escrituras se acumularon en el medio — ver
// reconciliation/reconcileGuestCounters.ts para el porqué del timestamp
// (evita que ese barrido pise una escritura más nueva con datos ya
// obsoletos).
//
// Sin test directo — mismo criterio que los otros triggers del proyecto
// (onCapacityFreed, onAdminWritten): dispararlo de verdad requiere el
// emulador de Functions, que test:functions no levanta. Es demasiado
// delgado (un solo merge) para justificar extraer una función pura aparte
// solo para poder testearlo.
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { withTriggerObservability } from '../lib/observability/withObservability.js'

// El trigger de mayor frecuencia del proyecto — dispara en CADA escritura
// de guests/{guestId} (alta, edición, check-in/out, pago, RSVP, y cada fila
// de una importación masiva de hasta 2000 invitados). memory/timeoutSeconds
// bajos porque es un solo merge sin lecturas; maxInstances por encima del
// default global para no generar cola/backlog durante el fan-out de una
// importación masiva o un alta en lote.
export const onGuestWritten = onDocumentWritten(
  { document: 'events/{eventId}/guests/{guestId}', memory: '128MiB', timeoutSeconds: 10, maxInstances: 50 },
  (event) => withTriggerObservability(event, 'onGuestWritten', async () => {
    const db = getFirestore()
    await db
      .collection('events')
      .doc(event.params.eventId)
      .set({ countersDirty: true, countersDirtyAt: FieldValue.serverTimestamp() }, { merge: true })
  }),
)
