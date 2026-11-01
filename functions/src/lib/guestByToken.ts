// Helper compartido de las Callables que operan sobre un pase por
// eventId + qrToken (T1 de P0-4; lo van a usar G1–G7). El qrToken es el
// secreto del portador: quien lo tiene es el titular del pase. Nunca se
// busca por un guestId recibido del cliente.
//
// Reglas que este módulo garantiza y que las Callables no deben romper:
// - La búsqueda es exacta (`where qrToken ==` + `limit(1)`, Admin SDK) y
//   solo dentro de events/{eventId}/guests.
// - Evento inexistente y token inexistente devuelven el MISMO error
//   (PASS_NOT_FOUND_MESSAGE) y hacen el mismo trabajo — no se distingue cuál
//   de los dos falló.
// - Nada de lo que registra en logs contiene qrToken, deviceToken,
//   lockTokens, email, teléfono ni IP: solo eventId (no es dato personal),
//   el resultado de la búsqueda y, si aplica, qué límite se superó.
import type { CallableRequest } from 'firebase-functions/v2/https'
import { HttpsError } from 'firebase-functions/v2/https'
import type { DocumentData, DocumentReference, Firestore } from 'firebase-admin/firestore'
import { guestLockTokensOk } from './permissions.js'
import type { ObservabilityContext } from './observability/withObservability.js'
import {
  clientIpFromRequest,
  consumePartitioned,
  countOf,
  forwardedForShape,
  pseudonymize,
  rateLimitDoc,
  rateLimitExceededError,
  recordRateLimitHits,
  type PartitionedRule,
  type RateLimitBucket,
  type RateLimitRule,
} from './rateLimit.js'
import { UnknownIpTelemetry } from './unknownIpTelemetry.js'

export const PASS_NOT_FOUND_MESSAGE = 'No encontramos este pase.'
export const INVALID_PASS_DATA_MESSAGE = 'Los datos del pase no son válidos.'
export const UNRECOGNIZED_DEVICE_MESSAGE = 'No pudimos verificar este dispositivo. Vuelve a abrir el enlace de tu pase.'

