import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { createTestEnv, getEventDoc, getGuestDoc, seedEvent, seedGuest, type EmulatorFirestore } from './helpers'

// Mismo mock que capacity.test.ts: redirige el `db` singleton de guests.ts/capacity.ts
// al Firestore del emulador activo en cada test (ver comentario en capacity.test.ts).
const dbHolder = vi.hoisted(() => ({ db: undefined as unknown as EmulatorFirestore }))
vi.mock('../config', () => ({
  get db() {
    return dbHolder.db
  },
}))

import { walkIn, walkOut } from '../capacity'
import { checkInGuest, checkOutGuest } from '../guests'

const OWNER_UID = 'owner-uid'
const EVENT_ID = 'event-1'
const GUEST_ID = 'guest-1'
const QR_TOKEN = 'qr-token-1'

describe('guests.ts', () => {
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

  it('should check in a guest and increment checkedInCount', async () => {
    await seedEvent(testEnv, EVENT_ID, { checkedInCount: 0 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    const result = await checkInGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com')

    expect(result.status).toBe('success')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.checkedInCount).toBe(1)
    const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
    expect(guest?.status).toBe('checked_in')
    expect(guest?.checkedInBy).toBe(OWNER_UID)
  })

  it('should reject a duplicate check-in for the same guest', async () => {
    await seedEvent(testEnv, EVENT_ID, { checkedInCount: 0 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    const first = await checkInGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com')
    expect(first.status).toBe('success')

    const second = await checkInGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com')

    expect(second.status).toBe('already_checked_in')
    // El segundo intento no debe volver a incrementar el contador.
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.checkedInCount).toBe(1)
  })

  it('should return not_checked_in when checking out a guest without a prior check-in', async () => {
    await seedEvent(testEnv, EVENT_ID, { checkedInCount: 0 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    const result = await checkOutGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com')

    expect(result.status).toBe('not_checked_in')
  })

  it('should complete the full walkIn -> checkInGuest -> walkOut transaction flow', async () => {
    await seedEvent(testEnv, EVENT_ID, { capacity: 5, checkedInCount: 0 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    const walkInResult = await walkIn(EVENT_ID)
    expect(walkInResult).toBe('success')

    const checkin = await checkInGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com')
    expect(checkin.status).toBe('success')

    expect((await getEventDoc(testEnv, EVENT_ID))?.checkedInCount).toBe(2)

    await walkOut(EVENT_ID)

    expect((await getEventDoc(testEnv, EVENT_ID))?.checkedInCount).toBe(1)
  })
})
