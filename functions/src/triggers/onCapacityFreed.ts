// Reacciona cuando se libera capacidad, reactivando la lista de espera. Dos
// casos: (a) peopleCount baja — todo camino que libera un lugar
// (deleteGuest, auto-cancelación, rechazo de pago) ya lo decrementa de
// forma atómica, invariante ya establecida y probada en el código de
// cliente; (b) el organizador SUBE `capacity` con gente todavía esperando
// — sin este segundo caso, aumentar el cupo no ofertaría nada hasta la
// próxima corrida del barrido de vencimiento (hasta 5 min de demora
// innecesaria para algo que el organizador espera que se sienta
// instantáneo). En ambos casos, este trigger es la ÚNICA implementación de
// "cuándo ofertar" — ningún código de cliente necesita acordarse de
// llamarlo (ver §1 de WAITLIST_RECONFIRMATION_ARCHITECTURE.md).
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { runCascade } from '../waitlist/cascade.js'
import { sendOfferEmail } from '../waitlist/notify.js'
import { brevoApiKey, brevoSenderEmail } from '../lib/secrets.js'
import { withTriggerObservability } from '../lib/observability/withObservability.js'

// timeoutSeconds por encima del default: la cascada puede promover a varias
// entradas de la fila de espera de una sola vez (p.ej. el organizador borra
// muchos invitados juntos), y sendOfferEmail hace una llamada HTTP real a
// Brevo por cada una.
export const onCapacityFreed = onDocumentUpdated(
  { document: 'events/{eventId}', secrets: [brevoApiKey, brevoSenderEmail], timeoutSeconds: 120, maxInstances: 10 },
  (event) => withTriggerObservability(event, 'onCapacityFreed', async (ctx) => {
    const before = event.data?.before.data()
    const after = event.data?.after.data()
    if (!before || !after) return
    if (!after.attendeeLimitEnabled) return

    const peopleCountDecreased = (after.peopleCount ?? 0) < (before.peopleCount ?? 0)
    const capacityIncreased = (after.capacity ?? 0) > (before.capacity ?? 0)
    if (!peopleCountDecreased && !capacityIncreased) return

    const db = getFirestore()
    const eventId = event.params.eventId
    const outcome = await runCascade(db, eventId)
    if (outcome.promoted.length > 0) {
      ctx.logger.info('Cascada de lista de espera ofertó lugares liberados', { eventId, promotedCount: outcome.promoted.length })
    }
    for (const promotion of outcome.promoted) {
      await sendOfferEmail(db, eventId, promotion.entryId, promotion.entry)
    }
  }),
)
