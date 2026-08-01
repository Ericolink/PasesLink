import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
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
import { cancelConcessionOrder } from './cancelConcessionOrder.js'

describe('cancelConcessionOrder (servicio)', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('releases the reserved stock when the organizer cancels an order', async () => {
    const eventId = uniqueId('event')
    const itemId = 'item-soda'
    await seedEvent(db, eventId, { concessions: { enabled: true } })
    await seedConcessionItem(db, eventId, itemId, { stockMode: 'limited', stockRemaining: 3, status: 'active' })
    await seedConcessionOrder(db, eventId, 'order-1', {
      guestId: 'guest-1',
      paymentPhase: 'awaiting_payment',
      items: [{ itemId, nameSnapshot: 'Soda italiana', categorySnapshot: 'drink', unitPriceMinorUnitsSnapshot: 3500, quantity: 2, lineTotalMinorUnits: 7000 }],
    })
    await seedConcessionFulfillment(db, eventId, 'order-1', { guestId: 'guest-1', fulfillmentStatus: 'not_ready' })

    const result = await cancelConcessionOrder(db, eventId, 'order-1', 'organizer_cancelled')

    expect(result.status).toBe('success')
    const order = await getConcessionOrderDoc(db, eventId, 'order-1')
    expect(order?.paymentPhase).toBe('cancelled')
    const item = await getConcessionItemDoc(db, eventId, itemId)
    expect(item?.stockRemaining).toBe(5)
    const fulfillment = await getConcessionFulfillmentDoc(db, eventId, 'order-1')
    expect(fulfillment?.fulfillmentStatus).toBe('cancelled')
  })

  it('flips an out-of-stock item back to active when the organizer cancels an order and releases stock', async () => {
    const eventId = uniqueId('event')
    const itemId = 'item-soda'
    await seedEvent(db, eventId, { concessions: { enabled: true } })
    await seedConcessionItem(db, eventId, itemId, { stockMode: 'limited', stockRemaining: 0, status: 'outOfStock' })
    await seedConcessionOrder(db, eventId, 'order-1', {
      guestId: 'guest-1',
      paymentPhase: 'awaiting_payment',
      items: [{ itemId, nameSnapshot: 'Soda italiana', categorySnapshot: 'drink', unitPriceMinorUnitsSnapshot: 3500, quantity: 1, lineTotalMinorUnits: 3500 }],
    })

    await cancelConcessionOrder(db, eventId, 'order-1', 'organizer_cancelled')

    const item = await getConcessionItemDoc(db, eventId, itemId)
    expect(item?.stockRemaining).toBe(1)
    expect(item?.status).toBe('active')
  })

  it('is a no-op when the order is already cancelled', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { concessions: { enabled: true } })
    await seedConcessionOrder(db, eventId, 'order-1', { paymentPhase: 'cancelled' })

    const result = await cancelConcessionOrder(db, eventId, 'order-1', 'organizer_cancelled')

    expect(result.status).toBe('noop')
  })

  it('returns not_found for a missing order', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { concessions: { enabled: true } })

    const result = await cancelConcessionOrder(db, eventId, 'nonexistent-order', 'organizer_cancelled')

    expect(result.status).toBe('not_found')
  })
})
