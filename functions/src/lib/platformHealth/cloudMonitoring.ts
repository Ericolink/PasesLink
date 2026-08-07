// Lee métricas de Cloud Functions/Firestore/Storage vía la API REST de
// Cloud Monitoring (v3), autenticado con las credenciales propias de la
// Cloud Function (Application Default Credentials — el service account por
// defecto de Cloud Functions v2, que YA existe, solo necesita el rol
// `roles/monitoring.viewer` otorgado a mano una vez — ver
// docs/platform-health-roadmap.md, no se puede automatizar desde acá).
// Sin SDK de Cloud Monitoring (evita sumar @google-cloud/monitoring, un
// paquete grande, por unas pocas queries) — `google-auth-library` (ya
// transitiva de firebase-admin, ahora dependencia directa) resuelve el
// token de acceso, y `fetch` (nativo en Node 22) hace el resto.
//
// IMPORTANTE: los nombres exactos de métrica/resource usados acá siguen la
// documentación pública de GCP, pero no se pudieron verificar contra el
// proyecto real (sin acceso a gcloud/Cloud Monitoring desde este entorno de
// desarrollo). Si algún filtro no devuelve series al desplegar, confirmar
// el nombre correcto en GCP Console → Monitoring → Metrics Explorer,
// filtrando por el mismo resource type, y ajustar acá.
import { GoogleAuth } from 'google-auth-library'

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/monitoring.read'] })

interface TimeSeriesPoint {
  value?: { int64Value?: string; doubleValue?: number }
}
interface TimeSeries {
  points?: TimeSeriesPoint[]
}
interface TimeSeriesListResponse {
  timeSeries?: TimeSeries[]
}

function pointValue(point: TimeSeriesPoint | undefined): number {
  if (!point?.value) return 0
  if (point.value.int64Value !== undefined) return Number(point.value.int64Value)
  if (point.value.doubleValue !== undefined) return point.value.doubleValue
  return 0
}

// Suma el primer (único, dado un solo alignmentPeriod que cubre toda la
// ventana) punto de CADA serie devuelta — cubre el caso de que el filtro
// matchee varias series (ej. una por función de Cloud Functions).
function sumFirstPoints(response: TimeSeriesListResponse): number {
  return (response.timeSeries || []).reduce((sum, series) => sum + pointValue(series.points?.[0]), 0)
}

