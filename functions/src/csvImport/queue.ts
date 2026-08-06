// Encola en Cloud Tasks el procesamiento de UN chunk de una importación CSV
// — desacopla la escritura pesada (createGuestsWithCapacity sobre hasta 200
// filas) de la petición HTTP que la dispara, para que ni startCsvImport
// (callable del organizador) ni processCsvImportChunk (el propio worker,
// que se auto-encola para el siguiente chunk) esperen a que el chunk
// siguiente termine.
//
// `@google-cloud/tasks` se importa DINÁMICO (no `import ... from` estático)
// a propósito: este proyecto tiene un solo codebase de Cloud Functions
// (functions/src/index.ts reexporta TODAS las funciones), así que un
// import estático acá cargaría el cliente gRPC/protobuf de Cloud Tasks en
// el arranque de contenedor de CUALQUIER función del proyecto — no solo
// las de importación CSV. Ya causó un fallo real de despliegue por esto:
// onGuestWritten (memory: 128MiB, el trigger de mayor frecuencia del
// proyecto) no pasaba el healthcheck de Cloud Run por quedarse sin memoria
// al cargar un módulo que nunca usa. El import diferido carga el paquete
// una sola vez, la primera vez que ESTA función en particular efectivamente
// encola una tarea — nunca en el cold start de las demás.
import type { CloudTasksClient as CloudTasksClientType } from '@google-cloud/tasks'
import {
  CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_ID,
  CLOUD_TASKS_LOCATION,
  CLOUD_TASKS_QUEUE_ID,
  CLOUD_TASKS_TARGET_FUNCTION,
} from './config.js'

// Un solo cliente por instancia de función (mismo criterio que
// v1.FirestoreAdminClient en backups/exportFirestore.ts) — evita reabrir la
// conexión gRPC en cada invocación.
let client: CloudTasksClientType | null = null
async function getClient(): Promise<CloudTasksClientType> {
  if (!client) {
    const { CloudTasksClient } = await import('@google-cloud/tasks')
    client = new CloudTasksClient()
  }
  return client
}

export interface CsvImportChunkTaskPayload {
  eventId: string
  jobId: string
  chunkIndex: number
}

export async function enqueueCsvImportChunk(payload: CsvImportChunkTaskPayload): Promise<void> {
  const tasksClient = await getClient()
  const projectId = await tasksClient.getProjectId()
  const parent = tasksClient.queuePath(projectId, CLOUD_TASKS_LOCATION, CLOUD_TASKS_QUEUE_ID)
  const url = `https://${CLOUD_TASKS_LOCATION}-${projectId}.cloudfunctions.net/${CLOUD_TASKS_TARGET_FUNCTION}`
  const serviceAccountEmail = `${CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_ID}@${projectId}.iam.gserviceaccount.com`

  await tasksClient.createTask({
    parent,
    task: {
      httpRequest: {
        httpMethod: 'POST',
        url,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
        // OIDC (no OAuth): processCsvImportChunk verifica la identidad vía
        // IAM (invoker: 'private' en su definición), no leyendo el token a
        // mano — mismo mecanismo que usa Cloud Scheduler para onSchedule.
        oidcToken: { serviceAccountEmail },
      },
    },
  })
}
