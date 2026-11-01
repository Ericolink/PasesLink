import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore } from '../__tests__/helpers.js'
import {
  RATE_LIMIT_COLLECTION,
  clientIpFromRequest,
  consumePartitioned,
  forwardedForShape,
  partitionCapacities,
  pseudonymize,
  rateLimitDoc,
  recordRateLimitHits,
  type PartitionedRule,
  type RateLimitBucket,
} from './rateLimit.js'

// Clave ficticia solo para tests — la real vive en Secret Manager (RATE_LIMIT_HMAC_KEY).
const TEST_KEY = 'clave-hmac-de-prueba-0123456789abcdef'
const NOW = Date.UTC(2026, 10, 1, 12, 0, 0)
const CLIENT = '203.0.113.7'
const xff = (value: string) => ({ headers: { 'x-forwarded-for': value } })

describe('clientIpFromRequest — IP confiable desde X-Forwarded-For', () => {
  it('uses the only entry when Google appends just the client', () => {
    expect(clientIpFromRequest(xff(CLIENT))).toBe(CLIENT)
  })

  it('skips Google proxy / private entries appended AFTER the client (format of the Cloud Run functions docs)', () => {
    expect(clientIpFromRequest(xff(`${CLIENT}, 35.191.10.20`))).toBe(CLIENT)
    expect(clientIpFromRequest(xff(`${CLIENT}, 130.211.2.5, 169.254.1.1`))).toBe(CLIENT)
    expect(clientIpFromRequest(xff(`${CLIENT}, 10.0.0.5`))).toBe(CLIENT)
  })

  it('never picks a client-supplied (spoofable) entry over the one Google appended', () => {
    expect(clientIpFromRequest(xff(`1.1.1.1, 8.8.8.8, ${CLIENT}`))).toBe(CLIENT)
    expect(clientIpFromRequest(xff(`9.9.9.9, ${CLIENT}, 35.191.0.1`))).toBe(CLIENT)
    // Un cliente que "inyecta" rangos de Google no consigue nada: igual se elige la entrada de Google.
    expect(clientIpFromRequest(xff(`35.191.0.1, ${CLIENT}`))).toBe(CLIENT)
  })

  it('returns null (unknown) instead of guessing when the trusted position is not a public IP', () => {
    expect(clientIpFromRequest(xff('basura'))).toBeNull()
    expect(clientIpFromRequest(xff(`${CLIENT}, no-es-ip`))).toBeNull()
    expect(clientIpFromRequest(xff('10.0.0.1, 192.168.1.1'))).toBeNull()
    expect(clientIpFromRequest(xff('999.1.1.1'))).toBeNull()
  })

  it('never falls back to req.ip / socket (on Cloud Run that is the shared Google proxy)', () => {
    expect(clientIpFromRequest({ ip: '198.51.100.1', socket: { remoteAddress: '198.51.100.2' } })).toBeNull()
    expect(clientIpFromRequest({})).toBeNull()
    expect(clientIpFromRequest(undefined)).toBeNull()
  })

  it('normalizes IPv4-mapped IPv6 and groups IPv6 by /64 (rotating inside one network does not help)', () => {
    expect(clientIpFromRequest(xff('::ffff:203.0.113.7'))).toBe(CLIENT)
    const a = clientIpFromRequest(xff('2001:db8:abcd:12::1'))
    expect(a).toBe('2001:0db8:abcd:0012::/64')
    expect(clientIpFromRequest(xff('2001:0db8:abcd:0012:ffff:eeee:dddd:cccc'))).toBe(a)
    expect(clientIpFromRequest(xff('2001:db8:abcd:13::1'))).not.toBe(a)
    expect(clientIpFromRequest(xff('2001:db8:abcd:12::1, fe80::1'))).toBe(a)
    expect(clientIpFromRequest(xff('::1'))).toBeNull()
  })

  it('handles header arrays and caps absurdly long headers', () => {
    expect(clientIpFromRequest({ headers: { 'x-forwarded-for': ['1.1.1.1', CLIENT] } })).toBe(CLIENT)
    const huge = `${Array.from({ length: 5000 }, (_, i) => `10.${i % 250}.0.1`).join(',')}, ${CLIENT}`
    expect(clientIpFromRequest(xff(huge))).toBe(CLIENT)
  })
})

describe('forwardedForShape', () => {
  it('describes the header by entry class only — never an address', () => {
    expect(forwardedForShape(xff(`1.1.1.1, ${CLIENT}, 35.191.0.1, x`))).toBe('public,public,infra,invalid')
    expect(forwardedForShape({})).toBe('none')
    expect(forwardedForShape(xff(CLIENT))).not.toContain(CLIENT)
  })
})

describe('pseudonymize', () => {
  it('is deterministic, never contains the input, and depends on the key', () => {
    const id = pseudonymize(TEST_KEY, `ip:${CLIENT}`)
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(id).toBe(pseudonymize(TEST_KEY, `ip:${CLIENT}`))
    expect(id).not.toContain(CLIENT)
    expect(pseudonymize(`${TEST_KEY}-otra`, `ip:${CLIENT}`)).not.toBe(id)
  })

  it('fails closed without a usable key (missing or too short)', () => {
    expect(() => pseudonymize('', 'x')).toThrow(/RATE_LIMIT_HMAC_KEY/)
    expect(() => pseudonymize('corta', 'x')).toThrow(/RATE_LIMIT_HMAC_KEY/)
    expect(() => pseudonymize(undefined as unknown as string, 'x')).toThrow(/RATE_LIMIT_HMAC_KEY/)
  })
})

