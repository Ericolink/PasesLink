import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { addDoc, collection, doc, setDoc, updateDoc } from 'firebase/firestore'
import { createTestEnv, defaultEventData, getEventDoc, getGuestDoc, guestIdByToken, seedEvent, seedGuest, seedUserProfile, type EmulatorFirestore } from './helpers'

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

  it('should still create the guest and increment guestCount even when capacity is already full', async () => {
    // El cupo es puramente informativo — el registro nunca se bloquea, ni
    // siquiera cuando guestCount ya alcanzó (o superó) capacity.
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 1, guestCount: 1 })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    const result = await registerWalkInGuest(EVENT_ID, 'Invitado Nuevo')

    expect(result.status).toBe('success')
    expect(result.qrToken).toBeTruthy()
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(2)
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

  it('should increment peopleCount by the party size on registerWalkInGuest, clamped to the event maxCompanions', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 10, guestCount: 0, peopleCount: 0, maxCompanions: 5 })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    const result = await registerWalkInGuest(EVENT_ID, 'Invitado Con Acompañantes', undefined, undefined, undefined, 4)

    expect(result.status).toBe('success')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(1)
    expect(event?.peopleCount).toBe(4)
  })

  it('should clamp the requested party size down to the event maxCompanions instead of registering it as-is', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 10, guestCount: 0, peopleCount: 0, maxCompanions: 2 })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    const result = await registerWalkInGuest(EVENT_ID, 'Invitado Con Muchos Acompañantes', undefined, undefined, undefined, 8)

    expect(result.status).toBe('success')
    const event = await getEventDoc(testEnv, EVENT_ID)
    // maxCompanions: 2 -> party size máximo 3 (invitado + 2 acompañantes), no los 8 pedidos.
    expect(event?.peopleCount).toBe(3)
  })

  it('should fall back to the legacy limit (party of 10) when the event has no maxCompanions configured', async () => {
    // Evento anterior al campo maxCompanions: siempre permitió grupos de
    // hasta 10 en el autoregistro (la vieja GUEST_MAX_PARTY_SIZE) — el
    // default legacy (GUEST_LEGACY_MAX_COMPANIONS = 9 acompañantes) preserva
    // ese comportamiento en vez de dejarlos sin acompañantes en silencio.
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 10, guestCount: 0, peopleCount: 0 })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    const result = await registerWalkInGuest(EVENT_ID, 'Invitado Sin Límite Configurado', undefined, undefined, undefined, 4)

    expect(result.status).toBe('success')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.peopleCount).toBe(4)
  })

  it('should clamp the party size to 10 on a legacy event without maxCompanions', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 50, guestCount: 0, peopleCount: 0 })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    const result = await registerWalkInGuest(EVENT_ID, 'Invitado Grupo Legacy', undefined, undefined, undefined, 15)

    expect(result.status).toBe('success')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.peopleCount).toBe(10)
  })

  it('should still allow no companions when maxCompanions is explicitly 0', async () => {
    // El default legacy aplica SOLO al campo ausente — un 0 explícito (el
    // valor con el que se crea todo evento nuevo si el organizador no lo
    // toca) sigue significando "sin acompañantes".
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 10, guestCount: 0, peopleCount: 0, maxCompanions: 0 })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    const result = await registerWalkInGuest(EVENT_ID, 'Invitado Sin Acompañantes', undefined, undefined, undefined, 4)

    expect(result.status).toBe('success')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.peopleCount).toBe(1)
  })

  it('should register by transfer without any hold/expiry (no more apartado temporal)', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 10, guestCount: 0, requiresPayment: true, paymentMethods: ['transfer', 'cash'] })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    const result = await registerWalkInGuest(EVENT_ID, 'Invitado Transferencia', undefined, undefined, undefined, undefined, 'transfer')

    expect(result.status).toBe('success')
    const guestId = await guestIdByToken(testEnv, EVENT_ID, result.qrToken!)
    const guest = await getGuestDoc(testEnv, EVENT_ID, guestId)
    expect(guest?.paymentStatus).toBe('unpaid')
    expect(guest?.paymentMethod).toBe('transfer')
  })

  it('should register by cash the same way, without any hold/expiry', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', capacity: 10, guestCount: 0, requiresPayment: true, paymentMethods: ['transfer', 'cash'] })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    const result = await registerWalkInGuest(EVENT_ID, 'Invitado Efectivo', undefined, undefined, undefined, undefined, 'cash')

    expect(result.status).toBe('success')
    const guestId = await guestIdByToken(testEnv, EVENT_ID, result.qrToken!)
    const guest = await getGuestDoc(testEnv, EVENT_ID, guestId)
    expect(guest?.paymentStatus).toBe('unpaid')
    expect(guest?.paymentMethod).toBe('cash')
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

  // Regresión del "Missing or insufficient permissions" en el autoregistro
  // público: eventos creados antes de que existiera peopleCount no tienen ese
  // campo, y la regla del update del evento leía resource.data.peopleCount a
  // secas — leer una clave ausente en reglas es un error que deniega la
  // transacción entera. Ver eventPeopleCountBefore en firestore.rules.
  it('should self-register on a legacy event that has no peopleCount field, backfilling it from guestCount', async () => {
    const legacy = defaultEventData({ entryMode: 'open', guestCount: 3 })
    delete (legacy as Record<string, unknown>).peopleCount
    delete (legacy as Record<string, unknown>).paidCount
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'events', EVENT_ID), legacy)
    })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    const result = await registerWalkInGuest(EVENT_ID, 'Invitado Legacy')

    expect(result.status).toBe('success')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(4)
    // Backfill con el mismo fallback que getEvent: peopleCount ausente ≈ guestCount.
    expect(event?.peopleCount).toBe(4)
  })

  // Regresión: si el listener de perfil todavía no emitió cuando el usuario
  // envía el formulario, EventJoin manda guestUid con la sesión activa pero
  // guestPhotoURL null aunque el perfil SÍ tenga foto — antes la regla exigía
  // igualdad exacta con users/{uid}.photoURL y denegaba el registro.
  it('should let a logged-in user self-register without a photo even if their profile has one (profile not loaded yet)', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', guestCount: 0 })
    const uid = 'user-foto-sin-cargar'
    await seedUserProfile(testEnv, uid, { photoURL: 'https://res.cloudinary.com/demo/foto.jpg' })
    dbHolder.db = testEnv.authenticatedContext(uid).firestore()

    const result = await registerWalkInGuest(
      EVENT_ID, 'Invitado Con Sesión', undefined, undefined, undefined, undefined, undefined,
      uid, undefined,
    )

    expect(result.status).toBe('success')
    const guest = await getGuestDoc(testEnv, EVENT_ID, await guestIdByToken(testEnv, EVENT_ID, result.qrToken!))
    expect(guest?.guestUid).toBe(uid)
    expect(guest?.guestPhotoURL).toBeNull()
  })

  // Regresión: cuenta autenticada SIN documento users/{uid} (p.ej. login con
  // Google sin completar el perfil) — el get() de la regla sobre un documento
  // inexistente es un error, así que antes denegaba el registro.
  it('should let a logged-in user without a users/{uid} document self-register', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', guestCount: 0 })
    const uid = 'user-sin-perfil'
    dbHolder.db = testEnv.authenticatedContext(uid).firestore()

    const result = await registerWalkInGuest(
      EVENT_ID, 'Invitado Sin Perfil', undefined, undefined, undefined, undefined, undefined,
      uid, undefined,
    )

    expect(result.status).toBe('success')
    const guest = await getGuestDoc(testEnv, EVENT_ID, await guestIdByToken(testEnv, EVENT_ID, result.qrToken!))
    expect(guest?.guestUid).toBe(uid)
  })

  // Regresión: la regla del update del evento limitaba el delta de peopleCount
  // a +10 (copiado de una constante GUEST_MAX_PARTY_SIZE que ya no existe),
  // pero maxCompanions puede configurarse hasta 20 (GUEST_MAX_COMPANIONS) —
  // un grupo legítimo de 11 a 21 personas quedaba denegado.
  it('should self-register a full party of 21 when the event allows the maximum 20 companions', async () => {
    await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', guestCount: 0, peopleCount: 0, maxCompanions: 20 })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    const result = await registerWalkInGuest(EVENT_ID, 'Invitado Grupo Grande', undefined, undefined, undefined, 21)

    expect(result.status).toBe('success')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.peopleCount).toBe(21)
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
