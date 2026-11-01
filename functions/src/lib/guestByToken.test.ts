import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'

// Captura TODO lo que escribe el logger estructurado, para verificar que
// ningún token ni dato personal llega a los logs.
const writeMock = vi.fn()
vi.mock('firebase-functions/logger', () => ({
  logger: { write: writeMock },
}))

const { clearFirestoreEmulator, getTestFirestore, seedEvent, seedGuest } = await import('../__tests__/helpers.js')
const { withCallableObservability } = await import('./observability/withObservability.js')
const { RATE_LIMIT_COLLECTION, RATE_LIMIT_MESSAGE, partitionCapacities, pseudonymize, rateLimitDoc } = await import('./rateLimit.js')
const { UnknownIpTelemetry } = await import('./unknownIpTelemetry.js')
const {
  INVALID_PASS_DATA_MESSAGE,
  PASS_LOOKUP_LIMITS,
  PASS_NOT_FOUND_MESSAGE,
  STRICT_MISSES_PER_IP,
  UNRECOGNIZED_DEVICE_MESSAGE,
  assertRecognizedDevice,
  findGuestByTokenForCallable,
  isRecognizedDevice,
  parseDeviceToken,
  parseEventId,
  parseQrToken,
} = await import('./guestByToken.js')

// Datos ficticios con los formatos reales (qrToken = randomUUID sin guiones,
// deviceToken = randomUUID con guiones). IPs de los rangos de documentación.
const TEST_KEY = 'clave-hmac-de-prueba-0123456789abcdef'
const EVENT_ID = 'evento-prueba'
const QR_TOKEN = '0f1e2d3c4b5a69788796a5b4c3d2e1f0'
const OTHER_QR_TOKEN = 'aaaabbbbccccddddeeeeffff00001111'
const DEVICE_A = '3b241101-e2bb-4255-8caf-4136c566a962'
const DEVICE_B = '9f8e7d6c-5b4a-4321-8fed-cba987654321'
const EMAIL = 'ana.prueba@example.com'
const PHONE = '5512345678'
const IP = '203.0.113.7'
const NOW = Date.UTC(2026, 10, 1, 12, 0, 0)

type Req = Pick<CallableRequest<unknown>, 'rawRequest'>
function requestFrom(xff: string | null): Req {
  return { rawRequest: { headers: xff === null ? {} : { 'x-forwarded-for': xff } } } as unknown as Req
}
const missToken = (i: number, prefix = 'miss') => `${prefix}${String(i).padStart(32 - prefix.length, '0')}`
const attackerIp = (i: number) => `198.51.100.${i}`

async function codeAndMessage(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await promise
  } catch (err) {
    const e = err as { code: string; message: string }
    return { code: e.code, message: e.message }
  }
  throw new Error('Se esperaba un error')
}

describe('validación de entrada', () => {
  it.each([['vacío', ''], ['129 caracteres', 'x'.repeat(129)], ['con "/"', 'a/b'], ['"."', '.'], ['".."', '..'], ['reservado', '__evento__'], ['no string', 42], ['null', null]])(
    'rejects an eventId that is %s', (_label, value) => {
      expect(() => parseEventId(value)).toThrow(INVALID_PASS_DATA_MESSAGE)
    },
  )

  it('accepts a Firestore auto-id and a 128-character eventId', () => {
    expect(parseEventId('AbCdEf0123456789XyZw')).toBe('AbCdEf0123456789XyZw')
    expect(parseEventId('x'.repeat(128))).toHaveLength(128)
  })

  it.each([['corto', 'abc123'], ['65 caracteres', 'a'.repeat(65)], ['con espacios', 'abcd efgh ijkl mnop'], ['con "/"', 'abcdefgh/ijklmnop'], ['no string', 1234567890123456]])(
    'rejects a qrToken that is %s', (_label, value) => {
      expect(() => parseQrToken(value)).toThrow(INVALID_PASS_DATA_MESSAGE)
    },
  )

  it('accepts the real qrToken format and other tolerated shapes (16–64, letters, digits, - and _)', () => {
    expect(parseQrToken(QR_TOKEN)).toBe(QR_TOKEN)
    expect(parseQrToken('Abc_def-1234567890')).toBe('Abc_def-1234567890')
  })

  it.each([['sin guiones', '3b241101e2bb42558caf4136c566a962'], ['corto', '3b241101-e2bb'], ['con letras no hex', 'zzzzzzzz-e2bb-4255-8caf-4136c566a962'], ['no string', undefined]])(
    'rejects a deviceToken that is %s', (_label, value) => {
      expect(() => parseDeviceToken(value)).toThrow(INVALID_PASS_DATA_MESSAGE)
    },
  )

  it('accepts a crypto.randomUUID() deviceToken, in either case', () => {
    expect(parseDeviceToken(DEVICE_A)).toBe(DEVICE_A)
    expect(parseDeviceToken(DEVICE_A.toUpperCase())).toBe(DEVICE_A.toUpperCase())
  })
})