// Tolerante a propósito: hoy todos los qrToken son randomUUID() sin guiones
// (32 hex, desde v1.0), pero no se cambia el formato de los existentes ni se
// rechaza uno válido de otra forma.
const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/
// deviceToken = crypto.randomUUID() del navegador (GuestPass.tsx,
// `paselink_lock_${eventId}_${qrToken}`), el único formato que tuvo lockTokens.
const DEVICE_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Límites INICIALES de búsqueda de pases — a revisar con métricas reales
// (ver docs/rate-limiting.md). El qrToken tiene 122 bits de entropía: estos
// límites no protegen la criptografía (un ataque de fuerza bruta es inviable
// igual), sino el costo y el ruido de escaneos automatizados.
//
// Principio (T1.1): los fallos de OTROS nunca bloquean a quien no falló. Un
// invitado que abre su pase con un enlace válido solo puede quedar
// bloqueado por el límite total de su propia IP.
export const PASS_LOOKUP_LIMITS = {
  // --- IP conocida ---
  // Todas las búsquedas desde una IP. Generoso: el WiFi del lugar del evento
  // (o el CGNAT de una operadora móvil) pone a cientos de invitados detrás de
  // una sola IP pública, y abrir el pase en la fila no puede bloquearse.
  // Exacto y repartido en 4 particiones (consumePartitioned) para que la
  // fila de la puerta no compita por un solo documento.
  perIp: { scope: 'passIp', limit: 240, windowMs: 60_000, partitions: 4 },
  // Búsquedas FALLIDAS desde una IP. Un invitado legítimo casi nunca falla
  // (enlace roto, invitado borrado); un escaneo de tokens falla siempre.
  missesPerIp: { scope: 'passMissIp', limit: 10, windowMs: 10 * 60_000 },
  // Umbral de MODO ESTRICTO de un evento, no un bloqueo: con esta cantidad
  // de fallos contra el evento (desde cualquier IP) en la ventana, las IPs
  // que ya fallaron STRICT_MISSES_PER_IP veces dejan de poder buscar en ese
  // evento, y también las solicitudes con IP desconocida. Las IPs sin fallos
  // siguen como siempre.
  missesPerEvent: { scope: 'passMissEvent', limit: 30, windowMs: 10 * 60_000 },

  // --- IP desconocida (T1.3) — nunca afecta a solicitudes con IP conocida ---
  // Presupuesto global de solicitudes con IP desconocida, ANTES de leer
  // nada más (acota el costo de la lectura de existencia del evento). Debe
  // alcanzar aunque una configuración de proxies inesperada deje a TODAS las
  // IPs como desconocidas: 1200/min = dos eventos en plena llegada a la vez
  // (2 × unknownPerEvent). Peor caso de costo ≈ 1200 × 6 lecturas/min.
  // 8 particiones: en ese escenario sería el contador más usado.
  unknownGlobal: { scope: 'passUnkGlobal', limit: 1200, windowMs: 60_000, partitions: 8 },
  // Búsquedas con IP desconocida contra UN evento existente. 600/min cubre la
  // llegada de un evento grande (p. ej. 500 invitados que abren el pase dos
  // veces en pocos minutos) si todas sus IPs quedaran desconocidas.
  unknownPerEvent: { scope: 'passUnkEvent', limit: 600, windowMs: 60_000, partitions: 4 },
  // Fallos con IP desconocida contra un evento: al llegar, se bloquean las
  // búsquedas con IP desconocida de ESE evento (no las de IP conocida, ni
  // las de otros eventos). Mismo valor que missesPerIp: sin poder distinguir
  // solicitantes, se los trata como una sola "IP".
  unknownMissesPerEvent: { scope: 'passUnkMissEvent', limit: 10, windowMs: 10 * 60_000 },
  // Búsquedas con IP desconocida contra eventos que NO existen (ninguna es
  // legítima). Global porque no hay evento al que acotarlo; solo lo alcanzan
  // esas solicitudes, nunca un invitado de un evento real.
  unknownGhost: { scope: 'passUnkGhost', limit: 100, windowMs: 10 * 60_000 },
} as const satisfies Record<string, RateLimitRule | PartitionedRule>

export const STRICT_MISSES_PER_IP = 2

export interface GuestByToken {
  ref: DocumentReference
  /** Para uso interno del servidor — las Callables deciden qué devolver; nunca lockTokens ni contacto. */
  data: DocumentData
}

function invalidPassData(): HttpsError {
  return new HttpsError('invalid-argument', INVALID_PASS_DATA_MESSAGE)
}

/** 1–128 caracteres y un id de documento válido (sin "/", ".", ".." ni "__x__"). */
export function parseEventId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128) throw invalidPassData()
  if (value.includes('/') || value === '.' || value === '..' || /^__.*__$/.test(value)) throw invalidPassData()
  return value
}

export function parseQrToken(value: unknown): string {
  if (typeof value !== 'string' || !QR_TOKEN_PATTERN.test(value)) throw invalidPassData()
  return value
}

export function parseDeviceToken(value: unknown): string {
  if (typeof value !== 'string' || !DEVICE_TOKEN_PATTERN.test(value)) throw invalidPassData()
  return value
}

/**
 * Búsqueda exacta SIN rate limiting. Las Callables públicas deben usar
 * findGuestByTokenForCallable; esta queda para servicios internos que ya
 * validaron y limitaron por su cuenta (y para los tests).
 */
export async function lookupGuestByToken(db: Firestore, eventId: string, qrToken: string): Promise<GuestByToken | null> {
  const snap = await db.collection('events').doc(eventId).collection('guests')
    .where('qrToken', '==', qrToken)
    .limit(1)
    .get()
  if (snap.empty) return null
  return { ref: snap.docs[0].ref, data: snap.docs[0].data() }
}

export interface FindGuestOptions {
  /** rateLimitHmacKey.value() — la Callable tiene que declarar el secret en `secrets: [...]`. */
  hmacKey: string
  ctx?: ObservabilityContext
  now?: number
}

type LimitVerdict = { allowed: true } | { allowed: false; scope: string }

const unknownIpTelemetry = new UnknownIpTelemetry()

