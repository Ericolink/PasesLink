import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { createTestEnv, getEventDoc, seedEvent, seedGuest, type EmulatorFirestore } from './helpers'

// capacity.ts y guests.ts importan `db` de './config' como singleton de producción.
// Lo reemplazamos por un getter que apunta al Firestore del emulador activo en cada
// test, sin tocar la implementación de capacity.ts/guests.ts.
const dbHolder = vi.hoisted(() => ({ db: undefined as unknown as EmulatorFirestore }))
vi.mock('../config', () => ({
  get db() {
    return dbHolder.db
  },
}))

import { registerWalkInGuest, walkIn, walkOut } from '../capacity'
import { checkInGuest } from '../guests'

const OWNER_UID = 'owner-uid'
const EVENT_ID = 'event-1'

describe('capacity.ts', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await createTestEnv()
  })

  afterEach(async () => {
    await testEnv.clearFirestore()
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  it('should reject walkIn when capacity is full', async () => {
    await seedEvent(testEnv, EVENT_ID, { capacity: 2, checkedInCount: 2 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    const result = await walkIn(EVENT_ID)

    expect(result).toBe('full')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.checkedInCount).toBe(2)
  })

  it('should increment checkedInCount on a successful walkIn', async () => {
    await seedEvent(testEnv, EVENT_ID, { capacity: 5, checkedInCount: 1 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    const result = await walkIn(EVENT_ID)

    expect(result).toBe('success')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.checkedInCount).toBe(2)
  })

  it('should decrement checkedInCount on walkOut and no-op once it reaches zero', async () => {
    await seedEvent(testEnv, EVENT_ID, { checkedInCount: 1 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await walkOut(EVENT_ID)
    expect((await getEventDoc(testEnv, EVENT_ID))?.checkedInCount).toBe(0)

    await walkOut(EVENT_ID)
    expect((await getEventDoc(testEnv, EVENT_ID))?.checkedInCount).toBe(0)
  })

  it('should reject registerWalkInGuest when capacity is full', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 1, guestCount: 1 })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    const result = await registerWalkInGuest(EVENT_ID, 'Invitado Nuevo')

    expect(result.status).toBe('full')
    expect(result.qrToken).toBeUndefined()
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(1)
  })

  it('should create the guest and increment guestCount on a successful registerWalkInGuest', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 5, guestCount: 0 })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    const result = await registerWalkInGuest(EVENT_ID, 'Invitado Nuevo')

    expect(result.status).toBe('success')
    expect(result.qrToken).toBeTruthy()
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(1)
  })

  it('should enforce the same checkedInCount limit for normal check-ins and walk-ins', async () => {
    await seedEvent(testEnv, EVENT_ID, { capacity: 1, checkedInCount: 0 })
    await seedGuest(testEnv, EVENT_ID, 'guest-1', { qrToken: 'qr-1' })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    const checkin = await checkInGuest(EVENT_ID, 'qr-1', OWNER_UID, 'owner@test.com')
    expect(checkin.status).toBe('success')

    const walkInResult = await walkIn(EVENT_ID)

    expect(walkInResult).toBe('full')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.checkedInCount).toBe(1)
  })
})
