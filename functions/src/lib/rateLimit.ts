// Primitivas de rate limiting compartidas por las Callables públicas (T1 de
// P0-4, endurecido en T1.1) — contadores de ventana fija en Firestore
// (colección `rateLimits`), mismo patrón transaccional que reserveBudgetSlot
// (dailyBudget.ts). Firestore y no memoria: cada instancia de Functions
// tiene su propia memoria (maxInstances: 10 en index.ts) y un límite en
// memoria se multiplicaría por la cantidad de instancias.
//
// La POLÍTICA (qué contar, cuándo bloquear) vive en cada consumidor — la de
// búsqueda de pases está en guestByToken.ts. Diseño completo, límites y
// pasos de infraestructura en docs/rate-limiting.md.
//
// - Sin datos personales en claro: el sujeto de cada contador (IP, eventId)
//   se seudonimiza con HMAC-SHA256 y RATE_LIMIT_HMAC_KEY (Secret Manager).
// - Limpieza: cada documento lleva `expiresAt` (fin de su ventana + 1 h)
//   para la política TTL de Firestore sobre `rateLimits`.
// - firestore.rules no tiene ningún match para `rateLimits`: el cliente no
//   puede leer ni escribir esta colección, solo el Admin SDK.
import { createHmac } from 'node:crypto'
import { FieldValue, Timestamp, type DocumentReference, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'

export const RATE_LIMIT_COLLECTION = 'rateLimits'
export const RATE_LIMIT_MESSAGE = 'Demasiados intentos. Espera unos minutos e intenta de nuevo.'
const TTL_GRACE_MS = 60 * 60_000
const MIN_HMAC_KEY_LENGTH = 32

export interface RateLimitRule {
  /** Prefijo del id de documento — corto, sin "_" ni "/". */
  scope: string
  limit: number
  windowMs: number
}

export interface RateLimitBucket {
  rule: RateLimitRule
  /** Seudónimo del sujeto (salida de pseudonymize), nunca el valor en claro. */
  subjectId: string
}

export function pseudonymize(hmacKey: string, value: string): string {
  if (typeof hmacKey !== 'string' || hmacKey.length < MIN_HMAC_KEY_LENGTH) {
    // Falla cerrado: sin clave válida no hay forma segura de contar.
    // Error inesperado a propósito (no HttpsError) — withCallableObservability
    // lo registra como error y responde un `internal` genérico, sin el valor.
    throw new Error('RATE_LIMIT_HMAC_KEY no está configurado o es demasiado corto.')
  }
  return createHmac('sha256', hmacKey).update(value, 'utf8').digest('hex').slice(0, 32)
}

/** Documento del contador de `bucket` para la ventana que contiene `now`. */
export function rateLimitDoc(db: Firestore, bucket: RateLimitBucket, now: number): { ref: DocumentReference; expiresAt: Timestamp } {
  const windowIndex = Math.floor(now / bucket.rule.windowMs)
  const expiresAt = Timestamp.fromMillis((windowIndex + 1) * bucket.rule.windowMs + TTL_GRACE_MS)
  const ref = db.collection(RATE_LIMIT_COLLECTION).doc(`${bucket.rule.scope}_${bucket.subjectId}_${windowIndex}`)
  return { ref, expiresAt }
}

export function countOf(snap: DocumentSnapshot): number {
  const count = snap.get('count')
  return typeof count === 'number' ? count : 0
}

/**
 * Suma 1 a cada contador sin leerlo (increment atómico, sin transacción) —
 * para eventos que solo se cuentan después de ocurrir (búsqueda fallida).
 * La verificación del límite la hace la próxima transacción del consumidor.
 */
export async function recordRateLimitHits(db: Firestore, buckets: RateLimitBucket[], now: number = Date.now()): Promise<void> {
  if (buckets.length === 0) return
  const batch = db.batch()
  for (const b of buckets) {
    const { ref, expiresAt } = rateLimitDoc(db, b, now)
    batch.set(ref, { count: FieldValue.increment(1), expiresAt }, { merge: true })
  }
  await batch.commit()
}

export function rateLimitExceededError(): HttpsError {
  return new HttpsError('resource-exhausted', RATE_LIMIT_MESSAGE)
}

// ---------------------------------------------------------------------------
// Límite exacto repartido en particiones
//
// Un contador muy usado (la IP del WiFi del lugar del evento, el presupuesto
// global de IP desconocida) se reparte en `partitions` documentos para que
// las solicitudes simultáneas no compitan por uno solo. Exactitud:
// - Capacidades: floor(L/P) en cada partición y el resto, de a 1, en las
//   primeras — la suma es exactamente L para cualquier L.
// - Cada solicitud arranca en una partición al azar y, si está llena, prueba
//   las siguientes (una transacción por intento). Solo se rechaza si TODAS
//   estaban llenas. Como dentro de una ventana un contador solo sube, ver las
//   P llenas significa que el total era exactamente L: no hay rechazos
//   prematuros, y como cada partición es transaccional el total nunca pasa
//   de L aunque las solicitudes sean simultáneas.
// - Costo extra solo cerca del límite: mientras la partición elegida tenga
//   cupo, es una única transacción.
// ---------------------------------------------------------------------------

export interface PartitionedRule extends RateLimitRule {
  partitions: number
}

export function partitionCapacities(limit: number, partitions: number): number[] {
  const base = Math.floor(limit / partitions)
  const remainder = limit % partitions
  return Array.from({ length: partitions }, (_, i) => base + (i < remainder ? 1 : 0))
}

/** Chequeo adicional que corre dentro de la misma transacción de cada intento: devuelve el scope que bloquea, o null. */
export type PartitionGuard = (tx: Transaction) => Promise<string | null>

export async function consumePartitioned(
  db: Firestore,
  rule: PartitionedRule,
  subjectId: string,
  now: number,
  guard?: PartitionGuard,
): Promise<{ allowed: true } | { allowed: false; scope: string }> {
  const capacities = partitionCapacities(rule.limit, rule.partitions)
  // Partición inicial al azar — nunca un dato del cliente.
  const start = Math.floor(Math.random() * rule.partitions)
  for (let attempt = 0; attempt < rule.partitions; attempt++) {
    const p = (start + attempt) % rule.partitions
    if (capacities[p] === 0) continue
    const bucket: RateLimitBucket = { rule: { ...rule, limit: capacities[p] }, subjectId: `${subjectId}p${p}` }
    const { ref, expiresAt } = rateLimitDoc(db, bucket, now)
    const outcome = await db.runTransaction(async (tx): Promise<'allowed' | 'full' | { blocked: string }> => {
      const snap = await tx.get(ref)
      const blocked = guard ? await guard(tx) : null
      if (blocked) return { blocked }
      const count = countOf(snap)
      if (count >= capacities[p]) return 'full'
      tx.set(ref, { count: count + 1, expiresAt })
      return 'allowed'
    })
    if (outcome === 'allowed') return { allowed: true }
    if (outcome !== 'full') return { allowed: false, scope: outcome.blocked }
  }
  return { allowed: false, scope: rule.scope }
}

// ---------------------------------------------------------------------------
// IP del cliente
//
// La documentación de Google no garantiza en qué posición de
// X-Forwarded-For queda la IP real para una Callable de segunda generación
// invocada directo en cloudfunctions.net (sin balanceador propio):
// - Cloud Run functions (referencia de headers): "la primera IP suele ser la
//   del cliente", con el ejemplo `clientIp, proxy1Ip, proxy2Ip` — o sea,
//   Google puede AGREGAR proxies propios después del cliente.
// - Balanceador externo: agrega `<client-ip>,<load-balancer-ip>` al final y
//   no verifica nada de lo anterior (lo puede escribir el cliente).
// Lo que sí es seguro en ambos casos: todo lo que viene ANTES de lo que
// agregó Google puede estar falsificado, y lo que agrega Google viene al
// final. Por eso se recorre la lista de derecha a izquierda, saltando las
// entradas de infraestructura (rangos privados/reservados y los rangos de
// proxies de Google), y la primera IP pública que aparece es el cliente.
// Una entrada falsificada por el cliente nunca puede quedar a la derecha de
// la que agregó Google, así que nunca se elige en su lugar.
//
// NO se usa req.ip ni socket.remoteAddress: en Cloud Run (sin `trust proxy`
// en Express) son la IP del proxy interno de Google, la misma para todos
// los usuarios — usarlas como fallback convertiría el límite por IP en un
// límite global. Sin X-Forwarded-For utilizable, la IP es desconocida.
//
// Si algún día se pone un balanceador externo propio delante de las
// Functions, su forwarding rule IP es pública y quedaría como "cliente":
// en ese caso hay que subir TRUSTED_PROXY_HOPS a 1. Ver docs/rate-limiting.md
// para el procedimiento de verificación en staging.
// ---------------------------------------------------------------------------

/** Entradas finales de X-Forwarded-For agregadas por proxies propios (no de Google). 0 = sin balanceador propio. */
export const TRUSTED_PROXY_HOPS = 0

export type ForwardedEntryClass = 'public' | 'infra' | 'invalid'

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

// [primer octeto, segundo octeto mínimo, máximo] o rangos completos por prefijo.
function ipv4IsInfra(o: number[]): boolean {
  const [a, b, c] = o
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)          // 100.64.0.0/10 (CGNAT, espacio compartido)
    || (a === 169 && b === 254)                    // link-local
    || (a === 172 && b >= 16 && b <= 31)           // 172.16.0.0/12
    || (a === 192 && b === 168)                    // 192.168.0.0/16
    || (a === 192 && b === 0 && c === 0)           // 192.0.0.0/24
    || (a === 35 && b === 191)                     // 35.191.0.0/16 — proxies/health checks de Google
    || (a === 130 && b === 211 && c <= 3)          // 130.211.0.0/22 — proxies/health checks de Google
}

