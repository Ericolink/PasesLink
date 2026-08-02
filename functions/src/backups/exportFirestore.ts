// Backup nativo de Firestore vía la API oficial de exportación gestionada
// (la misma que usa `gcloud firestore export`) — no es un dump manual de
// documentos como scripts/backup-firestore.mjs. El resultado es un export
// en el formato propietario de Firestore, restaurable con
// `gcloud firestore import` (ver docs/firestore-backups.md §7).
//
// `client.exportDocuments()` devuelve una operación de larga duración (LRO)
// que Google sigue ejecutando en su infraestructura aunque la función
// termine antes. Acá SÍ esperamos `operation.promise()` (con timeout
// generoso en los onSchedule que llaman a esto) para poder loguear
// duración/éxito/tamaño en un solo lugar, como pide la Fase de monitoreo —
// no hace falta infraestructura de polling separada mientras el tamaño de
// la base de datos mantenga el export dentro de ese margen (ver límite
// conocido documentado en docs/firestore-backups.md §8).
import { v1 } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import type { ObservabilityContext } from '../lib/observability/withObservability.js'
import { BACKUP_BUCKET, BACKUP_ROOT_PREFIX, type BackupTier } from './config.js'

function timestampSlug(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-')
}

async function approxBackupSizeBytes(prefix: string): Promise<number> {
  const [files] = await getStorage().bucket(BACKUP_BUCKET).getFiles({ prefix })
  return files.reduce((total, file) => total + Number(file.metadata.size ?? 0), 0)
}

async function writeMetadata(tier: BackupTier, timestamp: string, metadata: Record<string, unknown>): Promise<void> {
  const path = `${BACKUP_ROOT_PREFIX}/metadata/${tier}/${timestamp}.json`
  await getStorage().bucket(BACKUP_BUCKET).file(path).save(JSON.stringify(metadata, null, 2), {
    contentType: 'application/json',
    resumable: false,
  })
}

export async function runFirestoreExport(tier: BackupTier, ctx: ObservabilityContext): Promise<void> {
  const client = new v1.FirestoreAdminClient()
  const projectId = await client.getProjectId()
  const databaseName = client.databasePath(projectId, '(default)')
  const timestamp = timestampSlug(new Date())
  const outputUriPrefix = `gs://${BACKUP_BUCKET}/${BACKUP_ROOT_PREFIX}/${tier}/${timestamp}`

  ctx.addContext({ tier, outputUriPrefix })
  const startedAt = Date.now()

  const [operation] = await client.exportDocuments({
    name: databaseName,
    outputUriPrefix,
    collectionIds: [], // vacío = todas las colecciones (top-level y sus subcolecciones)
  })
  ctx.logger.info(`Export de Firestore iniciado (${tier})`, { operationName: operation.name })

  const [result] = await operation.promise()
  const durationMs = Date.now() - startedAt
  const approxSizeBytes = await approxBackupSizeBytes(`${BACKUP_ROOT_PREFIX}/${tier}/${timestamp}`)

  await writeMetadata(tier, timestamp, {
    tier,
    timestamp,
    outputUriPrefix: result.outputUriPrefix ?? outputUriPrefix,
    durationMs,
    approxSizeBytes,
    success: true,
  })

  ctx.addContext({ durationMs, approxSizeBytes })
  ctx.logger.info(`Export de Firestore completado (${tier})`, { durationMs, approxSizeBytes })
}
