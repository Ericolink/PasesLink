import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import { withListenerReporting } from '../lib/sentry'

export type MessageCampaignStatus = 'queued' | 'processing' | 'sent' | 'partial' | 'failed'

// El navegador solo crea el documento (status siempre 'queued', guestIds ya
// resuelto) — scripts/send-mass-messages.mjs (GitHub Actions cron) es quien
// procesa la cola y transiciona status, para que la API key de Brevo nunca
// llegue al bundle del cliente (ver firestore.rules: update/delete: false).
export interface MessageCampaign {
  id: string
  eventId: string
  createdBy: string
  createdByEmail: string | null
  subject: string
  bodyText: string
  audienceSummary: string
  guestIds: string[]
  status: MessageCampaignStatus
  createdAt: number
  processedAt?: number
}

export interface CreateCampaignInput {
  subject: string
  bodyText: string
  guestIds: string[]
  audienceSummary: string
}

export async function createMessageCampaign(
  eventId: string,
  uid: string,
  userEmail: string | null,
  input: CreateCampaignInput,
): Promise<string> {
  const ref = await addDoc(collection(db, 'events', eventId, 'messageCampaigns'), {
    eventId,
    createdBy: uid,
    createdByEmail: userEmail,
    subject: input.subject,
    bodyText: input.bodyText,
    audienceSummary: input.audienceSummary,
    guestIds: input.guestIds,
    status: 'queued',
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export function subscribeToMessageCampaigns(
  eventId: string,
  callback: (campaigns: MessageCampaign[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'events', eventId, 'messageCampaigns'), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            eventId: data.eventId as string,
            createdBy: data.createdBy as string,
            createdByEmail: (data.createdByEmail as string) || null,
            subject: data.subject as string,
            bodyText: data.bodyText as string,
            audienceSummary: data.audienceSummary as string,
            guestIds: (data.guestIds as string[]) || [],
            status: data.status as MessageCampaignStatus,
            createdAt: toMillis(data.createdAt),
            processedAt: data.processedAt ? toMillis(data.processedAt) : undefined,
          }
        }),
      )
    },
    withListenerReporting('messageCampaigns', onError),
  )
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}
