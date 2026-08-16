// Desactivado a pedido del organizador (evento debut, 2026-08-16): este
// trigger reaccionaba a que se liberara capacidad (peopleCount bajaba, o el
// organizador subía `capacity` con gente todavía esperando) ofertando
// automáticamente ese lugar a la fila vía runCascade — pero eso competía
// contra el propio organizador cuando liberaba capacidad A PROPÓSITO para
// otra cosa (ej. mover a alguien a la waitlist para poder agregarle
// acompañantes a otro invitado ya confirmado): la cascada se adelantaba y
// reservaba el lugar para la fila antes de que la segunda operación
// alcanzara a usarlo, resultando en "No hay lugar suficiente" pese a que el
// organizador acababa de liberarlo él mismo.
//
// La promoción desde la waitlist es ahora 100% manual, vía "Pasar a la
// lista normal" (assignWaitlistSpot.ts) — el organizador ve el lugar
// liberado en el panel de Waitlist y decide a quién dárselo, sin carrera
// contra una asignación automática. Para reactivar la cascada automática,
// restaurar el body de abajo a partir de la versión anterior de este
// archivo (usaba runCascade de ../waitlist/cascade.js, que sigue intacto y
// probado — ver cascade.test.ts).
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { withTriggerObservability } from '../lib/observability/withObservability.js'

export const onCapacityFreed = onDocumentUpdated(
  { document: 'events/{eventId}' },
  (event) => withTriggerObservability(event, 'onCapacityFreed', async () => {
    return
  }),
)
