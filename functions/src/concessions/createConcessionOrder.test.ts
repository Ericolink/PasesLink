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

  it('rejects a negative or zero quantity instead of inflating stock/producing a negative total', async () => {
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
      paymentMethod: 'cash',
      lines: [{ itemId, quantity: -3 }],
    })

    expect(result.status).toBe('invalid_lines')
    const item = await getConcessionItemDoc(db, eventId, itemId)
    expect(item?.stockRemaining).toBe(10)
  })

  it('rejects a non-integer or above-cap quantity', async () => {
    const eventId = uniqueId('event')
    const itemId = 'item-soda'
    await seedEvent(db, eventId, { concessions: enabledConcessions })
    await seedConcessionItem(db, eventId, itemId, { stockMode: 'unlimited' })
    await seedGuest(db, eventId, 'guest-1', { lockTokens: [LOCK_TOKEN] })

    const nonInteger = await createConcessionOrder(db, eventId, {
      guestId: 'guest-1', guestNameSnapshot: 'Invitado de prueba', lockToken: LOCK_TOKEN,
      currency: 'MXN', paymentMethod: 'cash', lines: [{ itemId, quantity: 1.5 }],
    })
    expect(nonInteger.status).toBe('invalid_lines')

    const aboveCap = await createConcessionOrder(db, eventId, {
      guestId: 'guest-1', guestNameSnapshot: 'Invitado de prueba', lockToken: LOCK_TOKEN,
      currency: 'MXN', paymentMethod: 'cash', lines: [{ itemId, quantity: 51 }],
    })
    expect(aboveCap.status).toBe('invalid_lines')
  })

  it('merges duplicate lines for the same item instead of losing part of the stock decrement', async () => {
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
      paymentMethod: 'cash',
      // Dos líneas para el mismo producto — sin dedupe, la segunda
      // tx.update pisaría el stockRemaining que dejó la primera dentro de
      // la misma transacción (soldCount sí acumula por ser un increment,
      // stockRemaining no), dejando el inventario desalineado de lo vendido.
      lines: [{ itemId, quantity: 2 }, { itemId, quantity: 3 }],
    })

    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error('expected success')

    const item = await getConcessionItemDoc(db, eventId, itemId)
    expect(item?.stockRemaining).toBe(5) // 10 - (2+3)
    expect(item?.soldCount).toBe(5)

    const order = await getConcessionOrderDoc(db, eventId, result.orderId)
    expect(order?.totalMinorUnits).toBe(5 * 3500)
  })

  it('rejects checkout when the item no longer exists in the catalog', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { concessions: enabledConcessions })
    await seedGuest(db, eventId, 'guest-1', { lockTokens: [LOCK_TOKEN] })

    const result = await createConcessionOrder(db, eventId, {
      guestId: 'guest-1',
      guestNameSnapshot: 'Invitado de prueba',
      lockToken: LOCK_TOKEN,
      currency: 'MXN',
      paymentMethod: 'cash',
      lines: [{ itemId: 'item-inexistente', quantity: 1 }],
    })

    expect(result.status).toBe('checkout_error')
    if (result.status === 'checkout_error') expect(result.itemId).toBe('item-inexistente')
  })

  it('rejects checkout for an archived/out-of-stock item', async () => {
    const eventId = uniqueId('event')
    const itemId = 'item-soda'
    await seedEvent(db, eventId, { concessions: enabledConcessions })
    await seedConcessionItem(db, eventId, itemId, { status: 'archived' })
    await seedGuest(db, eventId, 'guest-1', { lockTokens: [LOCK_TOKEN] })

    const result = await createConcessionOrder(db, eventId, {
      guestId: 'guest-1',
      guestNameSnapshot: 'Invitado de prueba',
      lockToken: LOCK_TOKEN,
      currency: 'MXN',
      paymentMethod: 'cash',
      lines: [{ itemId, quantity: 1 }],
    })

    expect(result.status).toBe('checkout_error')
  })

  it('ignora cualquier precio/subtotal que el cliente intente colar en una línea, y usa siempre el catálogo', async () => {
    const eventId = uniqueId('event')
    const itemId = 'item-soda'
    await seedEvent(db, eventId, { concessions: enabledConcessions })
    await seedConcessionItem(db, eventId, itemId, { stockMode: 'unlimited', priceMinorUnits: 3500 })
    await seedGuest(db, eventId, 'guest-1', { lockTokens: [LOCK_TOKEN] })

    // `as any` simula un caller que habla directo contra la Callable (sin
    // pasar por el tipo `ConcessionOrderLineInput` del cliente oficial) e
    // inyecta campos económicos que el servicio ni siquiera lee.
    const tamperedLine = { itemId, quantity: 1, unitPriceMinorUnitsSnapshot: 1, lineTotalMinorUnits: 1 } as unknown as { itemId: string; quantity: number }

    const result = await createConcessionOrder(db, eventId, {
      guestId: 'guest-1',
      guestNameSnapshot: 'Invitado de prueba',
      lockToken: LOCK_TOKEN,
      currency: 'MXN',
      paymentMethod: 'cash',
      lines: [tamperedLine],
    })

    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error('expected success')
    const order = await getConcessionOrderDoc(db, eventId, result.orderId)
    expect(order?.totalMinorUnits).toBe(3500)
  })

  it('deriva la moneda del evento, no de lo que mande el cliente', async () => {
    const eventId = uniqueId('event')
    const itemId = 'item-soda'
    await seedEvent(db, eventId, { concessions: { ...enabledConcessions, currency: 'MXN' } })
    await seedConcessionItem(db, eventId, itemId, { stockMode: 'unlimited' })
    await seedGuest(db, eventId, 'guest-1', { lockTokens: [LOCK_TOKEN] })

    const result = await createConcessionOrder(db, eventId, {
      guestId: 'guest-1',
      guestNameSnapshot: 'Invitado de prueba',
      lockToken: LOCK_TOKEN,
      currency: 'USD', // el cliente miente, el servidor debe ignorarlo
      paymentMethod: 'cash',
      lines: [{ itemId, quantity: 1 }],
    })

    if (result.status !== 'success') throw new Error('expected success')
    const order = await getConcessionOrderDoc(db, eventId, result.orderId)
    expect(order?.currency).toBe('MXN')
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
