// Webhook de Meta para WhatsApp Business Platform — necesario para conocer
// estados de entrega (§12/§13 del issue de integración). Dos responsabilidades:
//
// 1. GET: verificación de suscripción (Meta la exige una vez, al configurar
//    la URL del webhook en Meta Business Manager) — responde el
//    `hub.challenge` solo si `hub.verify_token` coincide con el secret
//    propio configurado (no lo emite Meta, lo define quien configura el
//    webhook — ver lib/secrets.ts).
// 2. POST: notificaciones reales (mensaje enviado/entregado/leído/fallido).
//    Cada payload viene firmado (header X-Hub-Signature-256, HMAC-SHA256
//    con el App Secret de la app de Meta) — se valida ANTES de leer nada
//    del body, nunca se confía en datos del request sin verificar la firma
//    (§12 del issue: "no confíes únicamente en datos enviados por el
//    cliente").
//
// Funciones puras separadas del handler HTTP para poder testearlas sin
// levantar un request real (mismo criterio que el resto del proyecto:
// lógica de negocio testeable, wrapper de transporte fino).
import { createHmac, timingSafeEqual } from 'node:crypto'
import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'
import { whatsappAppSecret, whatsappWebhookVerifyToken } from '../lib/secrets.js'

export function verifyChallenge(query: Record<string, unknown>, expectedToken: string | undefined): string | null {
  if (!expectedToken) return null
  if (query['hub.mode'] !== 'subscribe') return null
  if (query['hub.verify_token'] !== expectedToken) return null
  const challenge = query['hub.challenge']
  return typeof challenge === 'string' ? challenge : null
}

export function isValidSignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string | undefined): boolean {
  if (!appSecret || !signatureHeader || !signatureHeader.startsWith('sha256=')) return false
  const expectedHex = createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const providedHex = signatureHeader.slice('sha256='.length)
  // Largos distintos = timingSafeEqual lanza en vez de devolver false —
  // se descarta antes de comparar.
  if (expectedHex.length !== providedHex.length) return false
  return timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(providedHex, 'hex'))
}

export type WhatsAppDeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed'

interface MetaStatusUpdate {
  messageId: string
  status: WhatsAppDeliveryStatus
}

// Forma real documentada por Meta:
// entry[].changes[].value.statuses[] = [{id, status, timestamp, recipient_id}]
// Cualquier otra forma (payload de prueba de Meta, tipo distinto de
// notificación) se ignora en vez de fallar — un webhook que tira error 500
// ante un payload inesperado hace que Meta reintente indefinidamente.
export function extractStatusUpdates(payload: unknown): MetaStatusUpdate[] {
  const updates: MetaStatusUpdate[] = []
  const entries = (payload as { entry?: unknown[] })?.entry
  if (!Array.isArray(entries)) return updates

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes
    if (!Array.isArray(changes)) continue
    for (const change of changes) {
      const statuses = (change as { value?: { statuses?: unknown[] } })?.value?.statuses
      if (!Array.isArray(statuses)) continue
      for (const status of statuses) {
        const id = (status as { id?: unknown })?.id
        const statusValue = (status as { status?: unknown })?.status
        if (typeof id === 'string' && ['sent', 'delivered', 'read', 'failed'].includes(statusValue as string)) {
          updates.push({ messageId: id, status: statusValue as WhatsAppDeliveryStatus })
        }
      }
    }
  }
  return updates
}

// `providerMessageId` se graba en sendLog al enviar (ver
// lib/notifyGuestMultiChannel.ts) — es collectionGroup porque el webhook no
// sabe de antemano a qué evento pertenece el mensaje (ver
// firestore.indexes.json, fieldOverride nuevo). No hay `eventId` en el
// payload de Meta, solo el id de mensaje que ya devolvió el envío original.
export async function applyStatusUpdate(db: Firestore, update: MetaStatusUpdate): Promise<void> {
  const snap = await db.collectionGroup('sendLog').where('providerMessageId', '==', update.messageId).limit(1).get()
  if (snap.empty) return
  await snap.docs[0].ref.update({ whatsappDeliveryStatus: update.status })
}

export const whatsappWebhook = onRequest(
  { secrets: [whatsappWebhookVerifyToken, whatsappAppSecret], cors: false },
  async (req, res) => {
    if (req.method === 'GET') {
      const challenge = verifyChallenge(req.query as Record<string, unknown>, process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)
      if (challenge !== null) {
        res.status(200).send(challenge)
        return
      }
      res.status(403).send('Forbidden')
      return
    }

    if (req.method === 'POST') {
      const signature = req.get('X-Hub-Signature-256')
      if (!isValidSignature(req.rawBody, signature, process.env.WHATSAPP_APP_SECRET)) {
        res.status(401).send('Invalid signature')
        return
      }
      const db = getFirestore()
      const updates = extractStatusUpdates(req.body)
      for (const update of updates) {
        await applyStatusUpdate(db, update).catch(() => {})
      }
      // Meta exige 200 rápido para no reintentar de más, incluso si algún
      // update individual no encontró su sendLog (mensaje viejo, evento
      // borrado) — eso no es un error del webhook en sí.
      res.status(200).send('OK')
      return
    }

    res.status(405).send('Method Not Allowed')
  },
)
