// Alimenta platformStats/health — fuente de la sección "Salud de la
// plataforma" del Centro de Control admin (antes un placeholder
// "Próximamente", ver docs/platform-health-roadmap.md Opción A). Corre
// cada 15 min, mismo patrón que el resto de functions/src/scheduled/*.
//
// Cada señal (Sentry / Cloud Functions / Firestore / Storage) se resuelve
// por separado con su propio try/catch: si una falla (ej. el rol
// roles/monitoring.viewer todavía no está otorgado, o el token de Sentry no
// se configuró), las demás igual se escriben — un semáforo parcial es mejor
// que ninguno. Solo se relanza el error (para que quede en Cloud Logging /
// Error Reporting) si las 4 señales fallan a la vez, señal de que algo
// sistémico está mal (credenciales rotas, etc.), no un permiso puntual.
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { withScheduledObservability } from '../lib/observability/withObservability.js'
import { sentryApiToken } from '../lib/secrets.js'
import { getSentryHealth } from '../lib/platformHealth/sentryHealth.js'
import { getFirestoreUsage, getFunctionsHealth, getStorageUsage, resolveProjectId } from '../lib/platformHealth/cloudMonitoring.js'
import type { ObservabilityContext } from '../lib/observability/withObservability.js'

const WINDOW_MINUTES = 15
const SENTRY_ORG_SLUG = 'paselink'
const SENTRY_PROJECT_SLUG = 'paselink'

async function resolveSignal<T>(logger: ObservabilityContext['logger'], name: string, run: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await run()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn(`refreshPlatformHealth: señal "${name}" falló, se omite esta vuelta`, { signal: name, error: message })
    return { error: message }
  }
}

export const refreshPlatformHealth = onSchedule(
  { schedule: 'every 15 minutes', timeZone: 'UTC', secrets: [sentryApiToken], maxInstances: 1, timeoutSeconds: 60 },
  () => withScheduledObservability('refreshPlatformHealth', async (ctx) => {
    const projectId = await resolveProjectId()
    const bucketName = getStorage().bucket().name

    const [sentry, cloudFunctions, firestoreUsage, storage] = await Promise.all([
      resolveSignal(ctx.logger, 'sentry', () => getSentryHealth(sentryApiToken.value(), SENTRY_ORG_SLUG, SENTRY_PROJECT_SLUG)),
      resolveSignal(ctx.logger, 'cloudFunctions', () => getFunctionsHealth(projectId, WINDOW_MINUTES)),
      resolveSignal(ctx.logger, 'firestore', () => getFirestoreUsage(projectId, WINDOW_MINUTES)),
      resolveSignal(ctx.logger, 'storage', () => getStorageUsage(projectId, bucketName)),
    ])

    const failures = [sentry, cloudFunctions, firestoreUsage, storage].filter((s) => 'error' in s).length
    if (failures === 4) {
      throw new Error('refreshPlatformHealth: las 4 señales fallaron — revisar credenciales/permisos (ver docs/platform-health-roadmap.md)')
    }

    await getFirestore().doc('platformStats/health').set(
      {
        sentry,
        cloudFunctions,
        firestore: firestoreUsage,
        storage,
        windowMinutes: WINDOW_MINUTES,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    ctx.addContext({ failedSignals: failures })
  }),
)
