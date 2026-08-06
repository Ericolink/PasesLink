import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import {
  clearFirestoreEmulator,
  getConcessionFulfillmentDoc,
  getConcessionItemDoc,
  getConcessionOrderDoc,
  getTestFirestore,
  seedConcessionFulfillment,
  seedConcessionItem,
  seedConcessionOrder,
  seedEvent,
  uniqueId,
} from '../__tests__/helpers.js'
import {
  ABANDONED_ORDER_THRESHOLD_MS,
  deleteAbandonedConcessionOrder,
  isAbandonedConcessionOrder,
  runAbandonedConcessionOrdersSweep,
} from './sweepAbandonedOrders.js'

const NOW = Date.parse('2026-08-05T12:00:00Z')
const STALE_UPDATED_AT = Timestamp.fromMillis(NOW - ABANDONED_ORDER_THRESHOLD_MS - 60_000)
const RECENT_UPDATED_AT = Timestamp.fromMillis(NOW - 60_000)

describe('isAbandonedConcessionOrder', () => {
  it('is false for a recently updated order awaiting payment', () => {
    expect(isAbandonedConcessionOrder({ paymentPhase: 'awaiting_payment', updatedAt: RECENT_UPDATED_AT }, NOW)).toBe(false)
  })

  it('is true for an order stuck in awaiting_payment past the threshold', () => {
    expect(isAbandonedConcessionOrder({ paymentPhase: 'awaiting_payment', updatedAt: STALE_UPDATED_AT }, NOW)).toBe(true)
  })

  it('is true for a stale rejected order', () => {
    expect(isAbandonedConcessionOrder({ paymentPhase: 'rejected', updatedAt: STALE_UPDATED_AT }, NOW)).toBe(true)
  })

  it('is false for a stale but confirmed (paid) order', () => {
    expect(isAbandonedConcessionOrder({ paymentPhase: 'confirmed', updatedAt: STALE_UPDATED_AT }, NOW)).toBe(false)
  })

  it('is false for a stale proof_submitted order (waiting on staff review)', () => {
    expect(isAbandonedConcessionOrder({ paymentPhase: 'proof_submitted', updatedAt: STALE_UPDATED_AT }, NOW)).toBe(false)
  })
})

describe('deleteAbandonedConcessionOrder', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('deletes an abandoned order and releases its reserved stock', async () => {
    const eventId = uniqueId('event')
    const itemId = 'item-soda'
    await seedEvent(db, eventId, { concessions: { enabled: true } })
    await seedConcessionItem(db, eventId, itemId, { stockMode: 'limited', stockRemaining: 3, status: 'active' })
    await seedConcessionOrder(db, eventId, 'order-1', {
      paymentPhase: 'awaiting_payment',
      updatedAt: STALE_UPDATED_AT,
      items: [{ itemId, nameSnapshot: 'Soda italiana', categorySnapshot: 'drink', unitPriceMinorUnitsSnapshot: 3500, quantity: 2, lineTotalMinorUnits: 7000 }],
    })
    await seedConcessionFulfillment(db, eventId, 'order-1', { fulfillmentStatus: 'not_ready' })

    const result = await deleteAbandonedConcessionOrder(db, eventId, 'order-1', NOW)

    expect(result.status).toBe('deleted')
    expect(await getConcessionOrderDoc(db, eventId, 'order-1')).toBeUndefined()
    expect(await getConcessionFulfillmentDoc(db, eventId, 'order-1')).toBeUndefined()
    const item = await getConcessionItemDoc(db, eventId, itemId)
    expect(item?.stockRemaining).toBe(5)
  })

  it('does not delete a recently updated (still active) order', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { concessions: { enabled: true } })
    await seedConcessionOrder(db, eventId, 'order-1', { paymentPhase: 'awaiting_payment', updatedAt: RECENT_UPDATED_AT })

    const result = await deleteAbandonedConcessionOrder(db, eventId, 'order-1', NOW)

    expect(result.status).toBe('not_eligible')
    expect(await getConcessionOrderDoc(db, eventId, 'order-1')).toBeDefined()
  })

  it('never deletes a paid (confirmed) order, even if stale', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { concessions: { enabled: true } })
    await seedConcessionOrder(db, eventId, 'order-1', { paymentPhase: 'confirmed', updatedAt: STALE_UPDATED_AT })

    const result = await deleteAbandonedConcessionOrder(db, eventId, 'order-1', NOW)

    expect(result.status).toBe('not_eligible')
    expect(await getConcessionOrderDoc(db, eventId, 'order-1')).toBeDefined()
  })

  it('never deletes a delivered order, even if stale', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { concessions: { enabled: true } })
    await seedConcessionOrder(db, eventId, 'order-1', { paymentPhase: 'confirmed', updatedAt: STALE_UPDATED_AT })
    await seedConcessionFulfillment(db, eventId, 'order-1', { fulfillmentStatus: 'delivered' })

    const result = await deleteAbandonedConcessionOrder(db, eventId, 'order-1', NOW)

    expect(result.status).toBe('not_eligible')
    expect(await getConcessionOrderDoc(db, eventId, 'order-1')).toBeDefined()
  })

  it('never deletes an order awaiting staff review (proof_submitted), even if stale', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { concessions: { enabled: true } })
    await seedConcessionOrder(db, eventId, 'order-1', { paymentPhase: 'proof_submitted', updatedAt: STALE_UPDATED_AT })

    const result = await deleteAbandonedConcessionOrder(db, eventId, 'order-1', NOW)

    expect(result.status).toBe('not_eligible')
    expect(await getConcessionOrderDoc(db, eventId, 'order-1')).toBeDefined()
  })

  it('is idempotent: running it again on an already-deleted order is a safe no-op', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { concessions: { enabled: true } })
    await seedConcessionOrder(db, eventId, 'order-1', { paymentPhase: 'awaiting_payment', updatedAt: STALE_UPDATED_AT })

    const first = await deleteAbandonedConcessionOrder(db, eventId, 'order-1', NOW)
    const second = await deleteAbandonedConcessionOrder(db, eventId, 'order-1', NOW)

    expect(first.status).toBe('deleted')
    expect(second.status).toBe('not_found')
  })

  it('returns not_found for a missing order', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { concessions: { enabled: true } })

    const result = await deleteAbandonedConcessionOrder(db, eventId, 'nonexistent-order', NOW)

    expect(result.status).toBe('not_found')
  })
})

