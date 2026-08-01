import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import {
  clearFirestoreEmulator,
  getConcessionFulfillmentDoc,
  getConcessionItemDoc,
  getConcessionOrderDoc,
  getTestFirestore,
  seedConcessionItem,
  seedEvent,
  seedGuest,
  uniqueId,
} from '../__tests__/helpers.js'
import { createConcessionOrder } from './createConcessionOrder.js'

const LOCK_TOKEN = 'device-token-1'

const enabledConcessions = { enabled: true, currency: 'MXN', paymentMethods: ['transfer', 'cash'] }

describe('createConcessionOrder (servicio)', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('reserves stock and creates the order + kitchen projection in not_ready', async () => {
    const eventId = uniqueId('event')
    const itemId = 'item-soda'
    await seedEvent(db, eventId, { concessions: enabledConcessions })
    await seedConcessionItem(db, eventId, itemId, { stockMode: 'limited', stockRemaining: 10, priceMinorUnits: 3500 })
    await seedGuest(db, eventId, 'guest-1', { lockTokens: [LOCK_TOKEN] })

    const result = await createConcessionOrder(db, eventId, {
      guestId: 'guest-1',
      guestNameSnapshot: 'Invitado de prueba',
      lockToken: LOCK_TOKEN,
      currency: 'MXN',
      paymentMethod: 'transfer',
      lines: [{ itemId, quantity: 2 }],
    })

    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error('expected success')

    const item = await getConcessionItemDoc(db, eventId, itemId)
    expect(item?.stockRemaining).toBe(8)
    expect(item?.soldCount).toBe(2)

    const order = await getConcessionOrderDoc(db, eventId, result.orderId)
    expect(order?.totalMinorUnits).toBe(7000)
    expect(order?.paymentPhase).toBe('awaiting_payment')

    const fulfillment = await getConcessionFulfillmentDoc(db, eventId, result.orderId)
    expect(fulfillment?.fulfillmentStatus).toBe('not_ready')
  })

  it('confirms payment automatically and jumps to queued when the order is 100% free', async () => {
    const eventId = uniqueId('event')
    const itemId = 'item-free'
    await seedEvent(db, eventId, { concessions: enabledConcessions })
    await seedConcessionItem(db, eventId, itemId, { priceMinorUnits: 0, stockMode: 'unlimited' })
    await seedGuest(db, eventId, 'guest-1', { lockTokens: [LOCK_TOKEN] })

    const result = await createConcessionOrder(db, eventId, {
      guestId: 'guest-1',
      guestNameSnapshot: 'Invitado de prueba',
      lockToken: LOCK_TOKEN,
      currency: 'MXN',
      paymentMethod: null,
      lines: [{ itemId, quantity: 1 }],
    })

    if (result.status !== 'success') throw new Error('expected success')
    const order = await getConcessionOrderDoc(db, eventId, result.orderId)
    expect(order?.paymentPhase).toBe('confirmed')
    expect(order?.paymentMethod).toBeNull()

    const fulfillment = await getConcessionFulfillmentDoc(db, eventId, result.orderId)
    expect(fulfillment?.fulfillmentStatus).toBe('queued')
  })

  it('rejects checkout when stock is insufficient, without leaving partial writes', async () => {
    const eventId = uniqueId('event')
    const itemId = 'item-soda'
    await seedEvent(db, eventId, { concessions: enabledConcessions })
    await seedConcessionItem(db, eventId, itemId, { stockMode: 'limited', stockRemaining: 1 })
    await seedGuest(db, eventId, 'guest-1', { lockTokens: [LOCK_TOKEN] })

    const result = await createConcessionOrder(db, eventId, {
      guestId: 'guest-1',
      guestNameSnapshot: 'Invitado de prueba',
      lockToken: LOCK_TOKEN,
      currency: 'MXN',
      paymentMethod: 'cash',
      lines: [{ itemId, quantity: 2 }],
    })

    expect(result.status).toBe('checkout_error')
    if (result.status === 'checkout_error') expect(result.itemId).toBe(itemId)

    const item = await getConcessionItemDoc(db, eventId, itemId)
    expect(item?.stockRemaining).toBe(1) // sin cambios: la transacción entera se abortó
  })

  it('lets exactly one of two simultaneous orders for the last item win the race', async () => {
    const eventId = uniqueId('event')
    const itemId = 'item-soda'
    await seedEvent(db, eventId, { concessions: enabledConcessions })
    await seedConcessionItem(db, eventId, itemId, { stockMode: 'limited', stockRemaining: 1 })
    await seedGuest(db, eventId, 'guest-1', { lockTokens: [LOCK_TOKEN] })
    await seedGuest(db, eventId, 'guest-2', { lockTokens: [LOCK_TOKEN] })

    const attempt = (guestId: string) => createConcessionOrder(db, eventId, {
      guestId,
      guestNameSnapshot: 'Invitado de prueba',
      lockToken: LOCK_TOKEN,
      currency: 'MXN',
      paymentMethod: 'cash',
      lines: [{ itemId, quantity: 1 }],
    })

    const results = await Promise.all([attempt('guest-1'), attempt('guest-2')])
    const succeeded = results.filter((r) => r.status === 'success')
    const failed = results.filter((r) => r.status === 'checkout_error')
    expect(succeeded).toHaveLength(1)
    expect(failed).toHaveLength(1)

    const item = await getConcessionItemDoc(db, eventId, itemId)
    expect(item?.stockRemaining).toBe(0)
    expect(item?.status).toBe('outOfStock')
  })

  it('rejects checkout when the lockToken does not match the owning guest', async () => {
    const eventId = uniqueId('event')
    const itemId = 'item-soda'
    await seedEvent(db, eventId, { concessions: enabledConcessions })
    await seedConcessionItem(db, eventId, itemId, { stockMode: 'unlimited' })
    await seedGuest(db, eventId, 'guest-1', { lockTokens: [LOCK_TOKEN] })

    const result = await createConcessionOrder(db, eventId, {
      guestId: 'guest-1',
      guestNameSnapshot: 'Invitado de prueba',
      lockToken: 'token-ajeno',
      currency: 'MXN',
      paymentMethod: 'cash',
      lines: [{ itemId, quantity: 1 }],
    })

    expect(result.status).toBe('forbidden')
  })

  it('returns not_enabled when the concessions module is off for the event', async () => {
    const eventId = uniqueId('event')
    const itemId = 'item-soda'
    await seedEvent(db, eventId, {})
    await seedConcessionItem(db, eventId, itemId, { stockMode: 'unlimited' })
    await seedGuest(db, eventId, 'guest-1', { lockTokens: [LOCK_TOKEN] })

    const result = await createConcessionOrder(db, eventId, {
      guestId: 'guest-1',
      guestNameSnapshot: 'Invitado de prueba',
      lockToken: LOCK_TOKEN,
      currency: 'MXN',
      paymentMethod: 'cash',
      lines: [{ itemId, quantity: 1 }],
    })

    expect(result.status).toBe('not_enabled')
  })
})
