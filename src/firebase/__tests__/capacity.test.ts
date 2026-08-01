import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore'
import { createTestEnv, getEventDoc, seedEvent, seedGuest, seedUserProfile, type EmulatorFirestore } from './helpers'

// capacity.ts y guests.ts importan `db` de './config' como singleton de producción.
// Lo reemplazamos por un getter que apunta al Firestore del emulador activo en cada
// test, sin tocar la implementación de capacity.ts/guests.ts.
const dbHolder = vi.hoisted(() => ({ db: undefined as unknown as EmulatorFirestore }))
vi.mock('../config', () => ({
  get db() {
    return dbHolder.db
  },
}))

import { walkIn, walkOut } from '../capacity'

const OWNER_UID = 'owner-uid'
const EVENT_ID = 'event-1'

// registerWalkInGuest se migró a Cloud Functions (ver
// FIRESTORE_RULES_SIMPLIFICATION_AUDIT.md, Fase A) — toda la lógica de
// negocio (cupo, clamping de partySize, guestUid/guestPhotoURL, contadores)
// se prueba ahora contra el emulador vía Admin SDK en
// functions/src/capacity/registerWalkInGuest.test.ts. Este archivo conserva:
// walkIn/walkOut (siguen siendo transacciones de cliente, fuera de esta
// migración) y los tests de `firestore.rules` que verifican que un cliente
// no puede bypassear la Cloud Function con una escritura directa.
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

  it('rules should reject a raw write bypassing the client transaction, as a defense-in-depth backstop', async () => {
    // La garantía real de cupo la da la Cloud Function registerWalkInGuest
    // (ver functions/src/capacity/registerWalkInGuest.test.ts, test de
    // carrera) — esto verifica la segunda capa (attendeeLimitOk en
    // firestore.rules) para el caso de un cliente que evite esa función por
    // completo y escriba peopleCount directo, con los mismos deltas que la
    // rama de autorregistro público exige (+1 guestCount, +1 peopleCount, +1
    // rsvpYesCount) — pasa todas las demás condiciones de esa rama, pero
    // igual debe rechazarse por superar capacity.
    await seedEvent(testEnv, EVENT_ID, {
      entryMode: 'open', attendeeLimitEnabled: true, capacity: 5, guestCount: 5, peopleCount: 5, rsvpYesCount: 5,
    })
    const publicDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(updateDoc(doc(publicDb, 'events', EVENT_ID), {
      guestCount: 6,
      peopleCount: 6,
      rsvpYesCount: 6,
    }))
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

  it('should reject a raw public write that sets any non-null holdExpiresAt (no more apartado temporal)', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 10, guestCount: 0, requiresPayment: true, paymentMethods: ['transfer'] })
    const publicDb = testEnv.unauthenticatedContext().firestore()

    const basePayload = {
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
      customData: {},
      createdAt: Date.now(),
    }

    // Ni un valor lejano (el viejo intento de "nunca vencer")...
    await assertFails(addDoc(collection(publicDb, 'events', EVENT_ID, 'guests'), {
      ...basePayload,
      holdExpiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
    }))
    // ...ni uno cercano: el campo debe llegar SIEMPRE en null, ya no existe
    // ningún cronómetro válido.
    await assertFails(addDoc(collection(publicDb, 'events', EVENT_ID, 'guests'), {
      ...basePayload,
      holdExpiresAt: Date.now() + 60_000,
    }))
  })

  it('should reject a guest marking "ya pagué" without a reference number', async () => {
    await seedEvent(testEnv, EVENT_ID, { requiresPayment: true, paymentMethods: ['transfer'] })
    await seedGuest(testEnv, EVENT_ID, 'guest-1', {
      qrToken: 'qr-1',
      paymentMethod: 'transfer',
      paymentStatus: 'unpaid',
    })
    const publicDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(updateDoc(doc(publicDb, 'events', EVENT_ID, 'guests', 'guest-1'), {
      paymentStatus: 'pending_confirmation',
      paymentNote: '',
    }))
    await assertFails(updateDoc(doc(publicDb, 'events', EVENT_ID, 'guests', 'guest-1'), {
      paymentStatus: 'pending_confirmation',
    }))
  })

  // checkInGuest se migró a Cloud Functions (ver
  // functions/src/checkin/checkIn.ts, probado aparte contra Admin SDK) — ya
  // no puede invocarse desde este archivo (emulador de solo Firestore, sin
  // Functions). walkIn/occupancyCount comparten el mismo `capacity` que
  // checkInGuest respeta (occupancyCount, no checkedInCount — ver comentario
  // de walkIn en capacity.ts), así que alcanza con sembrar occupancyCount
  // directo para probar que walkIn respeta el mismo cupo que dejaría un
  // check-in real.
  it('should respect the same occupancyCount limit a real check-in would leave behind', async () => {
    await seedEvent(testEnv, EVENT_ID, { capacity: 1, checkedInCount: 1, occupancyCount: 1 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    const walkInResult = await walkIn(EVENT_ID)

    expect(walkInResult).toBe('full')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.checkedInCount).toBe(1)
  })
})
