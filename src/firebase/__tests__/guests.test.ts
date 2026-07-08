import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore'
import { createTestEnv, getEventDoc, getGuestContactDoc, getGuestDoc, seedEvent, seedGuest, type EmulatorFirestore } from './helpers'

// Mismo mock que capacity.test.ts: redirige el `db` singleton de guests.ts/capacity.ts
// al Firestore del emulador activo en cada test (ver comentario en capacity.test.ts).
const dbHolder = vi.hoisted(() => ({ db: undefined as unknown as EmulatorFirestore }))
vi.mock('../config', () => ({
  get db() {
    return dbHolder.db
  },
}))

import { walkIn, walkOut } from '../capacity'
import { addGuest, addGuestsBulk, checkInGuest, checkOutGuest, deleteGuest, setGuestPaymentStatus, submitPaymentProof, updateGuest, updateGuestSelf } from '../guests'
import { addToWaitlist } from '../waitlist'

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

  it('should sum companions into checkedInCount on check-in (and not get blocked by the security rule)', async () => {
    await seedEvent(testEnv, EVENT_ID, { checkedInCount: 0 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
      qrToken: QR_TOKEN,
      companions: [{ name: 'Uno' }, { name: 'Dos' }, { name: 'Tres' }],
    })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    const result = await checkInGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com')

    expect(result.status).toBe('success')
    // 1 (el invitado) + 3 acompañantes = 4, en una sola escritura.
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.checkedInCount).toBe(4)
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

    const result = await checkOutGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com', 'temporary')

    expect(result.status).toBe('not_checked_in')
  })

  it('should reject a double check-out for the same guest', async () => {
    await seedEvent(testEnv, EVENT_ID, { checkedInCount: 0 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await checkInGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com')
    const first = await checkOutGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com', 'temporary')
    expect(first.status).toBe('success')

    const second = await checkOutGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com', 'temporary')
    expect(second.status).toBe('already_checked_out')
  })

  it('should allow re-entry after a temporary exit without double-counting checkedInCount', async () => {
    await seedEvent(testEnv, EVENT_ID, { checkedInCount: 0 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await checkInGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com')
    const checkout = await checkOutGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com', 'temporary')
    expect(checkout.status).toBe('success')

    const reentry = await checkInGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com')
    expect(reentry.status).toBe('success')
    if (reentry.status === 'success') expect(reentry.reentry).toBe(true)

    // La reentrada no vuelve a sumar al contador de asistencia (ya se contó en el primer check-in),
    // pero sí vuelve a subir la ocupación en vivo (bajó al salir, vuelve a subir al reingresar).
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.checkedInCount).toBe(1)
    expect(event?.occupancyCount).toBe(1)
    const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
    expect(guest?.checkedOutAt).toBe(null)
  })

  it('should track live occupancy across check-in, temporary exit and re-entry, including companions', async () => {
    await seedEvent(testEnv, EVENT_ID, { checkedInCount: 0, occupancyCount: 0 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
      qrToken: QR_TOKEN,
      companions: [{ name: 'Uno' }, { name: 'Dos' }],
    })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await checkInGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com')
    // 1 invitado + 2 acompañantes = 3, tanto en asistencia acumulada como en ocupación en vivo.
    let event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.checkedInCount).toBe(3)
    expect(event?.occupancyCount).toBe(3)

    await checkOutGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com', 'temporary')
    // La salida libera la ocupación en vivo (los 3) sin tocar la asistencia acumulada.
    event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.checkedInCount).toBe(3)
    expect(event?.occupancyCount).toBe(0)

    await checkInGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com')
    // El reingreso vuelve a ocupar los 3 lugares sin duplicar la asistencia acumulada.
    event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.checkedInCount).toBe(3)
    expect(event?.occupancyCount).toBe(3)
  })

  it('should block re-entry after a final exit', async () => {
    await seedEvent(testEnv, EVENT_ID, { checkedInCount: 0 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await checkInGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com')
    const checkout = await checkOutGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com', 'final')
    expect(checkout.status).toBe('success')

    const reentry = await checkInGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com')
    expect(reentry.status).toBe('blocked_final_exit')
  })

  it('should allow re-entry even if payment status changed to unpaid while the guest was out', async () => {
    await seedEvent(testEnv, EVENT_ID, { checkedInCount: 0, requiresPayment: true })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, paymentStatus: 'paid' })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await checkInGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com')
    await checkOutGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com', 'temporary')

    // El organizador marca el pago como no pagado (p.ej. una disputa) mientras el invitado está afuera.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'events', EVENT_ID, 'guests', GUEST_ID), { paymentStatus: 'unpaid' })
    })

    const reentry = await checkInGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com')
    expect(reentry.status).toBe('success')
  })

  it('should reclaim capacity when confirming payment on an expired reservation with room available', async () => {
    await seedEvent(testEnv, EVENT_ID, { capacity: 5, guestCount: 1, peopleCount: 1, requiresPayment: true, paymentMethods: ['transfer'] })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
      qrToken: QR_TOKEN,
      paymentMethod: 'transfer',
      paymentStatus: 'expired',
      holdExpiresAt: Date.now() - 1000,
      companions: 0,
    })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await setGuestPaymentStatus(EVENT_ID, GUEST_ID, 'paid')

    const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
    expect(guest?.paymentStatus).toBe('paid')
    expect(guest?.holdExpiresAt).toBeNull()
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(2)
    expect(event?.peopleCount).toBe(2)
  })

  it('should refuse to reclaim capacity when confirming payment on an expired reservation with no room left', async () => {
    await seedEvent(testEnv, EVENT_ID, { capacity: 1, guestCount: 1, peopleCount: 1, requiresPayment: true, paymentMethods: ['transfer'] })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
      qrToken: QR_TOKEN,
      paymentMethod: 'transfer',
      paymentStatus: 'expired',
      holdExpiresAt: Date.now() - 1000,
      companions: 0,
    })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await expect(setGuestPaymentStatus(EVENT_ID, GUEST_ID, 'paid')).rejects.toThrow()

    const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
    expect(guest?.paymentStatus).toBe('expired')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(1)
  })

  it('should move a holding guest to pending_confirmation on submitPaymentProof without touching capacity', async () => {
    await seedEvent(testEnv, EVENT_ID, { capacity: 5, guestCount: 1, peopleCount: 1, requiresPayment: true, paymentMethods: ['transfer'] })
    const holdExpiresAt = Date.now() + 15 * 60 * 1000
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
      qrToken: QR_TOKEN,
      paymentMethod: 'transfer',
      holdExpiresAt,
      companions: 0,
    })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await submitPaymentProof(EVENT_ID, GUEST_ID, 'Transferencia a las 15:32')

    const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
    expect(guest?.paymentStatus).toBe('pending_confirmation')
    expect(guest?.paymentNote).toBe('Transferencia a las 15:32')
    expect(guest?.holdExpiresAt as number).toBeGreaterThan(holdExpiresAt)
    // No debe tocar el cupo: seguía contando desde que se registró.
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(1)
  })

  it('should ignore submitPaymentProof for a cash guest (nothing to confirm in advance)', async () => {
    await seedEvent(testEnv, EVENT_ID, { requiresPayment: true, paymentMethods: ['cash'] })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, paymentMethod: 'cash', holdExpiresAt: null })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await submitPaymentProof(EVENT_ID, GUEST_ID, 'op. 123')

    const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
    expect(guest?.paymentStatus).toBe('unpaid')
  })

  it('should release capacity when the organizer rejects a pending_confirmation claim', async () => {
    await seedEvent(testEnv, EVENT_ID, { capacity: 1, guestCount: 1, peopleCount: 1, requiresPayment: true, paymentMethods: ['transfer', 'cash'] })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
      qrToken: QR_TOKEN,
      paymentMethod: 'transfer',
      paymentStatus: 'pending_confirmation',
      holdExpiresAt: Date.now() + 60 * 60 * 1000,
      companions: 0,
    })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await setGuestPaymentStatus(EVENT_ID, GUEST_ID, 'unpaid')

    // El decremento de cupo pasa DENTRO de la transacción que awaitea
    // setGuestPaymentStatus (a diferencia de la promoción de lista de
    // espera, que es best-effort y no bloquea el return) — se puede leer
    // sincrónicamente apenas resuelve.
    const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
    expect(guest?.paymentStatus).toBe('expired')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(0)
    expect(event?.peopleCount).toBe(0)
  })

  it('should auto-promote the waitlist after a rejection frees up a spot', async () => {
    await seedEvent(testEnv, EVENT_ID, { capacity: 1, guestCount: 1, peopleCount: 1, requiresPayment: true, paymentMethods: ['transfer', 'cash'] })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
      qrToken: QR_TOKEN,
      paymentMethod: 'transfer',
      paymentStatus: 'pending_confirmation',
      holdExpiresAt: Date.now() + 60 * 60 * 1000,
      companions: 0,
    })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()
    await addToWaitlist(EVENT_ID, 'Ana', 'García', '+10000000000')

    await setGuestPaymentStatus(EVENT_ID, GUEST_ID, 'unpaid')

    // La promoción es best-effort y asíncrona (no bloquea setGuestPaymentStatus)
    // — se espera con reintentos acotados en vez de una espera fija. Se
    // chequea el estado del entry de lista de espera (no guestCount): con
    // capacity=1 el conteo vuelve como mucho a 1 tanto si promovió como si
    // no, así que no distingue nada por sí solo.
    let promoted = false
    for (let attempt = 0; attempt < 20 && !promoted; attempt++) {
      const snap = await getDocs(query(collection(dbHolder.db, 'events', EVENT_ID, 'waitlist'), where('status', '==', 'promoted')))
      if (!snap.empty) promoted = true
      else await new Promise((resolve) => setTimeout(resolve, 150))
    }
    expect(promoted).toBe(true)
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(1)
  })

  it('should complete the full walkIn -> checkInGuest -> walkOut transaction flow', async () => {
    await seedEvent(testEnv, EVENT_ID, { capacity: 5, checkedInCount: 0 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    const walkInResult = await walkIn(EVENT_ID)
    expect(walkInResult).toBe('success')

    const checkin = await checkInGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com')
    expect(checkin.status).toBe('success')

    let event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.checkedInCount).toBe(2)
    expect(event?.occupancyCount).toBe(2)

    await walkOut(EVENT_ID)

    event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.checkedInCount).toBe(1)
    expect(event?.occupancyCount).toBe(1)
  })

  it('should increment guestCount by 1 and peopleCount by partySize on addGuest (family/group)', async () => {
    await seedEvent(testEnv, EVENT_ID, { guestCount: 0, peopleCount: 0 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    const result = await addGuest(EVENT_ID, {
      name: 'Familia Muñoz',
      companions: [{}, {}, {}],
      isGroup: true,
    })

    expect(result.status).toBe('added')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(1)
    expect(event?.peopleCount).toBe(4)
  })

  it('should increment guestCount and peopleCount by the same amount on addGuestsBulk (no companions)', async () => {
    await seedEvent(testEnv, EVENT_ID, { guestCount: 0, peopleCount: 0 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await addGuestsBulk(EVENT_ID, ['Juan Pérez', 'María López'])

    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(2)
    expect(event?.peopleCount).toBe(2)
  })

  it('should decrement guestCount, peopleCount, checkedInCount and occupancyCount by partySize on deleteGuest while still inside', async () => {
    await seedEvent(testEnv, EVENT_ID, { guestCount: 1, peopleCount: 4, checkedInCount: 4, occupancyCount: 4 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await deleteGuest(EVENT_ID, {
      id: GUEST_ID,
      status: 'checked_in',
      companions: [{}, {}, {}],
      checkedOutAt: null,
      exitType: null,
      paymentStatus: 'unpaid',
    })

    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(0)
    expect(event?.peopleCount).toBe(0)
    expect(event?.checkedInCount).toBe(0)
    expect(event?.occupancyCount).toBe(0)
  })

  it('should not double-decrement occupancyCount on deleteGuest when the guest had already exited', async () => {
    await seedEvent(testEnv, EVENT_ID, { guestCount: 1, peopleCount: 4, checkedInCount: 4, occupancyCount: 0 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await deleteGuest(EVENT_ID, {
      id: GUEST_ID,
      status: 'checked_in',
      companions: [{}, {}, {}],
      checkedOutAt: Date.now(),
      exitType: 'final',
      paymentStatus: 'unpaid',
    })

    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(0)
    expect(event?.peopleCount).toBe(0)
    expect(event?.checkedInCount).toBe(0)
    expect(event?.occupancyCount).toBe(0)
  })

  it('should adjust peopleCount when updateGuest changes the companions count', async () => {
    await seedEvent(testEnv, EVENT_ID, { peopleCount: 4 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, companions: [{}, {}, {}] })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await updateGuest(EVENT_ID, GUEST_ID, { name: 'Familia Muñoz', companions: [{}, {}, {}, {}, {}] })

    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.peopleCount).toBe(6)
  })

  describe('updateGuestSelf (auto-edición del invitado)', () => {
    it('should let the guest edit name/companions/customData when companions was still the legacy numeric format', async () => {
      await seedEvent(testEnv, EVENT_ID, { peopleCount: 1 })
      // registerWalkInGuest nunca escribe un array de companions, solo un
      // número — companionsCountBefore() en firestore.rules debe tolerar esto.
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, companions: 0, lockToken: null })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      await updateGuestSelf(
        EVENT_ID,
        GUEST_ID,
        null,
        { name: 'Juan', lastName: 'Pérez', phone: '+54 9 11 1234-5678', email: 'juan@test.com', companions: [], customData: {} },
        [],
      )

      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.name).toBe('Juan')
      expect(guest?.lastName).toBe('Pérez')
      expect(guest?.companions).toEqual([])
      const contact = await getGuestContactDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(contact?.phone).toBe('+54 9 11 1234-5678')
      expect(contact?.email).toBe('juan@test.com')
      // No debe tocar ningún contador del evento: no cambia la cantidad de acompañantes.
      const event = await getEventDoc(testEnv, EVENT_ID)
      expect(event?.peopleCount).toBe(1)
    })

    it('should let the guest edit companion details without changing how many there are', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
        qrToken: QR_TOKEN,
        companions: [{ name: 'Uno' }, { name: 'Dos' }],
        lockToken: null,
      })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      await updateGuestSelf(
        EVENT_ID,
        GUEST_ID,
        null,
        {
          name: 'Ana',
          lastName: '',
          phone: '',
          email: '',
          companions: [{ name: 'Uno editado' }, { name: 'Dos editado' }],
          customData: {},
        },
        [],
      )

      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.companions).toEqual([
        { name: 'Uno editado', lastName: '', phone: '' },
        { name: 'Dos editado', lastName: '', phone: '' },
      ])
    })

    it('should reject a direct write that changes the companions COUNT (bypassing the app function)', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, companions: [{}, {}], lockToken: null })
      const publicDb = testEnv.unauthenticatedContext().firestore()

      await assertFails(
        updateDoc(doc(publicDb, 'events', EVENT_ID, 'guests', GUEST_ID), {
          name: 'Intento',
          companions: [{}, {}, {}],
        }),
      )
    })

    it('should reject self-edit when lockToken does not match (pass claimed by another device)', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, companions: [], lockToken: 'device-a' })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      await expect(
        updateGuestSelf(
          EVENT_ID,
          GUEST_ID,
          'device-b',
          { name: 'Intento', lastName: '', phone: '', email: '', companions: [], customData: {} },
          [],
        ),
      ).rejects.toThrow()
    })

    it('should allow self-edit when the pass was never claimed (lockToken null)', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, companions: [], lockToken: null })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      await updateGuestSelf(
        EVENT_ID,
        GUEST_ID,
        null,
        { name: 'Nuevo Nombre', lastName: '', phone: '', email: '', companions: [], customData: {} },
        [],
      )

      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.name).toBe('Nuevo Nombre')
    })

    it('should reject a direct write that sneaks status/paymentStatus alongside name (hasOnly protects check-in/payment)', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, companions: [], lockToken: null, status: 'invited', paymentStatus: 'unpaid' })
      const publicDb = testEnv.unauthenticatedContext().firestore()

      await assertFails(
        updateDoc(doc(publicDb, 'events', EVENT_ID, 'guests', GUEST_ID), {
          name: 'Intento',
          status: 'checked_in',
        }),
      )
      await assertFails(
        updateDoc(doc(publicDb, 'events', EVENT_ID, 'guests', GUEST_ID), {
          name: 'Intento',
          paymentStatus: 'paid',
        }),
      )
    })

    it('should create guestContacts on first self-edit for a list guest that never had a phone', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, companions: [], lockToken: null })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      await updateGuestSelf(
        EVENT_ID,
        GUEST_ID,
        null,
        { name: 'Lista', lastName: '', phone: '11-2222-3333', email: '', companions: [], customData: {} },
        [],
      )

      const contact = await getGuestContactDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(contact?.phone).toBe('11-2222-3333')
    })

    it('should still allow the organizer to edit everything, unaffected by the new self-edit rule', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, companions: [], lockToken: 'device-a' })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      await updateGuest(EVENT_ID, GUEST_ID, { name: 'Editado por organizador' })

      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.name).toBe('Editado por organizador')
    })
  })
})
