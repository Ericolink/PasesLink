// Dispara el procesamiento de una campaña de mensajería masiva apenas se
// crea (events/{eventId}/messageCampaigns, encolada desde
// MassMessageComposer.tsx vía src/firebase/messageCampaigns.ts) —
// reemplaza scripts/send-mass-messages.mjs (poll cada 10 min), ver
// NOTIFICATIONS_CONSOLIDATION_ARCHITECTURE.md Fase 3. No hace falta un
// paso previo de "reclamar" el documento vía transacción (el script
// original lo tenía para que dos corridas de cron superpuestas no
// procesaran la misma campaña dos veces) — acá el dedup por invitado vía
// sendLog.create() en processMessageCampaign ya cubre los reintentos
// at-least-once del trigger, mismo criterio que triggers/onNotificationQueued.ts.
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { processMessageCampaign, type MessageCampaign } from '../messaging/campaign.js'
import { brevoApiKey, brevoSenderEmail } from '../lib/secrets.js'
import { withTriggerObservability } from '../lib/observability/withObservability.js'

// timeoutSeconds al máximo permitido para triggers de Firestore (540s):
// processMessageCampaign manda un email por destinatario, secuencial, sin
// tope explícito más allá de MASS_MESSAGE_MAX_RECIPIENTS (2000, ver
// src/utils/validation.ts) — una campaña a varios miles de destinatarios
// puede no alcanzar a completar en una sola invocación (limitación conocida,
// no resoluble solo con configuración: necesitaría trocear el envío en
// varias invocaciones para escalar sin techo). maxInstances bajo: acción
// poco frecuente (una por campaña que arma el organizador).
export const onMessageCampaignQueued = onDocumentCreated(
  {
    document: 'events/{eventId}/messageCampaigns/{campaignId}',
    secrets: [brevoApiKey, brevoSenderEmail],
    timeoutSeconds: 540,
    maxInstances: 5,
  },
  (event) => withTriggerObservability(event, 'onMessageCampaignQueued', async () => {
    const snap = event.data
    if (!snap) return
    await processMessageCampaign(getFirestore(), snap.ref, snap.data() as MessageCampaign)
  }),
)
