import { doc, onSnapshot } from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './config'
import { measureSpan, withListenerReporting } from '../lib/sentry'
import type { ImportedGuestRow } from './guests'

// Importación masiva de invitados por CSV procesada en background vía
// Cloud Tasks (ver functions/src/csvImport/ + functions/src/tasks/
// processCsvImportChunk.ts) — el navegador solo dispara el job
// (startCsvImportJob) y sigue su progreso vía onSnapshot sobre
// events/{eventId}/csvImportJobs/{jobId}, nunca espera a que termine el
// archivo entero. El job en sí (y sus chunks) lo crea la Cloud Function con
// Admin SDK, así que acá no hay ninguna escritura del cliente a esta
// colección — ver firestore.rules (`allow write: if false`).
export type CsvImportJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'cancelled'

export interface CsvImportJob {
  id: string
  status: CsvImportJobStatus
  fileName: string
  totalRows: number
  processedRows: number
  successCount: number
  failedCount: number
  progressPercent: number
  createdAt: number
  startedAt: number | null
  completedAt: number | null
  errorMessage: string | null
}

export async function startCsvImportJob(eventId: string, rows: ImportedGuestRow[], fileName: string): Promise<string> {
  const callable = httpsCallable<
    { eventId: string; rows: ImportedGuestRow[]; fileName: string },
    { jobId: string }
  >(functions, 'startCsvImport')
  const result = await measureSpan('functions.startCsvImport', 'db.firestore', () => callable({ eventId, rows, fileName }))
  return result.data.jobId
}

export async function cancelCsvImportJob(eventId: string, jobId: string): Promise<void> {
  const callable = httpsCallable<{ eventId: string; jobId: string }, { ok: true }>(functions, 'cancelCsvImportJob')
  await measureSpan('functions.cancelCsvImportJob', 'db.firestore', () => callable({ eventId, jobId }))
}

export function subscribeToCsvImportJob(
  eventId: string,
  jobId: string,
  callback: (job: CsvImportJob | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'events', eventId, 'csvImportJobs', jobId),
    (snap) => {
      if (!snap.exists()) {
        callback(null)
        return
      }
      const data = snap.data()
      callback({
        id: snap.id,
        status: data.status as CsvImportJobStatus,
        fileName: (data.fileName as string) || '',
        totalRows: (data.totalRows as number) || 0,
        processedRows: (data.processedRows as number) || 0,
        successCount: (data.successCount as number) || 0,
        failedCount: (data.failedCount as number) || 0,
        progressPercent: (data.progressPercent as number) || 0,
        createdAt: toMillis(data.createdAt),
        startedAt: data.startedAt ? toMillis(data.startedAt) : null,
        completedAt: data.completedAt ? toMillis(data.completedAt) : null,
        errorMessage: (data.errorMessage as string) || null,
      })
    },
    withListenerReporting('csvImportJobs', onError),
  )
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}
