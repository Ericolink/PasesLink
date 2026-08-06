// Constantes del pipeline de importación CSV vía Cloud Tasks — centralizadas
// acá para que createJob.ts, processChunk.ts, queue.ts y el callable de
// arranque no repitan cada número por separado.

// Filas por chunk (= por Cloud Task): 200 filas son hasta 4 transacciones
// internas de createGuestsWithCapacity (CHUNK_SIZE=50 ahí) — una tarea HTTP
// corta y barata de reintentar entera si falla, muy por debajo de
// timeoutSeconds de processCsvImportChunk.
export const ROWS_PER_CHUNK = 200

// Tope total del archivo. Antes (callable síncrona addGuestsFromRows) el
// tope real era 2000 filas por el límite práctico de una sola invocación
// HTTP de 120s bloqueando al organizador. Con el procesamiento en Cloud
// Tasks esa razón ya no aplica — el tope que queda acá es solo defensivo
// (25 chunks máximo, ver ROWS_PER_CHUNK) para no crear jobs desmedidos por
// un archivo mal armado.
export const MAX_ROWS_PER_IMPORT = 5000

// Techo de reintentos que este código asume ANTES de rendirse y marcar el
// job 'failed' (ver processCsvImportChunk.ts, que lee
// X-CloudTasks-TaskRetryCount). Debe coincidir con max-attempts de la cola
// de Cloud Tasks (ver gcloud tasks queues create/update en el resumen de
// despliegue) — si se cambia acá, hay que cambiarlo también ahí.
export const MAX_TASK_ATTEMPTS = 5

// Misma región que el resto de las Cloud Functions del proyecto (ver
// functions/src/index.ts) — evita latencia cross-region entre Cloud Tasks,
// la función y Firestore.
export const CLOUD_TASKS_LOCATION = 'us-central1'
export const CLOUD_TASKS_QUEUE_ID = 'csv-import-chunks'
export const CLOUD_TASKS_TARGET_FUNCTION = 'processCsvImportChunk'

// Service account DEDICADA (no la default de App Engine, que suele tener
// permisos amplios) — Cloud Tasks firma cada request con un token OIDC de
// esta cuenta, y processCsvImportChunk se despliega con `invoker: 'private'`
// para que solo ella (con rol roles/cloudfunctions.invoker otorgado a mano,
// ver resumen de despliegue) pueda invocarla. Least privilege: esta cuenta
// no necesita ningún otro rol.
export const CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_ID = 'csv-import-tasks'