function parseIpv6(ip: string): string[] | null {
  const clean = ip.toLowerCase().split('%')[0]
  if (!/^[0-9a-f:]+$/.test(clean) || clean.length > 39) return null
  const halves = clean.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = halves.length === 2 ? 8 - head.length - tail.length : 0
  if (missing < 0 || (halves.length === 1 && head.length !== 8)) return null
  const groups = [...head, ...Array(missing).fill('0'), ...tail]
  if (groups.length !== 8 || groups.some((g) => g.length === 0 || g.length > 4)) return null
  return groups.map((g) => g.padStart(4, '0'))
}

function ipv6IsInfra(groups: string[]): boolean {
  const first = parseInt(groups[0], 16)
  const allZeroExceptLast = groups.slice(0, 7).every((g) => g === '0000')
  return allZeroExceptLast                         // :: y ::1
    || (first & 0xfe00) === 0xfc00                 // fc00::/7 (ULA)
    || (first & 0xffc0) === 0xfe80                 // fe80::/10 (link-local)
    || (first & 0xff00) === 0xff00                 // multicast
}

/**
 * Normaliza una entrada de X-Forwarded-For: IPv4 tal cual, IPv4 mapeada
 * (::ffff:a.b.c.d) a IPv4, IPv6 a su prefijo /64 (lo que un proveedor le
 * asigna a un solo cliente — si no, rotar direcciones dentro de la misma red
 * evadiría el límite). Devuelve la clase y, si es pública, la forma normalizada.
 */