async function queryTimeSeries(
  projectId: string,
  filter: string,
  startTime: string,
  endTime: string,
  alignmentPeriodSeconds: number,
  aligner: string,
): Promise<TimeSeriesListResponse> {
  const client = await auth.getClient()
  const accessToken = (await client.getAccessToken()).token
  if (!accessToken) throw new Error('No se pudo obtener un access token para Cloud Monitoring')

  const params = new URLSearchParams({
    filter,
    'interval.startTime': startTime,
    'interval.endTime': endTime,
    'aggregation.alignmentPeriod': `${alignmentPeriodSeconds}s`,
    'aggregation.perSeriesAligner': aligner,
  })
  const url = `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?${params.toString()}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    throw new Error(`Cloud Monitoring respondió ${res.status}: ${await res.text().catch(() => '')}`)
  }
  return (await res.json()) as TimeSeriesListResponse
}

export async function resolveProjectId(): Promise<string> {
  const projectId = await auth.getProjectId()
  if (!projectId) throw new Error('No se pudo resolver el project id de GCP')
  return projectId
}

export type FunctionsHealthStatus = 'ok' | 'warning' | 'error' | 'unknown'

export interface FunctionsHealthResult {
  status: FunctionsHealthStatus
  executionCount: number
  errorCount: number
  errorRatePercent: number
  p95LatencyMs: number | null
}

const ERROR_RATE_WARNING_PERCENT = 1
const ERROR_RATE_ERROR_PERCENT = 5

export function classifyFunctionsHealth(executionCount: number, errorRatePercent: number): FunctionsHealthStatus {
  if (executionCount === 0) return 'unknown'
  if (errorRatePercent >= ERROR_RATE_ERROR_PERCENT) return 'error'
  if (errorRatePercent >= ERROR_RATE_WARNING_PERCENT) return 'warning'
  return 'ok'
}

// Dos queries en vez de una con groupBy: separar por status vía filter es
// más simple de sumar que parsear múltiples series agrupadas de la
// respuesta, al costo de una llamada extra (aceptable, corre cada 15 min,
// no en cada carga de página).
export async function getFunctionsHealth(projectId: string, windowMinutes: number): Promise<FunctionsHealthResult> {
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - windowMinutes * 60_000)
  const alignmentPeriod = windowMinutes * 60

  const [totalResp, errorResp, latencyResp] = await Promise.all([
    queryTimeSeries(
      projectId,
      'metric.type="cloudfunctions.googleapis.com/function/execution_count" resource.type="cloud_function"',
      startTime.toISOString(),
      endTime.toISOString(),
      alignmentPeriod,
      'ALIGN_SUM',
    ),
    queryTimeSeries(
      projectId,
      'metric.type="cloudfunctions.googleapis.com/function/execution_count" resource.type="cloud_function" metric.label.status!="ok"',
      startTime.toISOString(),
      endTime.toISOString(),
      alignmentPeriod,
      'ALIGN_SUM',
    ),
    // Aproximación: p95 POR función, promediado entre funciones — no es un
    // p95 exacto del conjunto, pero da una idea razonable de "qué tan lenta
    // anda la flota" sin la complejidad de un percentil-de-percentiles.
    queryTimeSeries(
      projectId,
      'metric.type="cloudfunctions.googleapis.com/function/execution_times" resource.type="cloud_function"',
      startTime.toISOString(),
      endTime.toISOString(),
      alignmentPeriod,
      'ALIGN_PERCENTILE_95',
    ),
  ])

  const executionCount = sumFirstPoints(totalResp)
  const errorCount = sumFirstPoints(errorResp)
  const errorRatePercent = executionCount > 0 ? Math.round((errorCount / executionCount) * 1000) / 10 : 0
  const latencySeries = latencyResp.timeSeries || []
  const p95LatencyMs = latencySeries.length > 0
    ? Math.round((latencySeries.reduce((sum, s) => sum + pointValue(s.points?.[0]), 0) / latencySeries.length) / 1e6)
    : null

  return {
    status: classifyFunctionsHealth(executionCount, errorRatePercent),
    executionCount,
    errorCount,
    errorRatePercent,
    p95LatencyMs,
  }
}

export interface FirestoreUsageResult {
  readCount: number
  writeCount: number
  deleteCount: number
}

// Puramente informativo (sin semáforo): "más lecturas que ayer" no es en sí
// un problema de salud, es una señal de uso/costo — inventar un umbral acá
// sin datos históricos de referencia sería fabricar una alerta, así que
// esta sección solo muestra números reales.
export async function getFirestoreUsage(projectId: string, windowMinutes: number): Promise<FirestoreUsageResult> {
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - windowMinutes * 60_000)
  const alignmentPeriod = windowMinutes * 60

  const query = (op: string) =>
    queryTimeSeries(
      projectId,
      `metric.type="firestore.googleapis.com/document/${op}_count" resource.type="firestore_instance"`,
      startTime.toISOString(),
      endTime.toISOString(),
      alignmentPeriod,
      'ALIGN_SUM',
    )

  const [readResp, writeResp, deleteResp] = await Promise.all([query('read'), query('write'), query('delete')])

  return {
    readCount: sumFirstPoints(readResp),
    writeCount: sumFirstPoints(writeResp),
    deleteCount: sumFirstPoints(deleteResp),
  }
}

export interface StorageUsageResult {
  totalBytes: number | null
}

// `storage/total_bytes` es un gauge (no un contador acumulable) — se pide
// el último valor con ALIGN_MEAN sobre una ventana corta, no un SUM.
export async function getStorageUsage(projectId: string, bucketName: string): Promise<StorageUsageResult> {
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - 60 * 60_000)

  const resp = await queryTimeSeries(
    projectId,
    `metric.type="storage.googleapis.com/storage/total_bytes" resource.type="gcs_bucket" resource.label.bucket_name="${bucketName}"`,
    startTime.toISOString(),
    endTime.toISOString(),
    3600,
    'ALIGN_MEAN',
  )

  const series = resp.timeSeries || []
  const totalBytes = series.length > 0 ? Math.round(pointValue(series[0].points?.[0])) : null
  return { totalBytes }
}