describe('validación de dispositivo', () => {
  it('recognizes a device in lockTokens and rejects one that is not', () => {
    const guest = { lockTokens: [DEVICE_A] }
    expect(isRecognizedDevice(guest, DEVICE_A)).toBe(true)
    expect(isRecognizedDevice(guest, DEVICE_B)).toBe(false)
    expect(assertRecognizedDevice(guest, DEVICE_A)).toBe(DEVICE_A)
    expect(() => assertRecognizedDevice(guest, DEVICE_B)).toThrow(UNRECOGNIZED_DEVICE_MESSAGE)
  })

  it('keeps the current rule for a pass no device has claimed yet (empty lockTokens accepts any device)', () => {
    expect(isRecognizedDevice({}, DEVICE_B)).toBe(true)
    expect(isRecognizedDevice({ lockTokens: [] }, DEVICE_B)).toBe(true)
  })

  it('validates the format before checking the list', async () => {
    expect(await codeAndMessage(Promise.resolve().then(() => assertRecognizedDevice({ lockTokens: [] }, 'no-es-uuid'))))
      .toEqual({ code: 'invalid-argument', message: INVALID_PASS_DATA_MESSAGE })
    expect(await codeAndMessage(Promise.resolve().then(() => assertRecognizedDevice({ lockTokens: [DEVICE_A] }, DEVICE_B))))
      .toEqual({ code: 'permission-denied', message: UNRECOGNIZED_DEVICE_MESSAGE })
  })
})