function bucket(rule: RateLimitRule, subjectId: string): RateLimitBucket {
  return { rule, subjectId }
}

/**
 * IP conocida: límite total exacto por IP (particionado). En cada intento,
 * dentro de la misma transacción: el contador de fallos de la IP y, solo si
 * esa IP ya falló STRICT_MISSES_PER_IP veces, el modo estricto del evento —
 * una IP limpia (todo invitado legítimo) nunca lee un documento por evento.
 */
async function checkKnownIp(
  db: Firestore,
  ipSubject: string,
  eventMisses: DocumentReference,
  now: number,
): Promise<LimitVerdict> {
  const ipMisses = rateLimitDoc(db, bucket(PASS_LOOKUP_LIMITS.missesPerIp, ipSubject), now).ref
  return consumePartitioned(db, PASS_LOOKUP_LIMITS.perIp, ipSubject, now, async (tx) => {
    const ipMissCount = countOf(await tx.get(ipMisses))
    if (ipMissCount >= PASS_LOOKUP_LIMITS.missesPerIp.limit) return PASS_LOOKUP_LIMITS.missesPerIp.scope
    if (ipMissCount >= STRICT_MISSES_PER_IP && countOf(await tx.get(eventMisses)) >= PASS_LOOKUP_LIMITS.missesPerEvent.limit) {
      return 'passStrictEvent'
    }
    return null
  })
}

/**
 * IP desconocida, evento existente: límite total por evento (particionado);
 * en cada intento, el contador de fallos desconocidos del evento y su modo
 * estricto. Solo cuenta solicitudes con IP desconocida de ESE evento.
 */
async function checkUnknownIpForEvent(
  db: Firestore,
  eventSubject: string,
  eventMisses: DocumentReference,
  now: number,
): Promise<LimitVerdict> {
  const unknownMisses = rateLimitDoc(db, bucket(PASS_LOOKUP_LIMITS.unknownMissesPerEvent, eventSubject), now).ref
  return consumePartitioned(db, PASS_LOOKUP_LIMITS.unknownPerEvent, eventSubject, now, async (tx) => {
    const [unknownMissesSnap, eventMissesSnap] = await tx.getAll(unknownMisses, eventMisses)
    if (countOf(unknownMissesSnap) >= PASS_LOOKUP_LIMITS.unknownMissesPerEvent.limit) return PASS_LOOKUP_LIMITS.unknownMissesPerEvent.scope
    if (countOf(eventMissesSnap) >= PASS_LOOKUP_LIMITS.missesPerEvent.limit) return 'passStrictUnknownIp'
    return null
  })
}

/** Un contador simple con chequeo y suma en la misma transacción (unknownGhost). */
async function consumeSingle(db: Firestore, b: RateLimitBucket, now: number): Promise<LimitVerdict> {
  const { ref, expiresAt } = rateLimitDoc(db, b, now)
  return db.runTransaction(async (tx) => {
    const count = countOf(await tx.get(ref))
    if (count >= b.rule.limit) return { allowed: false as const, scope: b.rule.scope }
    tx.set(ref, { count: count + 1, expiresAt })
    return { allowed: true as const }
  })
}

function blocked(ctx: ObservabilityContext | undefined, scope: string): HttpsError {
  ctx?.addContext({ rateLimited: scope })
  return rateLimitExceededError()
}

function passNotFound(ctx: ObservabilityContext | undefined): HttpsError {
  ctx?.addContext({ passLookup: 'miss' })
  return new HttpsError('not-found', PASS_NOT_FOUND_MESSAGE)
}

/**
 * Flujo completo para una Callable pública: valida eventId/qrToken, aplica
 * los límites de PASS_LOOKUP_LIMITS, busca y, si no encuentra, cuenta el
 * fallo. Errores: invalid-argument, resource-exhausted, not-found (mismo
 * mensaje para evento y token inexistentes). Algoritmo completo en
 * docs/rate-limiting.md.
 */
