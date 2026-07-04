import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, updateDoc } from 'firebase/firestore'
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
})
