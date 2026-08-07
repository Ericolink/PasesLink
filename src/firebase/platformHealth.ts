import { doc, onSnapshot } from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import { withListenerReporting } from '../lib/sentry'

export type HealthStatus = 'ok' | 'warning' | 'error' | 'unknown'

interface SentryHealth {
  status: HealthStatus
  unresolvedCount: number
  hasMore: boolean
}

interface CloudFunctionsHealth {
  status: HealthStatus
  executionCount: number
  errorCount: number
  errorRatePercent: number
  p95LatencyMs: number | null
}

interface FirestoreUsage {
  readCount: number
  writeCount: number
  deleteCount: number
}

interface StorageUsage {
  totalBytes: number | null
}

// Cada señal puede venir con `{ error: string }` en vez de sus campos
// normales — functions/src/scheduled/refreshPlatformHealth.ts escribe eso
// cuando esa señal puntual falló (permiso no otorgado, token sin
// configurar, etc.), sin bloquear la escritura de las demás.
export interface PlatformHealth {
  updatedAt: number
  windowMinutes: number
  sentry: SentryHealth | { error: string }
  cloudFunctions: CloudFunctionsHealth | { error: string }
  firestore: FirestoreUsage | { error: string }
  storage: StorageUsage | { error: string }
}

export function hasError<T>(signal: T | { error: string }): signal is { error: string } {
  return typeof signal === 'object' && signal !== null && 'error' in signal
}

// Listener (no lectura puntual) sobre un único doc, alimentado por el cron
// refreshPlatformHealth cada 15 min — costo de un listener de 1 documento
// es despreciable, y le da al admin la actualización automática sin tener
// que refrescar la página. `null` = el cron todavía no corrió ni una vez
// (doc inexistente), distinto de "todas las señales fallaron" (doc existe,
// cada campo trae `{error}`).
export function subscribeToPlatformHealth(
  callback: (health: PlatformHealth | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'platformStats', 'health'),
    (snap) => {
      if (!snap.exists()) {
        callback(null)
        return
      }
      const data = snap.data()
      callback({
        updatedAt: toMillis(data.updatedAt),
        windowMinutes: (data.windowMinutes as number) || 0,
        sentry: data.sentry,
        cloudFunctions: data.cloudFunctions,
        firestore: data.firestore,
        storage: data.storage,
      })
    },
    withListenerReporting('platformHealth', onError),
  )
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}
