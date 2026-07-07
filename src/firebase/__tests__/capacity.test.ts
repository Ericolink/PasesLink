import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore'
import { createTestEnv, getEventDoc, getGuestDoc, guestIdByToken, seedEvent, seedGuest, seedUserProfile, type EmulatorFirestore } from './helpers'

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
    await seedEvent(testEnv, EVENT_ID, { capacity: 2, checkedInCount: 2, occupancyCount: 2 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    const result = await walkIn(EVENT_ID)

    expect(result).toBe('full')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.checkedInCount).toBe(2)
    expect(event?.occupancyCount).toBe(2)
  })

  it('should increment checkedInCount and occupancyCount on a successful walkIn', async () => {
    await seedEvent(testEnv, EVENT_ID, { capacity: 5, checkedInCount: 1, occupancyCount: 1 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    const result = await walkIn(EVENT_ID)

    expect(result).toBe('success')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.checkedInCount).toBe(2)
    expect(event?.occupancyCount).toBe(2)
  })

  it('should allow a walkIn once occupancy drops even if checkedInCount (cumulative) stayed at capacity', async () => {
    // Simula el caso que motivó separar los dos contadores: mucha gente entró
    // e históricamente checkedInCount llegó al tope, pero la mitad ya se fue
    // (occupancyCount bajó) — el venue tiene lugar real aunque checkedInCount
    // diga lo contrario.
    await seedEvent(testEnv, EVENT_ID, { capacity: 2, checkedInCount: 2, occupancyCount: 1 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    const result = await walkIn(EVENT_ID)

    expect(result).toBe('success')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.checkedInCount).toBe(3)
    expect(event?.occupancyCount).toBe(2)
  })

  it('should decrement checkedInCount and occupancyCount on walkOut and no-op once they reach zero', async () => {
    await seedEvent(testEnv, EVENT_ID, { checkedInCount: 1, occupancyCount: 1 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await walkOut(EVENT_ID)
    let event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.checkedInCount).toBe(0)
    expect(event?.occupancyCount).toBe(0)

    await walkOut(EVENT_ID)
    event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.checkedInCount).toBe(0)
    expect(event?.occupancyCount).toBe(0)
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

  it('should increment peopleCount by the party size on registerWalkInGuest', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 10, guestCount: 0, peopleCount: 0 })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    const result = await registerWalkInGuest(EVENT_ID, 'Invitado Con Acompañantes', undefined, undefined, undefined, 4)

    expect(result.status).toBe('success')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(1)
    expect(event?.peopleCount).toBe(4)
  })

  it('should reserve the spot with an expiry when self-registering by transfer on a paid event', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 10, guestCount: 0, requiresPayment: true, paymentMethods: ['transfer', 'cash'] })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    const before = Date.now()
    const result = await registerWalkInGuest(EVENT_ID, 'Invitado Transferencia', undefined, undefined, undefined, undefined, 'transfer')

    expect(result.status).toBe('success')
    const guestId = await guestIdByToken(testEnv, EVENT_ID, result.qrToken!)
    const guest = await getGuestDoc(testEnv, EVENT_ID, guestId)
    expect(guest?.paymentStatus).toBe('unpaid')
    expect(guest?.paymentMethod).toBe('transfer')
    expect(guest?.holdExpiresAt as number).toBeGreaterThan(before)
  })

  it('should confirm the spot without an expiry when self-registering by cash on a paid event', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 10, guestCount: 0, requiresPayment: true, paymentMethods: ['transfer', 'cash'] })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    const result = await registerWalkInGuest(EVENT_ID, 'Invitado Efectivo', undefined, undefined, undefined, undefined, 'cash')

    expect(result.status).toBe('success')
    const guestId = await guestIdByToken(testEnv, EVENT_ID, result.qrToken!)
    const guest = await getGuestDoc(testEnv, EVENT_ID, guestId)
    expect(guest?.paymentStatus).toBe('unpaid')
    expect(guest?.paymentMethod).toBe('cash')
    expect(guest?.holdExpiresAt).toBeNull()
  })

  it('should store guestUid and guestPhotoURL when a logged-in user self-registers', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 10, guestCount: 0 })
    const uid = 'guest-account-uid'
    await seedUserProfile(testEnv, uid, { photoURL: 'https://res.cloudinary.com/demo/photo.jpg' })
    dbHolder.db = testEnv.authenticatedContext(uid).firestore()

    const result = await registerWalkInGuest(
      EVENT_ID, 'Invitado Con Cuenta', undefined, undefined, undefined, undefined, undefined,
      uid, 'https://res.cloudinary.com/demo/photo.jpg',
    )

    expect(result.status).toBe('success')
    const guestId = await guestIdByToken(testEnv, EVENT_ID, result.qrToken!)
    const guest = await getGuestDoc(testEnv, EVENT_ID, guestId)
    expect(guest?.guestUid).toBe(uid)
    expect(guest?.guestPhotoURL).toBe('https://res.cloudinary.com/demo/photo.jpg')
  })

  it('should leave guestUid and guestPhotoURL null when registering without a session', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 10, guestCount: 0 })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    const result = await registerWalkInGuest(EVENT_ID, 'Invitado Sin Cuenta')

    const guestId = await guestIdByToken(testEnv, EVENT_ID, result.qrToken!)
    const guest = await getGuestDoc(testEnv, EVENT_ID, guestId)
    expect(guest?.guestUid).toBeNull()
    expect(guest?.guestPhotoURL).toBeNull()
  })

  it('should reject a raw authenticated write that fabricates another user\'s guestUid', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 10, guestCount: 0 })
    const publicDb = testEnv.authenticatedContext('real-uid').firestore()

    await assertFails(addDoc(collection(publicDb, 'events', EVENT_ID, 'guests'), {
      name: 'Invitado Malicioso',
      qrToken: 'fake-token',
      status: 'invited',
      rsvpStatus: 'yes',
      companions: 0,
      checkedInAt: null,
      checkedInBy: null,
      checkedInByEmail: null,
      checkedOutAt: null,
      checkedOutByEmail: null,
      exitType: null,
      lockToken: null,
      paymentStatus: 'unpaid',
      paymentMethod: null,
      holdExpiresAt: null,
      customData: {},
      guestUid: 'someone-elses-uid',
      guestPhotoURL: null,
      createdAt: Date.now(),
    }))
  })

  it('should reject a raw authenticated write with a guestPhotoURL that does not match the caller\'s real profile', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 10, guestCount: 0 })
    const uid = 'real-uid-2'
    await seedUserProfile(testEnv, uid, { photoURL: 'https://res.cloudinary.com/demo/real.jpg' })
    const publicDb = testEnv.authenticatedContext(uid).firestore()

    await assertFails(addDoc(collection(publicDb, 'events', EVENT_ID, 'guests'), {
      name: 'Invitado Malicioso',
      qrToken: 'fake-token',
      status: 'invited',
      rsvpStatus: 'yes',
      companions: 0,
      checkedInAt: null,
      checkedInBy: null,
      checkedInByEmail: null,
      checkedOutAt: null,
      checkedOutByEmail: null,
      exitType: null,
      lockToken: null,
      paymentStatus: 'unpaid',
      paymentMethod: null,
      holdExpiresAt: null,
      customData: {},
      guestUid: uid,
      guestPhotoURL: 'https://evil.example.com/offensive.jpg',
      createdAt: Date.now(),
    }))
  })

  it('should reject a raw public write that tries to self-mark as paid or checked-in', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 10, guestCount: 0 })
    const publicDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(addDoc(collection(publicDb, 'events', EVENT_ID, 'guests'), {
      name: 'Invitado Malicioso',
      qrToken: 'fake-token',
      status: 'checked_in',
      rsvpStatus: 'yes',
      companions: 0,
      checkedInAt: Date.now(),
      checkedInBy: null,
      checkedInByEmail: null,
      checkedOutAt: null,
      checkedOutByEmail: null,
      exitType: null,
      lockToken: null,
      paymentStatus: 'paid',
      paymentMethod: null,
      holdExpiresAt: null,
      customData: {},
      createdAt: Date.now(),
    }))
  })

  it('should reject a raw public write that fabricates a far-future holdExpiresAt to never lose the spot', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 10, guestCount: 0, requiresPayment: true, paymentMethods: ['transfer'] })
    const publicDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(addDoc(collection(publicDb, 'events', EVENT_ID, 'guests'), {
      name: 'Invitado Malicioso',
      qrToken: 'fake-token',
      status: 'invited',
      rsvpStatus: 'yes',
      companions: 0,
      checkedInAt: null,
      checkedInBy: null,
      checkedInByEmail: null,
      checkedOutAt: null,
      checkedOutByEmail: null,
      exitType: null,
      lockToken: null,
      paymentStatus: 'unpaid',
      paymentMethod: 'transfer',
      holdExpiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
      customData: {},
      createdAt: Date.now(),
    }))
  })

  it('should reject a guest marking "ya pagué" without a reference number', async () => {
    await seedEvent(testEnv, EVENT_ID, { requiresPayment: true, paymentMethods: ['transfer'] })
    await seedGuest(testEnv, EVENT_ID, 'guest-1', {
      qrToken: 'qr-1',
      paymentMethod: 'transfer',
      paymentStatus: 'unpaid',
      holdExpiresAt: Date.now() + 10 * 60 * 1000,
    })
    const publicDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(updateDoc(doc(publicDb, 'events', EVENT_ID, 'guests', 'guest-1'), {
      paymentStatus: 'pending_confirmation',
      holdExpiresAt: Date.now() + 48 * 60 * 60 * 1000,
      paymentNote: '',
    }))
    await assertFails(updateDoc(doc(publicDb, 'events', EVENT_ID, 'guests', 'guest-1'), {
      paymentStatus: 'pending_confirmation',
      holdExpiresAt: Date.now() + 48 * 60 * 60 * 1000,
    }))
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
