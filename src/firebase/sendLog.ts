import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import { withListenerReporting } from '../lib/sentry'

export type SendLogKind = 'reminder' | 'mass_message'
export type SendLogStatus = 'sent' | 'failed' | 'skipped_no_email' | 'skipped_budget'

// Espejo de adminAuditLog (src/firebase/admin.ts) — bitácora de envíos de
// email (recordatorios de RSVP y mensajería masiva). Escrito ÚNICAMENTE por
// los scripts Node (scripts/send-rsvp-reminders.mjs,
// scripts/send-mass-messages.mjs) vía firebase-admin, nunca desde el
// cliente (ver firestore.rules: write:false en events/{id}/sendLog/{id}) —
// el id determinístico de cada doc (reminder_${ruleId}_${guestId}_${fecha} o
// mass_${campaignId}_${guestId}) es lo que garantiza "sin envíos duplicados"
// vía un create() que falla si el slot ya está reclamado.
export interface SendLogEntry {
  id: string
  guestId: string
  channel: 'email'
  kind: SendLogKind
  ruleId?: string
  campaignId?: string
  toEmail: string
  subject: string
  status: SendLogStatus
  errorMessage?: string
  sentAt: number
}

export function subscribeToSendLog(
  eventId: string,
  callback: (entries: SendLogEntry[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'events', eventId, 'sendLog'), orderBy('sentAt', 'desc'), limit(100))
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            guestId: data.guestId as string,
            channel: data.channel as 'email',
            kind: data.kind as SendLogKind,
            ruleId: (data.ruleId as string) || undefined,
            campaignId: (data.campaignId as string) || undefined,
            toEmail: data.toEmail as string,
            subject: data.subject as string,
            status: data.status as SendLogStatus,
            errorMessage: (data.errorMessage as string) || undefined,
            sentAt: toMillis(data.sentAt),
          }
        }),
      )
    },
    withListenerReporting('sendLog', onError),
  )
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}