describe('findGuestByTokenForCallable (emulador)', () => {
  let db: Firestore
  const L = PASS_LOOKUP_LIMITS
  const find = (input: { eventId: unknown; qrToken: unknown }, opts: { xff?: string | null; now?: number } = {}) =>
    findGuestByTokenForCallable(db, requestFrom(opts.xff === undefined ? IP : opts.xff), input, { hmacKey: TEST_KEY, now: opts.now ?? NOW })
  const allDocs = async () => (await db.collection(RATE_LIMIT_COLLECTION).get()).docs
  const docIds = async () => (await allDocs()).map((d) => d.id)
  const ipSubject = (ip: string) => pseudonymize(TEST_KEY, `ip:${ip}`)
  const eventSubject = (eventId: string) => pseudonymize(TEST_KEY, `event:${eventId}`)

  /** Deja exactamente `remaining` lugares libres en un límite particionado (estado inicial del test, no una solicitud). */
  async function fillPartitioned(rule: { scope: string; limit: number; windowMs: number; partitions: number }, subject: string, remaining: number) {
    const caps = partitionCapacities(rule.limit, rule.partitions)
    let left = remaining
    for (const [p, cap] of caps.entries()) {
      const free = Math.min(left, cap)
      left -= free
      const { ref, expiresAt } = rateLimitDoc(db, { rule: { ...rule, limit: cap }, subjectId: `${subject}p${p}` }, NOW)
      await ref.set({ count: cap - free, expiresAt })
    }
  }

  beforeEach(async () => {
    db = getTestFirestore()
    writeMock.mockReset()
    await seedEvent(db, EVENT_ID)
    await seedGuest(db, EVENT_ID, 'ana', { qrToken: QR_TOKEN, lockTokens: [DEVICE_A], email: EMAIL, phone: PHONE })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await clearFirestoreEmulator()
  })

  describe('búsqueda', () => {
    it('returns the guest for a valid event and token, searching only inside that event', async () => {
      await seedEvent(db, 'otro-evento')
      await seedGuest(db, 'otro-evento', 'beto', { qrToken: OTHER_QR_TOKEN })

      expect((await find({ eventId: EVENT_ID, qrToken: QR_TOKEN })).ref.path).toBe(`events/${EVENT_ID}/guests/ana`)
      expect(await codeAndMessage(find({ eventId: EVENT_ID, qrToken: OTHER_QR_TOKEN })))
        .toEqual({ code: 'not-found', message: PASS_NOT_FOUND_MESSAGE })
    })

    it('answers exactly the same for a nonexistent token and a nonexistent event — with known AND unknown IP', async () => {
      const expected = { code: 'not-found', message: PASS_NOT_FOUND_MESSAGE }
      expect(await codeAndMessage(find({ eventId: EVENT_ID, qrToken: OTHER_QR_TOKEN }))).toEqual(expected)
      expect(await codeAndMessage(find({ eventId: 'evento-inexistente', qrToken: QR_TOKEN }))).toEqual(expected)
      expect(await codeAndMessage(find({ eventId: EVENT_ID, qrToken: OTHER_QR_TOKEN }, { xff: null }))).toEqual(expected)
      expect(await codeAndMessage(find({ eventId: 'evento-inexistente', qrToken: QR_TOKEN }, { xff: null }))).toEqual(expected)
    })

    it('rejects invalid input before touching Firestore (no rate-limit document)', async () => {
      expect(await codeAndMessage(find({ eventId: 'a/b', qrToken: QR_TOKEN }))).toEqual({ code: 'invalid-argument', message: INVALID_PASS_DATA_MESSAGE })
      expect(await codeAndMessage(find({ eventId: EVENT_ID, qrToken: 'corto' }, { xff: null }))).toEqual({ code: 'invalid-argument', message: INVALID_PASS_DATA_MESSAGE })
      expect(await docIds()).toEqual([])
    })
  })

  describe('límite total por IP conocida (exacto, particionado)', () => {
    it(`accepts exactly the remaining slots of the ${L.perIp.limit}/min budget, then resource-exhausted, then resets`, async () => {
      await fillPartitioned(L.perIp, ipSubject(IP), 3)
      for (let i = 0; i < 3; i++) expect((await find({ eventId: EVENT_ID, qrToken: QR_TOKEN })).ref.id).toBe('ana')
      expect(await codeAndMessage(find({ eventId: EVENT_ID, qrToken: QR_TOKEN }))).toEqual({ code: 'resource-exhausted', message: RATE_LIMIT_MESSAGE })
      expect((await find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { now: NOW + L.perIp.windowMs })).ref.id).toBe('ana')
    })

    it('20 simultaneous lookups with 5 slots left: exactly 5 accepted', async () => {
      await fillPartitioned(L.perIp, ipSubject(IP), 5)
      const results = await Promise.allSettled(Array.from({ length: 20 }, () => find({ eventId: EVENT_ID, qrToken: QR_TOKEN })))
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5)
      expect(results.filter((r) => r.status === 'rejected').every((r) => (r as PromiseRejectedResult).reason.code === 'resource-exhausted')).toBe(true)
      const total = (await allDocs()).filter((d) => d.id.startsWith('passIp_')).reduce((s, d) => s + (d.get('count') as number), 0)
      expect(total).toBe(L.perIp.limit)
    }, 60_000)

    it('ignores spoofed leading X-Forwarded-For entries (same real IP, same budget)', async () => {
      await fillPartitioned(L.perIp, ipSubject(IP), 2)
      await find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff: `10.0.0.1, 1.2.3.4, ${IP}` })
      await find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff: `${IP}, 35.191.4.4` })
      expect((await codeAndMessage(find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff: `8.8.8.8, ${IP}` }))).code).toBe('resource-exhausted')
    })

    it('the public API cannot choose the partition (an extra `shard` option is ignored)', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99) // partición 3
      await findGuestByTokenForCallable(db, requestFrom(IP), { eventId: EVENT_ID, qrToken: QR_TOKEN },
        { hmacKey: TEST_KEY, now: NOW, shard: 0 } as unknown as Parameters<typeof findGuestByTokenForCallable>[3])
      const ids = await docIds()
      expect(ids).toHaveLength(1)
      expect(ids[0]).toMatch(/^passIp_[0-9a-f]{32}p3_\d+$/)
    })
  })

  describe('fallos por IP conocida', () => {
    it(`blocks an IP after ${L.missesPerIp.limit} failed lookups, even for a valid token — other IPs unaffected`, async () => {
      for (let i = 0; i < L.missesPerIp.limit; i++) {
        expect((await codeAndMessage(find({ eventId: EVENT_ID, qrToken: missToken(i) }))).code).toBe('not-found')
      }
      expect(await codeAndMessage(find({ eventId: EVENT_ID, qrToken: QR_TOKEN }))).toEqual({ code: 'resource-exhausted', message: RATE_LIMIT_MESSAGE })
      expect((await find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff: '192.0.2.50' })).ref.id).toBe('ana')
      expect((await find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { now: NOW + L.missesPerIp.windowMs })).ref.id).toBe('ana')
    })
  })

  describe('protección contra bloqueo del evento (modo estricto)', () => {
    async function distributedAttack(total: number) {
      // 3 fallos por IP atacante — por encima de STRICT_MISSES_PER_IP, por debajo del límite por IP.
      for (let i = 0; i < total; i++) await codeAndMessage(find({ eventId: EVENT_ID, qrToken: missToken(i, 'atk') }, { xff: attackerIp(Math.floor(i / 3)) }))
    }

    it('a distributed attack can NOT block legitimate guests: clean IPs keep opening their pass', async () => {
      await distributedAttack(L.missesPerEvent.limit + 15)
      for (const legit of ['192.0.2.10', '192.0.2.11', '2001:db8:1::1']) {
        expect((await find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff: legit })).ref.id).toBe('ana')
      }
    })

    it(`in strict mode, an IP with ≥${STRICT_MISSES_PER_IP} misses is blocked for the event; one with fewer is not`, async () => {
      await distributedAttack(L.missesPerEvent.limit)
      expect(await codeAndMessage(find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff: attackerIp(0) }))).toEqual({ code: 'resource-exhausted', message: RATE_LIMIT_MESSAGE })
      await codeAndMessage(find({ eventId: EVENT_ID, qrToken: missToken(1, 'typo') }, { xff: '192.0.2.20' }))
      expect((await find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff: '192.0.2.20' })).ref.id).toBe('ana')
    })

    it(`below the event threshold, an IP with ${STRICT_MISSES_PER_IP}–${L.missesPerIp.limit - 1} misses is NOT blocked`, async () => {
      for (let i = 0; i < 5; i++) await codeAndMessage(find({ eventId: EVENT_ID, qrToken: missToken(i) }))
      expect((await find({ eventId: EVENT_ID, qrToken: QR_TOKEN })).ref.id).toBe('ana')
    })

    it('strict mode on one event does not affect another event', async () => {
      await seedEvent(db, 'otro-evento')
      await seedGuest(db, 'otro-evento', 'beto', { qrToken: OTHER_QR_TOKEN })
      await distributedAttack(L.missesPerEvent.limit)
      expect((await find({ eventId: 'otro-evento', qrToken: OTHER_QR_TOKEN }, { xff: attackerIp(0) })).ref.id).toBe('beto')
    })

    it('strict mode also blocks unknown-IP requests for that event, but never clean known IPs', async () => {
      await distributedAttack(L.missesPerEvent.limit)
      expect(await codeAndMessage(find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff: null }))).toEqual({ code: 'resource-exhausted', message: RATE_LIMIT_MESSAGE })
      expect((await find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff: '192.0.2.30' })).ref.id).toBe('ana')
    })
  })

  describe('IP desconocida', () => {
    beforeEach(async () => {
      await seedEvent(db, 'otro-evento')
      await seedGuest(db, 'otro-evento', 'beto', { qrToken: OTHER_QR_TOKEN })
    })

    it(`accepts unknown-IP lookups up to the per-event limit (${L.unknownPerEvent.limit}/min) and rejects the next — known IPs and other events unaffected`, async () => {
      await fillPartitioned(L.unknownPerEvent, eventSubject(EVENT_ID), 3)
      for (let i = 0; i < 3; i++) expect((await find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff: null })).ref.id).toBe('ana')
      expect(await codeAndMessage(find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff: null }))).toEqual({ code: 'resource-exhausted', message: RATE_LIMIT_MESSAGE })
      expect((await find({ eventId: EVENT_ID, qrToken: QR_TOKEN })).ref.id).toBe('ana')
      expect((await find({ eventId: 'otro-evento', qrToken: OTHER_QR_TOKEN }, { xff: null })).ref.id).toBe('beto')
    })

    it(`${L.unknownMissesPerEvent.limit} unknown-IP misses block only unknown-IP lookups of THAT event`, async () => {
      for (let i = 0; i < L.unknownMissesPerEvent.limit; i++) {
        expect((await codeAndMessage(find({ eventId: EVENT_ID, qrToken: missToken(i, 'unk') }, { xff: null }))).code).toBe('not-found')
      }
      expect(await codeAndMessage(find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff: null }))).toEqual({ code: 'resource-exhausted', message: RATE_LIMIT_MESSAGE })
      expect((await find({ eventId: EVENT_ID, qrToken: QR_TOKEN })).ref.id).toBe('ana')                          // IP conocida
      expect((await find({ eventId: 'otro-evento', qrToken: OTHER_QR_TOKEN }, { xff: null })).ref.id).toBe('beto') // otro evento
      expect((await find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff: null, now: NOW + L.unknownMissesPerEvent.windowMs })).ref.id).toBe('ana')
    })

    it('the global unknown-IP budget caps every unknown-IP lookup (before any other read), never known IPs', async () => {
      await fillPartitioned(L.unknownGlobal, 'all', 0)
      expect(await codeAndMessage(find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff: null }))).toEqual({ code: 'resource-exhausted', message: RATE_LIMIT_MESSAGE })
      expect(await codeAndMessage(find({ eventId: 'evento-inexistente', qrToken: QR_TOKEN }, { xff: null }))).toEqual({ code: 'resource-exhausted', message: RATE_LIMIT_MESSAGE })
      expect((await find({ eventId: EVENT_ID, qrToken: QR_TOKEN })).ref.id).toBe('ana')
    })

    it('nonexistent events are capped by unknownGhost, create no per-event documents, and do not affect real events', async () => {
      const ghost = rateLimitDoc(db, { rule: L.unknownGhost, subjectId: 'all' }, NOW)
      await ghost.ref.set({ count: L.unknownGhost.limit - 2, expiresAt: ghost.expiresAt })
      expect((await codeAndMessage(find({ eventId: 'inventado-1', qrToken: QR_TOKEN }, { xff: null }))).code).toBe('not-found')
      expect((await codeAndMessage(find({ eventId: 'inventado-2', qrToken: QR_TOKEN }, { xff: null }))).code).toBe('not-found')
      expect(await codeAndMessage(find({ eventId: 'inventado-3', qrToken: QR_TOKEN }, { xff: null }))).toEqual({ code: 'resource-exhausted', message: RATE_LIMIT_MESSAGE })
      expect((await find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff: null })).ref.id).toBe('ana')
      const ids = await docIds()
      expect(ids.some((id) => /^pass(MissEvent|UnkEvent|UnkMissEvent)_/.test(id) && !id.includes(eventSubject(EVENT_ID)))).toBe(false)
    })

    it.each([
      ['IPv6 entre corchetes', '[2001:db8::1]'],
      ['IPv4 con puerto', '203.0.113.7:4321'],
      ['solo infraestructura', '10.0.0.1, 35.191.0.1, 169.254.0.1'],
      ['sin encabezado', null],
    ])('a header with %s resolves to unknown IP and is still rate limited (never unprotected)', async (_label, xff) => {
      await fillPartitioned(L.unknownPerEvent, eventSubject(EVENT_ID), 1)
      expect((await find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff })).ref.id).toBe('ana')
      expect(await codeAndMessage(find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff }))).toEqual({ code: 'resource-exhausted', message: RATE_LIMIT_MESSAGE })
      expect((await docIds()).some((id) => id.startsWith('passIp_'))).toBe(false)
    })
  })

  describe('recursos y documentos', () => {
    it('stays within the document bound: no per-event documents for invented eventIds, ≤4 partitions + 1 miss doc per known IP, ≤8 global + 1 ghost for unknown', async () => {
      const ips = ['192.0.2.1', '192.0.2.2', '192.0.2.3', '192.0.2.4', '192.0.2.5']
      for (const ip of ips) {
        for (let i = 0; i < 3; i++) await codeAndMessage(find({ eventId: `inventado-${ip}-${i}`, qrToken: missToken(i) }, { xff: ip }))
        await find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff: ip })
      }
      for (let i = 0; i < 30; i++) await codeAndMessage(find({ eventId: `fantasma-${i}`, qrToken: QR_TOKEN }, { xff: null }))

      const ids = await docIds()
      const count = (prefix: string) => ids.filter((id) => id.startsWith(prefix)).length
      expect(count('passMissEvent_') + count('passUnkEvent_') + count('passUnkMissEvent_')).toBe(0)
      expect(count('passIp_')).toBeLessThanOrEqual(ips.length * L.perIp.partitions)
      expect(count('passMissIp_')).toBe(ips.length)
      expect(count('passUnkGlobal_')).toBeLessThanOrEqual(L.unknownGlobal.partitions)
      expect(count('passUnkGhost_')).toBe(1)
    }, 60_000)

    it('no single hot document: unknown-IP traffic for one event spreads over the global and per-event partitions', async () => {
      for (let i = 0; i < 60; i++) await find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff: null })
      const docs = await allDocs()
      const used = (prefix: string) => docs.filter((d) => d.id.startsWith(prefix))
      expect(used('passUnkGlobal_').length).toBeGreaterThan(1)
      expect(used('passUnkEvent_').length).toBeGreaterThan(1)
      for (const d of [...used('passUnkGlobal_'), ...used('passUnkEvent_')]) expect(d.get('count') as number).toBeLessThan(60)
      // Las búsquedas exitosas no escriben ningún contador de fallos compartido.
      expect(used('passUnkMissEvent_')).toHaveLength(0)
      expect(used('passMissEvent_')).toHaveLength(0)
    }, 60_000)

    it('a successful lookup from a clean known IP writes only one of its own partitions', async () => {
      await find({ eventId: EVENT_ID, qrToken: QR_TOKEN })
      const ids = await docIds()
      expect(ids).toHaveLength(1)
      expect(ids[0]).toMatch(/^passIp_[0-9a-f]{32}p[0-3]_\d+$/)
    })

    it('never writes IPs, eventIds or qrTokens into rate-limit documents', async () => {
      await find({ eventId: EVENT_ID, qrToken: QR_TOKEN })
      await codeAndMessage(find({ eventId: EVENT_ID, qrToken: OTHER_QR_TOKEN }))
      await find({ eventId: EVENT_ID, qrToken: QR_TOKEN }, { xff: null })
      await codeAndMessage(find({ eventId: EVENT_ID, qrToken: OTHER_QR_TOKEN }, { xff: null }))
      await codeAndMessage(find({ eventId: 'fantasma', qrToken: QR_TOKEN }, { xff: null }))
      const dump = (await allDocs()).map((d) => JSON.stringify({ id: d.id, ...d.data() })).join('\n')
      for (const secret of [IP, EVENT_ID, 'fantasma', QR_TOKEN, OTHER_QR_TOKEN]) expect(dump).not.toContain(secret)
      for (const d of await allDocs()) expect(Object.keys(d.data()).sort()).toEqual(['count', 'expiresAt'])
    })
  })

  describe('fallo cerrado', () => {
    const callable = (database: Firestore, hmacKey: string, xff: string | null = IP) =>
      withCallableObservability({ ...requestFrom(xff), data: {}, auth: undefined } as unknown as CallableRequest<unknown>, 'pruebaPase', (ctx) =>
        findGuestByTokenForCallable(database, requestFrom(xff), { eventId: EVENT_ID, qrToken: QR_TOKEN }, { hmacKey, ctx, now: NOW }))

    it('answers a generic internal error (never the pass) when RATE_LIMIT_HMAC_KEY is missing or too short — known and unknown IP', async () => {
      for (const [key, xff] of [['', IP], ['corta', IP], ['', null]] as const) {
        const { code, message } = await codeAndMessage(callable(db, key, xff))
        expect(code).toBe('internal')
        expect(message).not.toMatch(/RATE_LIMIT_HMAC_KEY/)
      }
    })

    it('answers a generic internal error (never the pass) when Firestore fails — known and unknown IP', async () => {
      const brokenDb = {
        collection: () => ({ doc: () => ({ get: () => Promise.reject(new Error('14 UNAVAILABLE: Firestore no responde')) }) }),
        runTransaction: () => Promise.reject(new Error('14 UNAVAILABLE: Firestore no responde')),
      } as unknown as Firestore
      for (const xff of [IP, null]) {
        const { code, message } = await codeAndMessage(callable(brokenDb, TEST_KEY, xff))
        expect(code).toBe('internal')
        expect(message).not.toMatch(/Firestore|UNAVAILABLE/)
      }
    })
  })

  describe('logs y telemetría', () => {
    it('never logs tokens, lockTokens, email, phone, IP or the HMAC key — through the real observability wrapper', async () => {
      const callable = (data: { eventId: unknown; qrToken: unknown; deviceToken?: unknown }, xff: string | null = IP) =>
        withCallableObservability({ ...requestFrom(xff), data, auth: undefined } as unknown as CallableRequest<unknown>, 'pruebaPase', async (ctx) => {
          const guest = await findGuestByTokenForCallable(db, requestFrom(xff), data, { hmacKey: TEST_KEY, ctx, now: NOW })
          if (data.deviceToken !== undefined) assertRecognizedDevice(guest.data, data.deviceToken)
          return { ok: true }
        })

      await callable({ eventId: EVENT_ID, qrToken: QR_TOKEN, deviceToken: DEVICE_A }, `1.1.1.1, ${IP}, 35.191.0.9`) // éxito
      await codeAndMessage(callable({ eventId: EVENT_ID, qrToken: QR_TOKEN, deviceToken: DEVICE_B }))              // dispositivo no reconocido
      await codeAndMessage(callable({ eventId: EVENT_ID, qrToken: QR_TOKEN, deviceToken: 'no-es-uuid' }))          // dispositivo inválido
      await codeAndMessage(callable({ eventId: EVENT_ID, qrToken: 'corto' }))                                      // token inválido
      await callable({ eventId: EVENT_ID, qrToken: QR_TOKEN }, '[2001:db8::1]')                                    // IP desconocida
      for (let i = 0; i <= L.missesPerIp.limit; i++) {                                                              // fallos + bloqueo
        await codeAndMessage(callable({ eventId: EVENT_ID, qrToken: missToken(i, 'log') }))
      }

      const logs = JSON.stringify(writeMock.mock.calls)
      expect(writeMock).toHaveBeenCalled()
      for (const secret of [QR_TOKEN, 'log00000', DEVICE_A, DEVICE_B, 'no-es-uuid', EMAIL, PHONE, IP, '1.1.1.1', '35.191.0.9', '2001:db8', TEST_KEY]) {
        expect(logs).not.toContain(secret)
      }
      expect(logs).toContain('"passLookup":"hit"')
      expect(logs).toContain('"passLookup":"miss"')
      expect(logs).toContain('"rateLimited":"passMissIp"')
      expect(logs).toContain('"ipSource":"forwarded"')
      expect(logs).toContain('"ipSource":"unknown"')
      expect(logs).toContain('"forwardedShape":"public,public,infra"')
    }, 60_000)

    it('unknown IPs produce at most one aggregated warning per minute — never one per request', async () => {
      const T = NOW + 30 * 24 * 60 * 60_000 // lejos de cualquier ventana de otros tests
      const callable = (now: number) =>
        withCallableObservability({ ...requestFrom(null), data: {}, auth: undefined } as unknown as CallableRequest<unknown>, 'pruebaPase', (ctx) =>
          findGuestByTokenForCallable(db, requestFrom(null), { eventId: EVENT_ID, qrToken: QR_TOKEN }, { hmacKey: TEST_KEY, ctx, now }))
      const summaries = () => writeMock.mock.calls.map((c) => c[0] as { unknownIpCount?: number }).filter((e) => e.unknownIpCount !== undefined)

      await callable(T) // puede vaciar lo acumulado por otros tests
      writeMock.mockReset()
      for (let i = 1; i < 50; i++) await callable(T + i * 1000)
      expect(summaries()).toHaveLength(0)
      await callable(T + 60_000)
      expect(summaries()).toHaveLength(1)
      expect(summaries()[0].unknownIpCount).toBe(50)
    }, 60_000)
  })
})

describe('UnknownIpTelemetry', () => {
  it('aggregates per minute, caps distinct shapes and never stores addresses', () => {
    const warn = vi.fn()
    const logger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }
    const t = new UnknownIpTelemetry()
    for (let i = 0; i < 30; i++) t.record(logger, NOW + i, `forma-${i}`)
    expect(warn).not.toHaveBeenCalled()
    t.record(logger, NOW + 60_000, 'none')
    expect(warn).toHaveBeenCalledTimes(1)
    const [, fields] = warn.mock.calls[0] as [string, { unknownIpCount: number; forwardedShapes: Record<string, number> }]
    expect(fields.unknownIpCount).toBe(30)
    expect(Object.keys(fields.forwardedShapes).length).toBeLessThanOrEqual(11)
    expect(fields.forwardedShapes.other).toBe(20)
  })
})