function classifyEntry(raw: string): { kind: ForwardedEntryClass; normalized?: string } {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(raw)
  const candidate = mapped ? mapped[1] : raw
  const v4 = IPV4_PATTERN.exec(candidate)
  if (v4) {
    const octets = v4.slice(1).map(Number)
    if (octets.some((o) => o > 255)) return { kind: 'invalid' }
    return ipv4IsInfra(octets) ? { kind: 'infra' } : { kind: 'public', normalized: candidate }
  }
  if (!candidate.includes(':')) return { kind: 'invalid' }
  const groups = parseIpv6(candidate)
  if (!groups) return { kind: 'invalid' }
  return ipv6IsInfra(groups) ? { kind: 'infra' } : { kind: 'public', normalized: `${groups.slice(0, 4).join(':')}::/64` }
}

interface RawRequestLike {
  headers?: Record<string, string | string[] | undefined>
}

function forwardedEntries(rawRequest: unknown): string[] {
  const header = ((rawRequest ?? {}) as RawRequestLike).headers?.['x-forwarded-for']
  const joined = Array.isArray(header) ? header.join(',') : header ?? ''
  // Tope defensivo: un header gigante no debería costar más que esto.
  return joined.split(',').slice(-20).map((part) => part.trim()).filter(Boolean)
}

/** IP del cliente (normalizada) o null si no se puede determinar con confianza. */
export function clientIpFromRequest(rawRequest: unknown): string | null {
  const entries = forwardedEntries(rawRequest)
  const candidates = entries.slice(0, Math.max(0, entries.length - TRUSTED_PROXY_HOPS))
  for (let i = candidates.length - 1; i >= 0; i--) {
    const { kind, normalized } = classifyEntry(candidates[i])
    if (kind === 'infra') continue
    // Una entrada inválida en una posición que ya debería haber escrito
    // Google indica que el formato no es el esperado — no se adivina.
    return kind === 'public' ? normalized! : null
  }
  return null
}

/**
 * Forma de X-Forwarded-For sin ninguna dirección (p. ej. "public,infra") —
 * para verificar en staging qué agrega Google sin registrar IPs.
 */
export function forwardedForShape(rawRequest: unknown): string {
  const entries = forwardedEntries(rawRequest)
  return entries.length === 0 ? 'none' : entries.map((e) => classifyEntry(e).kind).join(',')
}