export async function findGuestByTokenForCallable(
  db: Firestore,
  request: Pick<CallableRequest<unknown>, 'rawRequest'>,
  input: { eventId: unknown; qrToken: unknown },
  { hmacKey, ctx, now = Date.now() }: FindGuestOptions,
): Promise<GuestByToken> {
  const eventId = parseEventId(input.eventId)
  const qrToken = parseQrToken(input.qrToken)

  const ip = clientIpFromRequest(request.rawRequest)
  const forwardedShape = forwardedForShape(request.rawRequest)
  // Forma de X-Forwarded-For (clases, sin direcciones): permite verificar en
  // staging qué agrega Google sin registrar IPs (docs/rate-limiting.md).
  ctx?.addContext({ eventId, ipSource: ip ? 'forwarded' : 'unknown', forwardedShape })

  const eventSubject = pseudonymize(hmacKey, `event:${eventId}`)
  const missesPerEvent = bucket(PASS_LOOKUP_LIMITS.missesPerEvent, eventSubject)
  const eventMissesRef = rateLimitDoc(db, missesPerEvent, now).ref

  if (ip) {
    const ipSubject = pseudonymize(hmacKey, `ip:${ip}`)
    const verdict = await checkKnownIp(db, ipSubject, eventMissesRef, now)
    if (!verdict.allowed) throw blocked(ctx, verdict.scope)

    const guest = await lookupGuestByToken(db, eventId, qrToken)
    if (guest) {
      ctx?.addContext({ passLookup: 'hit' })
      return guest
    }
    // El contador del evento solo se crea para eventos que existen: un
    // eventId inventado no genera ningún documento por evento. (Los eventos
    // ya son de lectura pública: esta lectura no revela nada nuevo.)
    const eventExists = (await db.collection('events').doc(eventId).get()).exists
    await recordRateLimitHits(db, [bucket(PASS_LOOKUP_LIMITS.missesPerIp, ipSubject), ...(eventExists ? [missesPerEvent] : [])], now)
    throw passNotFound(ctx)
  }

  // IP desconocida. 1) Presupuesto global, antes de leer nada más.
  unknownIpTelemetry.record(ctx?.logger, now, forwardedShape)
  const globalVerdict = await consumePartitioned(db, PASS_LOOKUP_LIMITS.unknownGlobal, 'all', now)
  if (!globalVerdict.allowed) throw blocked(ctx, globalVerdict.scope)

  // 2) ¿Existe el evento? Si no, ninguna solicitud es legítima: se cobra
  // unknownGhost y se responde not-found sin buscar invitados.
  if (!(await db.collection('events').doc(eventId).get()).exists) {
    const ghostVerdict = await consumeSingle(db, bucket(PASS_LOOKUP_LIMITS.unknownGhost, 'all'), now)
    if (!ghostVerdict.allowed) throw blocked(ctx, ghostVerdict.scope)
    throw passNotFound(ctx)
  }

  // 3) Evento existente: límites de IP desconocida de ese evento.
  const verdict = await checkUnknownIpForEvent(db, eventSubject, eventMissesRef, now)
  if (!verdict.allowed) throw blocked(ctx, verdict.scope)

  const guest = await lookupGuestByToken(db, eventId, qrToken)
  if (guest) {
    ctx?.addContext({ passLookup: 'hit' })
    return guest
  }
  await recordRateLimitHits(db, [bucket(PASS_LOOKUP_LIMITS.unknownMissesPerEvent, eventSubject), missesPerEvent], now)
  throw passNotFound(ctx)
}

/**
 * ¿`deviceToken` puede escribir sobre este pase? Mismo criterio que hoy
 * aplican firestore.rules y createConcessionOrder (guestLockTokensOk): un
 * pase sin lockTokens (todavía no reclamado por ningún dispositivo) acepta
 * cualquiera; si no, tiene que estar en la lista.
 */
export function isRecognizedDevice(guestData: DocumentData, deviceToken: string): boolean {
  return guestLockTokensOk(guestData, deviceToken)
}

export function assertRecognizedDevice(guestData: DocumentData, deviceToken: unknown): string {
  const token = parseDeviceToken(deviceToken)
  if (!isRecognizedDevice(guestData, token)) throw new HttpsError('permission-denied', UNRECOGNIZED_DEVICE_MESSAGE)
  return token
}