describe('rateLimitDoc / recordRateLimitHits (emulador)', () => {
  let db: Firestore
  const bucket: RateLimitBucket = { rule: { scope: 'test', limit: 3, windowMs: 60_000 }, subjectId: pseudonymize(TEST_KEY, `ip:${CLIENT}`) }

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('uses a new document per window and expires it one hour after the window ends', () => {
    const a = rateLimitDoc(db, bucket, NOW)
    const sameWindow = rateLimitDoc(db, bucket, NOW + 59_000 - (NOW % 60_000))
    const next = rateLimitDoc(db, bucket, NOW + 60_000)
    expect(sameWindow.ref.id).toBe(a.ref.id)
    expect(next.ref.id).not.toBe(a.ref.id)
    const windowEnd = (Math.floor(NOW / 60_000) + 1) * 60_000
    expect(a.expiresAt.toMillis()).toBe(windowEnd + 60 * 60_000)
  })

  it('counts concurrent hits exactly (atomic increment, no lost updates)', async () => {
    await Promise.all(Array.from({ length: 15 }, () => recordRateLimitHits(db, [bucket], NOW)))
    expect((await rateLimitDoc(db, bucket, NOW).ref.get()).get('count')).toBe(15)
  })

  it('stores only a pseudonym, a count and expiresAt — never the raw subject', async () => {
    await recordRateLimitHits(db, [bucket], NOW)
    const [d] = (await db.collection(RATE_LIMIT_COLLECTION).get()).docs
    expect(JSON.stringify({ id: d.id, ...d.data() })).not.toContain(CLIENT)
    expect(Object.keys(d.data()).sort()).toEqual(['count', 'expiresAt'])
  })
})

describe('partitionCapacities', () => {
  it.each([[240, 4], [241, 4], [250, 4], [3, 4], [1200, 8], [7, 8], [0, 4]])('splits %i across %i partitions summing exactly to the limit', (limit, partitions) => {
    const caps = partitionCapacities(limit, partitions)
    expect(caps).toHaveLength(partitions)
    expect(caps.reduce((a, b) => a + b, 0)).toBe(limit)
    expect(Math.max(...caps) - Math.min(...caps)).toBeLessThanOrEqual(1)
  })
})

describe('consumePartitioned — límite exacto (emulador)', () => {
  let db: Firestore
  const rule = (limit: number): PartitionedRule => ({ scope: 'exacto', limit, windowMs: 60_000, partitions: 4 })
  const totalCount = async () => (await db.collection(RATE_LIMIT_COLLECTION).get()).docs.reduce((sum, d) => sum + (d.get('count') as number), 0)

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await clearFirestoreEmulator()
  })

  it.each([240, 241, 250, 3])('accepts exactly %i sequential requests (random start) and rejects the next one — no premature rejection', async (limit) => {
    for (let i = 0; i < limit; i++) {
      expect(await consumePartitioned(db, rule(limit), 'sujeto', NOW)).toEqual({ allowed: true })
    }
    expect(await consumePartitioned(db, rule(limit), 'sujeto', NOW)).toEqual({ allowed: false, scope: 'exacto' })
    expect(await totalCount()).toBe(limit)
  }, 120_000)

  it('rejects only when ALL partitions are full: a full starting partition falls through to the next', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // siempre arranca en la partición 0
    const caps = partitionCapacities(10, 4) // [3,3,2,2]
    for (let i = 0; i < caps[0]; i++) await consumePartitioned(db, rule(10), 'sujeto', NOW)
    // La partición 0 está llena: la siguiente solicitud igual se acepta (cae en la 1).
    expect(await consumePartitioned(db, rule(10), 'sujeto', NOW)).toEqual({ allowed: true })
    for (let i = 0; i < 10 - caps[0] - 1; i++) expect((await consumePartitioned(db, rule(10), 'sujeto', NOW)).allowed).toBe(true)
    expect(await consumePartitioned(db, rule(10), 'sujeto', NOW)).toEqual({ allowed: false, scope: 'exacto' })
  })

  it('40 simultaneous requests with 30 slots left: exactly 30 accepted, total exactly the limit', async () => {
    for (let i = 0; i < 20; i++) await consumePartitioned(db, rule(50), 'sujeto', NOW)
    const results = await Promise.all(Array.from({ length: 40 }, () => consumePartitioned(db, rule(50), 'sujeto', NOW)))
    expect(results.filter((r) => r.allowed)).toHaveLength(30)
    expect(await totalCount()).toBe(50)
  }, 60_000)

  it('a guard that blocks stops immediately and writes nothing', async () => {
    const result = await consumePartitioned(db, rule(10), 'sujeto', NOW, async () => 'bloqueadoPorGuard')
    expect(result).toEqual({ allowed: false, scope: 'bloqueadoPorGuard' })
    expect(await totalCount()).toBe(0)
  })

  it('starts a fresh budget in the next window', async () => {
    for (let i = 0; i < 3; i++) await consumePartitioned(db, rule(3), 'sujeto', NOW)
    expect((await consumePartitioned(db, rule(3), 'sujeto', NOW)).allowed).toBe(false)
    expect((await consumePartitioned(db, rule(3), 'sujeto', NOW + 60_000)).allowed).toBe(true)
  })
})
