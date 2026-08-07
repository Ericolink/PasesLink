import { collectionGroup, doc, getDoc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import type { DocumentReference, Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import { withListenerReporting } from '../lib/sentry'
import type { SendLogStatus } from './sendLog'
import type { CsvImportJobStatus } from './csvImportJobs'

// Alertas inteligentes del Centro de Control — solo fuentes de datos REALES
// ya existentes (sendLog/notificationQueue/csvImportJobs/sendBudget), nunca
// Sentry/Cloud Monitoring (eso quedó diferido, ver docs/platform-health-roadmap.md).
// Cada listener usa collectionGroup() para ver fallas de CUALQUIER evento a
// la vez — ver firestore.rules para las 4 reglas nuevas que lo habilitan
// solo a isAdmin(). El eventId de cada entrada se deriva de
// `snap.ref.parent.parent.id` (el doc del evento dueño de la subcolección),
// ya que ni sendLog ni csvImportJobs guardan ese campo en el propio doc.

// `sendLog` NO es exclusivamente de eventos — es el único de los 3
// collectionGroup con un escritor fuera de events/: el email de bienvenida
// (functions/src/triggers/onUserCreated.ts) escribe en
// `users/{uid}/sendLog/welcome`, no en `events/{eventId}/sendLog/{id}`.
// Sin esta distinción, `d.ref.parent.parent.id` devolvía el UID del usuario
// interpretado como si fuera un eventId, y el link "Ver evento" del panel
// apuntaba a un evento inexistente (bug real, encontrado en producción).
// notificationQueue/csvImportJobs sí son siempre de eventos — no necesitan
// este chequeo.
function sendLogSource(ref: DocumentReference): 'event' | 'welcome_email' {
  return ref.parent.parent?.parent.id === 'events' ? 'event' : 'welcome_email'
}

export interface SendFailureEntry {
  id: string
  source: 'event' | 'welcome_email'
  /** Solo presente cuando source === 'event' — un fallo de email de bienvenida no pertenece a ningún evento. */
  eventId?: string
  toEmail: string
  status: SendLogStatus
  errorMessage?: string
  sentAt: number
}

export function subscribeToRecentSendFailures(
  callback: (entries: SendFailureEntry[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(
    collectionGroup(db, 'sendLog'),
    where('status', 'in', ['failed', 'skipped_budget'] satisfies SendLogStatus[]),
    orderBy('sentAt', 'desc'),
    limit(20),
  )
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((d) => {
          const data = d.data()
          const source = sendLogSource(d.ref)
          return {
            id: d.id,
            source,
            eventId: source === 'event' ? d.ref.parent.parent?.id : undefined,
            toEmail: (data.toEmail as string) || '',
            status: data.status as SendLogStatus,
            errorMessage: (data.errorMessage as string) || undefined,
            sentAt: toMillis(data.sentAt),
          }
        }),
      )
    },
    withListenerReporting('adminAlerts.sendFailures', onError),
  )
}

export interface NotificationFailureEntry {
  id: string
  eventId: string
  type: string
  recipientUid: string
  createdAt: number
}

export function subscribeToRecentNotificationFailures(
  callback: (entries: NotificationFailureEntry[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collectionGroup(db, 'notificationQueue'), where('status', '==', 'failed'), orderBy('createdAt', 'desc'), limit(20))
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            eventId: (data.eventId as string) || d.ref.parent.parent?.id || '',
            type: (data.type as string) || '',
            recipientUid: (data.recipientUid as string) || '',
            createdAt: toMillis(data.createdAt),
          }
        }),
      )
    },
    withListenerReporting('adminAlerts.notificationFailures', onError),
  )
}

export interface CsvImportFailureEntry {
  id: string
  eventId: string
  fileName: string
  status: CsvImportJobStatus
  errorMessage: string | null
  failedCount: number
  createdAt: number
}

export function subscribeToRecentCsvImportFailures(
  callback: (entries: CsvImportFailureEntry[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(
    collectionGroup(db, 'csvImportJobs'),
    where('status', 'in', ['failed', 'completed_with_errors'] satisfies CsvImportJobStatus[]),
    orderBy('createdAt', 'desc'),
    limit(20),
  )
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            eventId: d.ref.parent.parent?.id || '',
            fileName: (data.fileName as string) || '',
            status: data.status as CsvImportJobStatus,
            errorMessage: (data.errorMessage as string) || null,
            failedCount: (data.failedCount as number) || 0,
            createdAt: toMillis(data.createdAt),
          }
        }),
      )
    },
    withListenerReporting('adminAlerts.csvImportFailures', onError),
  )
}

// Mismo cap y formato de clave que functions/src/lib/dailyBudget.ts — se
// duplica acá (cliente y Cloud Functions son proyectos TypeScript
// separados, sin paquete compartido) en vez de importar entre ellos.
const DAILY_BUDGET_CAP = 300

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function getTodaySendBudgetUsage(): Promise<{ count: number; cap: number }> {
  const snap = await getDoc(doc(db, 'sendBudget', todayDateKey()))
  return { count: (snap.data()?.count as number) || 0, cap: DAILY_BUDGET_CAP }
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}