describe('runAbandonedConcessionOrdersSweep', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('deletes only abandoned orders across multiple events, leaving active/paid ones untouched', async () => {
    const eventA = uniqueId('event')
    const eventB = uniqueId('event')
    await seedEvent(db, eventA, { concessions: { enabled: true } })
    await seedEvent(db, eventB, { concessions: { enabled: true } })

    await seedConcessionOrder(db, eventA, 'abandoned-1', { paymentPhase: 'awaiting_payment', updatedAt: STALE_UPDATED_AT })
    await seedConcessionOrder(db, eventB, 'abandoned-2', { paymentPhase: 'rejected', updatedAt: STALE_UPDATED_AT })
    await seedConcessionOrder(db, eventA, 'active-1', { paymentPhase: 'awaiting_payment', updatedAt: RECENT_UPDATED_AT })
    await seedConcessionOrder(db, eventB, 'paid-1', { paymentPhase: 'confirmed', updatedAt: STALE_UPDATED_AT })

    const result = await runAbandonedConcessionOrdersSweep(db, NOW)

    expect(result.deleted).toBe(2)
    expect(await getConcessionOrderDoc(db, eventA, 'abandoned-1')).toBeUndefined()
    expect(await getConcessionOrderDoc(db, eventB, 'abandoned-2')).toBeUndefined()
    expect(await getConcessionOrderDoc(db, eventA, 'active-1')).toBeDefined()
    expect(await getConcessionOrderDoc(db, eventB, 'paid-1')).toBeDefined()
  })

  it('is idempotent: running the sweep twice in a row deletes nothing extra the second time', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { concessions: { enabled: true } })
    await seedConcessionOrder(db, eventId, 'abandoned-1', { paymentPhase: 'awaiting_payment', updatedAt: STALE_UPDATED_AT })

    const first = await runAbandonedConcessionOrdersSweep(db, NOW)
    const second = await runAbandonedConcessionOrdersSweep(db, NOW)

    expect(first.deleted).toBe(1)
    expect(second.candidates).toBe(0)
    expect(second.deleted).toBe(0)
  })

  it('processes candidates in batches (oldest first), draining the backlog over successive runs', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { concessions: { enabled: true } })
    const older = Timestamp.fromMillis(STALE_UPDATED_AT.toMillis() - 10_000)
    await seedConcessionOrder(db, eventId, 'order-old', { paymentPhase: 'awaiting_payment', updatedAt: older })
    await seedConcessionOrder(db, eventId, 'order-newer', { paymentPhase: 'awaiting_payment', updatedAt: STALE_UPDATED_AT })
    await seedConcessionOrder(db, eventId, 'order-newest', { paymentPhase: 'rejected', updatedAt: STALE_UPDATED_AT })

    const firstBatch = await runAbandonedConcessionOrdersSweep(db, NOW, { limit: 2 })
    expect(firstBatch.deleted).toBe(2)
    expect(await getConcessionOrderDoc(db, eventId, 'order-old')).toBeUndefined()
    expect(await getConcessionOrderDoc(db, eventId, 'order-newest')).toBeDefined()

    const secondBatch = await runAbandonedConcessionOrdersSweep(db, NOW, { limit: 2 })
    expect(secondBatch.deleted).toBe(1)
    expect(await getConcessionOrderDoc(db, eventId, 'order-newest')).toBeUndefined()
  })
})
