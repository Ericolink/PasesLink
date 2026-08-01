import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, getWaitlistEntry, seedEvent, seedWaitlistEntry, uniqueId } from '../__tests__/helpers.js'
import { attemptPromote, cancelOffer, MIN_TIME_BEFORE_EVENT_MS } from './promote.js'

describe('attemptPromote', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('offers a waiting entry that fits within remaining capacity', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 9 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { partySize: 1 })

    const result = await attemptPromote(db, eventId, 'entry-1', 'fifo')

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')

    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    expect(entry?.status).toBe('offered')
    expect(entry?.offerToken).toBe(result.offerToken)
    expect(entry?.offerExpiresAt).toBeNull()
    expect(entry?.promotionReason).toBe('fifo')
  })

  it('rejects when the party does not fit in the remaining capacity', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 9 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { partySize: 2 })

    const result = await attemptPromote(db, eventId, 'entry-1', 'fifo')

    expect(result).toEqual({ ok: false, reason: 'no_capacity' })
    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    expect(entry?.status).toBe('waiting')
  })

  it('accounts for other already-offered entries when computing remaining capacity', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 8 })
    // Ya hay una oferta activa de 2 personas — solo queda 0 lugares reales
    // aunque peopleCount (8) + capacity (10) sugiera 2 libres.
    await seedWaitlistEntry(db, eventId, 'already-offered', { status: 'offered', partySize: 2, offerToken: 'x', offerExpiresAt: Date.now() + 1000 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { partySize: 1 })

    const result = await attemptPromote(db, eventId, 'entry-1', 'fifo')

    expect(result).toEqual({ ok: false, reason: 'no_capacity' })
  })

  it('rejects an entry that is not waiting', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 0 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'promoted' })

    const result = await attemptPromote(db, eventId, 'entry-1', 'fifo')

    expect(result).toEqual({ ok: false, reason: 'not_waiting' })
  })

  it('rejects a missing entry', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)

    const result = await attemptPromote(db, eventId, 'does-not-exist', 'fifo')

    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })

  it('refuses to offer when the event starts in less than the minimum window', async () => {
    const eventId = uniqueId('event')
    // eventStartMs (promote.ts) parsea `${date}T${startTime}:00` como hora
    // LOCAL (sin sufijo Z) — hay que construir date/startTime a partir de
    // los mismos componentes locales, nunca mezclar con toISOString (UTC),
    // o el offset horario local puede hacer que el test compare contra un
    // instante equivocado.
    const soon = new Date(Date.now() + MIN_TIME_BEFORE_EVENT_MS / 2)
    const pad = (n: number) => String(n).padStart(2, '0')
    await seedEvent(db, eventId, {
      capacity: 10,
      peopleCount: 0,
      date: `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`,
      startTime: `${pad(soon.getHours())}:${pad(soon.getMinutes())}`,
    })
    await seedWaitlistEntry(db, eventId, 'entry-1')

    const result = await attemptPromote(db, eventId, 'entry-1', 'fifo')

    expect(result).toEqual({ ok: false, reason: 'event_too_close' })
  })

  it('never lets two simultaneous promotions of the same entry both succeed', async () => {
    // Mismo escenario de carrera que ya prueba capacity.test.ts para
    // registerWalkInGuest, aplicado acá: dos intentos de ofertar LA MISMA
    // entrada al mismo tiempo (ej. la cascada automática y una asignación
    // manual del organizador apuntando a la misma persona).
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 0 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { partySize: 1 })

    const results = await Promise.all([
      attemptPromote(db, eventId, 'entry-1', 'fifo'),
      attemptPromote(db, eventId, 'entry-1', 'manual'),
    ])

    const succeeded = results.filter((r) => r.ok)
    expect(succeeded).toHaveLength(1)
  })
})

describe('cancelOffer', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('reverts an offered entry back to waiting, keeping its queue position', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    await seedWaitlistEntry(db, eventId, 'entry-1', {
      status: 'offered', offerToken: 'token-1', priorityBoost: 3, createdAt: 1000,
    })

    const result = await cancelOffer(db, eventId, 'entry-1')

    expect(result).toEqual({ ok: true })
    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    expect(entry?.status).toBe('waiting')
    expect(entry?.offerToken).toBeNull()
    expect(entry?.promotionReason).toBeNull()
    // No fue elección del invitado — conserva su lugar en la fila.
    expect(entry?.priorityBoost).toBe(3)
    expect(entry?.createdAt).toBe(1000)
  })

  it('rejects cancelling an entry that is not currently offered', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'waiting' })

    const result = await cancelOffer(db, eventId, 'entry-1')

    expect(result).toEqual({ ok: false, reason: 'not_offered' })
  })

  it('rejects a missing entry', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)

    const result = await cancelOffer(db, eventId, 'does-not-exist')

    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })
})
