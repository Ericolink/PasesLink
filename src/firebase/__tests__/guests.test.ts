import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc } from 'firebase/firestore'
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
import { addGuest, addGuestsBulk, addGuestsFromRows, checkInGuest, checkOutGuest, claimGuestPass, confirmPaymentAndCheckIn, deleteGuest, getAllGuests, resetGuestRsvp, resolveMaxCompanions, setGuestPaymentStatus, setGuestRsvp, subscribeToGuests, submitPaymentProof, updateGuest, updateGuestSelf } from '../guests'

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

  // Auditoría de escalabilidad (F4): "Llegadas por hora" en Reports.tsx ya
  // no recorre toda la subcolección `checkins` — lee este contador agregado.
  it('increments checkinsByHour for the current hour bucket on check-in', async () => {
    await seedEvent(testEnv, EVENT_ID, { checkedInCount: 0 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await checkInGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com')

    const expectedHourLabel = `${new Date().getHours().toString().padStart(2, '0')}:00`
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.checkinsByHour).toEqual({ [expectedHourLabel]: 1 })
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

  it('should move a guest to pending_confirmation on submitPaymentProof without touching guestCount/peopleCount', async () => {
    await seedEvent(testEnv, EVENT_ID, { capacity: 5, guestCount: 1, peopleCount: 1, requiresPayment: true, paymentMethods: ['transfer'] })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
      qrToken: QR_TOKEN,
      paymentMethod: 'transfer',
      companions: 0,
    })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await submitPaymentProof(EVENT_ID, GUEST_ID, 'Transferencia a las 15:32')

    const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
    expect(guest?.paymentStatus).toBe('pending_confirmation')
    expect(guest?.paymentNote).toBe('Transferencia a las 15:32')
    // Nunca toca el cupo: seguía contando desde que se registró, sin plazo.
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(1)
  })

  it('should ignore submitPaymentProof for a cash guest (nothing to confirm in advance)', async () => {
    await seedEvent(testEnv, EVENT_ID, { requiresPayment: true, paymentMethods: ['cash'] })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, paymentMethod: 'cash' })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await submitPaymentProof(EVENT_ID, GUEST_ID, 'op. 123')

    const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
    expect(guest?.paymentStatus).toBe('unpaid')
  })

  it('should increment paidCount by partySize when the organizer approves a payment', async () => {
    await seedEvent(testEnv, EVENT_ID, { requiresPayment: true, paymentMethods: ['transfer'], paidCount: 0 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
      qrToken: QR_TOKEN,
      paymentMethod: 'transfer',
      paymentStatus: 'pending_confirmation',
      companions: [{}, {}],
    })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await setGuestPaymentStatus(EVENT_ID, GUEST_ID, 'paid')

    const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
    expect(guest?.paymentStatus).toBe('paid')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.paidCount).toBe(3)
    // Nunca toca guestCount/peopleCount: el invitado ya contaba desde que se registró.
    expect(event?.guestCount).toBe(0)
  })

  it('should decrement paidCount by partySize when the organizer reverts an approved payment', async () => {
    await seedEvent(testEnv, EVENT_ID, { requiresPayment: true, paymentMethods: ['transfer'], paidCount: 3 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
      qrToken: QR_TOKEN,
      paymentMethod: 'transfer',
      paymentStatus: 'paid',
      companions: [{}, {}],
    })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await setGuestPaymentStatus(EVENT_ID, GUEST_ID, 'unpaid')

    const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
    expect(guest?.paymentStatus).toBe('unpaid')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.paidCount).toBe(0)
  })

  it('should not double-count paidCount when approving a payment that was already paid', async () => {
    await seedEvent(testEnv, EVENT_ID, { requiresPayment: true, paymentMethods: ['transfer', 'cash'], paidCount: 3 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
      qrToken: QR_TOKEN,
      paymentMethod: 'transfer',
      paymentStatus: 'paid',
      companions: [{}, {}],
    })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    // Solo cambia el método (p.ej. corrigiendo un error), sigue 'paid' -> 'paid'.
    await setGuestPaymentStatus(EVENT_ID, GUEST_ID, 'paid', 'cash')

    const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
    expect(guest?.paymentMethod).toBe('cash')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.paidCount).toBe(3)
  })

  it('should let a legacy "expired" guest submit a payment proof same as an unpaid guest', async () => {
    // 'expired' es un valor legacy (ver GuestPaymentStatus) — el código ya no
    // lo escribe, pero un documento viejo puede seguir teniéndolo.
    await seedEvent(testEnv, EVENT_ID, { requiresPayment: true, paymentMethods: ['transfer'] })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
      qrToken: QR_TOKEN,
      paymentMethod: 'transfer',
      paymentStatus: 'expired',
    })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await submitPaymentProof(EVENT_ID, GUEST_ID, 'op. 456')

    const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
    expect(guest?.paymentStatus).toBe('pending_confirmation')
  })

  it('should let the organizer approve payment for a legacy "expired" guest without any capacity check', async () => {
    await seedEvent(testEnv, EVENT_ID, { capacity: 1, guestCount: 1, peopleCount: 1, requiresPayment: true, paymentMethods: ['transfer'], paidCount: 0 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
      qrToken: QR_TOKEN,
      paymentMethod: 'transfer',
      paymentStatus: 'expired',
      companions: 0,
    })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await setGuestPaymentStatus(EVENT_ID, GUEST_ID, 'paid')

    const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
    expect(guest?.paymentStatus).toBe('paid')
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.paidCount).toBe(1)
    expect(event?.guestCount).toBe(1)
  })

  it('should decrement paidCount when deleting an already-paid guest', async () => {
    await seedEvent(testEnv, EVENT_ID, { guestCount: 1, peopleCount: 3, checkedInCount: 0, occupancyCount: 0, paidCount: 3 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await deleteGuest(EVENT_ID, {
      id: GUEST_ID,
      status: 'invited',
      companions: [{}, {}],
      checkedOutAt: null,
      exitType: null,
      paymentStatus: 'paid',
      rsvpStatus: 'pending',
    })

    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(0)
    expect(event?.peopleCount).toBe(0)
    expect(event?.paidCount).toBe(0)
  })

  it('should adjust paidCount when updateGuest changes the companions count of an already-paid guest', async () => {
    await seedEvent(testEnv, EVENT_ID, { peopleCount: 4, paidCount: 4, maxCompanions: 20 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, paymentStatus: 'paid', companions: [{}, {}, {}] })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await updateGuest(EVENT_ID, GUEST_ID, { companions: [{}, {}, {}, {}, {}] }, 20)

    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.peopleCount).toBe(6)
    expect(event?.paidCount).toBe(6)
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

    // maxCompanions: 0 a propósito — isGroup: true debe bypassear el límite
    // por completo, tanto en la capa de aplicación como en firestore.rules.
    const result = await addGuest(EVENT_ID, {
      name: 'Familia Muñoz',
      companions: [{}, {}, {}],
      isGroup: true,
    }, 0)

    expect(result.id).toBeTruthy()
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(1)
    expect(event?.peopleCount).toBe(4)
    // Auditoría F22: buildNewGuestPayload siempre arranca en rsvpStatus
    // 'pending' — addGuest debe sumarlo a rsvpPendingCount, no a otro balde.
    expect(event?.rsvpPendingCount).toBe(1)
  })

  it('should let a co-organizer with addGuests but WITHOUT editGuests add a guest with a phone number', async () => {
    const COORG_UID = 'coorg-addonly-uid'
    await seedEvent(testEnv, EVENT_ID, {
      guestCount: 0, peopleCount: 0,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: {
        [COORG_UID]: {
          addGuests: true, editGuests: false, deleteGuests: false, shareInviteLink: false,
          confirmPayments: false, scanQr: false, viewGuestList: true, postWall: false,
          moderateWall: false, editEvent: false, manageCoOrganizers: false, viewReports: false,
          exportLists: false, downloadEventInfo: false,
        },
      },
    })
    dbHolder.db = testEnv.authenticatedContext(COORG_UID).firestore()

    const result = await addGuest(EVENT_ID, { name: 'Juan', lastName: 'Pérez', phone: '11-2222-3333' }, 0)

    const contact = await getGuestContactDoc(testEnv, EVENT_ID, result.id)
    expect(contact?.phone).toBe('11-2222-3333')
  })

  it('should increment guestCount and peopleCount by the same amount on addGuestsBulk (no companions)', async () => {
    await seedEvent(testEnv, EVENT_ID, { guestCount: 0, peopleCount: 0 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await addGuestsBulk(EVENT_ID, ['Juan Pérez', 'María López'])

    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(2)
    expect(event?.peopleCount).toBe(2)
  })

  it('should let a co-organizer with addGuests bulk-add more than 50 names without the batch being rejected (issue #91)', async () => {
    const COORG_UID = 'coorg-bulk-uid'
    await seedEvent(testEnv, EVENT_ID, {
      guestCount: 0,
      peopleCount: 0,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: {
        [COORG_UID]: {
          addGuests: true, editGuests: false, deleteGuests: false, shareInviteLink: false,
          confirmPayments: false, scanQr: false, viewGuestList: true, postWall: false,
          moderateWall: false, editEvent: false, manageCoOrganizers: false, viewReports: false,
          exportLists: false, downloadEventInfo: false,
        },
      },
    })
    dbHolder.db = testEnv.authenticatedContext(COORG_UID).firestore()
    const names = Array.from({ length: 120 }, (_, i) => `Invitado ${i}`)

    await addGuestsBulk(EVENT_ID, names)

    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(120)
    expect(event?.peopleCount).toBe(120)
  })

  it('should import guests from CSV rows, creating guest + contact docs and incrementing counters', async () => {
    await seedEvent(testEnv, EVENT_ID, { guestCount: 0, peopleCount: 0 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await addGuestsFromRows(EVENT_ID, [
      { name: 'Juan', lastName: 'Pérez', phone: '11-2222-3333', email: 'juan@test.com' },
      { name: 'María', lastName: 'López' },
    ])

    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(2)
    expect(event?.peopleCount).toBe(2)
  })

  it('should let a co-organizer with addGuests (but not editGuests) import CSV rows with phone/email', async () => {
    const COORG_UID = 'coorg-csv-uid'
    await seedEvent(testEnv, EVENT_ID, {
      guestCount: 0,
      peopleCount: 0,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: {
        [COORG_UID]: {
          addGuests: true, editGuests: false, deleteGuests: false, shareInviteLink: false,
          confirmPayments: false, scanQr: false, viewGuestList: true, postWall: false,
          moderateWall: false, editEvent: false, manageCoOrganizers: false, viewReports: false,
          exportLists: false, downloadEventInfo: false,
        },
      },
    })
    dbHolder.db = testEnv.authenticatedContext(COORG_UID).firestore()

    await addGuestsFromRows(EVENT_ID, [{ name: 'Ana', lastName: 'Gómez', phone: '11-4444-5555' }])

    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(1)
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
      rsvpStatus: 'pending',
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
      rsvpStatus: 'pending',
    })

    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(0)
    expect(event?.peopleCount).toBe(0)
    expect(event?.checkedInCount).toBe(0)
    expect(event?.occupancyCount).toBe(0)
  })

  it('should let a co-organizer with only deleteGuests delete a guest who is both checked-in and paid (5 counters at once)', async () => {
    const COORG_UID = 'coorg-delete-uid'
    await seedEvent(testEnv, EVENT_ID, {
      guestCount: 1, peopleCount: 3, checkedInCount: 3, occupancyCount: 3, paidCount: 3,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: {
        [COORG_UID]: {
          addGuests: false, editGuests: false, deleteGuests: true, shareInviteLink: false,
          confirmPayments: false, scanQr: false, viewGuestList: true, postWall: false,
          moderateWall: false, editEvent: false, manageCoOrganizers: false, viewReports: false,
          exportLists: false, downloadEventInfo: false,
        },
      },
    })
    dbHolder.db = testEnv.authenticatedContext(COORG_UID).firestore()

    await deleteGuest(EVENT_ID, {
      id: GUEST_ID,
      status: 'checked_in',
      companions: [{}, {}],
      checkedOutAt: null,
      exitType: null,
      paymentStatus: 'paid',
      rsvpStatus: 'pending',
    })

    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(0)
    expect(event?.peopleCount).toBe(0)
    expect(event?.checkedInCount).toBe(0)
    expect(event?.occupancyCount).toBe(0)
    expect(event?.paidCount).toBe(0)
  })

  it('should reject a co-organizer WITHOUT deleteGuests trying to delete a checked-in guest', async () => {
    const COORG_UID = 'coorg-nodelete-uid'
    await seedEvent(testEnv, EVENT_ID, {
      guestCount: 1, peopleCount: 3, checkedInCount: 3, occupancyCount: 3,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: {
        [COORG_UID]: {
          addGuests: false, editGuests: false, deleteGuests: false, shareInviteLink: false,
          confirmPayments: false, scanQr: false, viewGuestList: true, postWall: false,
          moderateWall: false, editEvent: false, manageCoOrganizers: false, viewReports: false,
          exportLists: false, downloadEventInfo: false,
        },
      },
    })
    dbHolder.db = testEnv.authenticatedContext(COORG_UID).firestore()

    await expect(
      deleteGuest(EVENT_ID, {
        id: GUEST_ID,
        status: 'checked_in',
        companions: [{}, {}],
        checkedOutAt: null,
        exitType: null,
        paymentStatus: 'unpaid',
        rsvpStatus: 'pending',
      }),
    ).rejects.toThrow()
  })

  it('should adjust peopleCount when updateGuest changes the companions count', async () => {
    await seedEvent(testEnv, EVENT_ID, { peopleCount: 4, maxCompanions: 20 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, companions: [{}, {}, {}] })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await updateGuest(EVENT_ID, GUEST_ID, { name: 'Familia Muñoz', companions: [{}, {}, {}, {}, {}] }, 20)

    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.peopleCount).toBe(6)
  })

  describe('maxCompanions (tope de acompañantes por invitado)', () => {
    it('should allow addGuest with exactly the configured limit of companions', async () => {
      await seedEvent(testEnv, EVENT_ID, { guestCount: 0, peopleCount: 0, maxCompanions: 2 })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      const result = await addGuest(EVENT_ID, { name: 'Ana', companions: [{}, {}] }, 2)

      expect(result.id).toBeTruthy()
      const event = await getEventDoc(testEnv, EVENT_ID)
      expect(event?.peopleCount).toBe(3)
    })

    it('should reject addGuest with more companions than the configured limit (app layer)', async () => {
      await seedEvent(testEnv, EVENT_ID, { guestCount: 0, peopleCount: 0, maxCompanions: 1 })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      await expect(
        addGuest(EVENT_ID, { name: 'Ana', companions: [{}, {}] }, 1),
      ).rejects.toThrow()
    })

    it('should reject a direct write exceeding the limit, bypassing the app function (rules layer)', async () => {
      await seedEvent(testEnv, EVENT_ID, { guestCount: 0, peopleCount: 0, maxCompanions: 1 })
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertFails(
        setDoc(doc(ownerDb, 'events', EVENT_ID, 'guests', 'new-guest'), {
          name: 'Ana',
          lastName: '',
          companions: [{}, {}],
          isGroup: false,
          customData: {},
          rsvpStatus: 'pending',
          qrToken: 'qr-new',
          status: 'invited',
          checkedInAt: null,
          checkedInBy: null,
          checkedInByEmail: null,
          checkedOutAt: null,
          checkedOutByEmail: null,
          exitType: null,
          lockToken: null,
          paymentStatus: 'unpaid',
          paymentMethod: null,
          createdAt: Date.now(),
        }),
      )
    })

    it('should reject updateGuest increasing companions past the configured limit', async () => {
      await seedEvent(testEnv, EVENT_ID, { peopleCount: 1, maxCompanions: 0 })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, companions: [] })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      await expect(
        updateGuest(EVENT_ID, GUEST_ID, { companions: [{}] }, 0),
      ).rejects.toThrow()
    })

    it('should let addGuest bypass the limit for a group (isGroup: true)', async () => {
      await seedEvent(testEnv, EVENT_ID, { guestCount: 0, peopleCount: 0, maxCompanions: 0 })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      const result = await addGuest(EVENT_ID, {
        name: 'Familia Grande',
        companions: [{}, {}, {}, {}],
        isGroup: true,
      }, 0)

      expect(result.id).toBeTruthy()
      const event = await getEventDoc(testEnv, EVENT_ID)
      expect(event?.peopleCount).toBe(5)
    })

    it('should grandfather a legacy guest already over the limit: editing other fields without increasing companions still works', async () => {
      await seedEvent(testEnv, EVENT_ID, { peopleCount: 4, maxCompanions: 0 })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, companions: [{}, {}, {}] })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      await updateGuest(EVENT_ID, GUEST_ID, { name: 'Nombre editado' }, 0)

      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.name).toBe('Nombre editado')
      expect(guest?.companions).toHaveLength(3)
    })

    it('should grandfather a legacy guest already over the limit: reducing companions (but not increasing) still works', async () => {
      await seedEvent(testEnv, EVENT_ID, { peopleCount: 4, maxCompanions: 0 })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, companions: [{}, {}, {}] })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      await updateGuest(EVENT_ID, GUEST_ID, { companions: [{}, {}] }, 0)

      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.companions).toHaveLength(2)
    })

    it('should treat an event without maxCompanions configured as the legacy limit of 9 (party of 10)', async () => {
      // Sin `maxCompanions` en absoluto (evento de antes de este campo): cae
      // al default legacy de 9 acompañantes (GUEST_LEGACY_MAX_COMPANIONS, el
      // grupo de 10 que esos eventos siempre permitieron) — ni a 0 (les
      // quitaba los acompañantes en silencio) ni a "sin límite".
      await seedEvent(testEnv, EVENT_ID, { guestCount: 0, peopleCount: 0 })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      // Mismo tercer argumento que pasan los llamadores reales (EventDetail →
      // GuestAddForm): el límite ya resuelto para un evento sin el campo. Que
      // el alta de 9 acompañantes llegue a Firestore verifica además que el
      // default de eventMaxCompanions en las reglas coincida con el cliente.
      const resolvedLimit = resolveMaxCompanions({})
      await addGuest(EVENT_ID, { name: 'Ana', companions: Array.from({ length: 9 }, () => ({})) }, resolvedLimit)
      await expect(
        addGuest(EVENT_ID, { name: 'Beto', companions: Array.from({ length: 10 }, () => ({})) }, resolvedLimit),
      ).rejects.toThrow()
    })
  })

  describe('confirmPaymentAndCheckIn (botón "Sí, ya pagó" del escáner)', () => {
    it('should mark the guest as paid and check them in, moving paidCount/checkedInCount/occupancyCount together', async () => {
      await seedEvent(testEnv, EVENT_ID, { requiresPayment: true, paymentMethods: ['cash'], paidCount: 0, checkedInCount: 0, occupancyCount: 0 })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
        qrToken: QR_TOKEN,
        paymentStatus: 'unpaid',
        companions: [{ name: 'Uno' }],
      })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      const result = await confirmPaymentAndCheckIn(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com', 'cash')

      expect(result.status).toBe('success')
      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.paymentStatus).toBe('paid')
      expect(guest?.paymentMethod).toBe('cash')
      expect(guest?.status).toBe('checked_in')
      const event = await getEventDoc(testEnv, EVENT_ID)
      // 1 invitado + 1 acompañante = 2, en los 3 contadores a la vez.
      expect(event?.paidCount).toBe(2)
      expect(event?.checkedInCount).toBe(2)
      expect(event?.occupancyCount).toBe(2)
      // checkinsByHour cuenta el ESCANEO (1), no partySize — mismo criterio
      // que el resto de "Llegadas por hora" (auditoría F4).
      const expectedHourLabel = `${new Date().getHours().toString().padStart(2, '0')}:00`
      expect(event?.checkinsByHour).toEqual({ [expectedHourLabel]: 1 })
    })

    it('should not double-count paidCount if the payment was already approved from another screen (race)', async () => {
      await seedEvent(testEnv, EVENT_ID, { requiresPayment: true, paymentMethods: ['transfer'], paidCount: 1, checkedInCount: 0, occupancyCount: 0 })
      // Otro dispositivo ya aprobó el pago justo antes de que el guardia
      // tocara "Sí, ya pagó" (comprobante ya revisado desde GuestList).
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, paymentStatus: 'paid', paymentMethod: 'transfer' })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      const result = await confirmPaymentAndCheckIn(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com')

      expect(result.status).toBe('success')
      const event = await getEventDoc(testEnv, EVENT_ID)
      expect(event?.paidCount).toBe(1)
    })

    it('should return already_checked_in without touching counters if the guest is already inside', async () => {
      await seedEvent(testEnv, EVENT_ID, { requiresPayment: true, paymentMethods: ['cash'], paidCount: 1, checkedInCount: 1, occupancyCount: 1 })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, paymentStatus: 'paid', status: 'checked_in' })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      const result = await confirmPaymentAndCheckIn(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com', 'cash')

      expect(result.status).toBe('already_checked_in')
      const event = await getEventDoc(testEnv, EVENT_ID)
      expect(event?.paidCount).toBe(1)
      expect(event?.checkedInCount).toBe(1)
    })

    it('should block re-entry with blocked_final_exit for a guest who left for good', async () => {
      await seedEvent(testEnv, EVENT_ID, { requiresPayment: true, paymentMethods: ['cash'] })
      // paymentStatus 'paid' desde el inicio para poder pasar por el check-in
      // y check-out reales (checkInGuest/checkOutGuest) y así producir un
      // checkedOutAt/exitType genuinos (un Firestore Timestamp real, no un
      // número JS crudo que mapGuest no sabría convertir).
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, paymentStatus: 'paid' })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()
      await checkInGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com')
      await checkOutGuest(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com', 'final')

      const result = await confirmPaymentAndCheckIn(EVENT_ID, QR_TOKEN, OWNER_UID, 'owner@test.com', 'cash')

      expect(result.status).toBe('blocked_final_exit')
    })

    it('should reject a direct write combining check-in and payment fields for a co-organizer with scanQr but not confirmPayments', async () => {
      const COORG_UID = 'coorg-uid'
      // Rol "staff de acceso": solo scanQr (y viewGuestList para poder ver la
      // lista) — todo lo demás explícitamente en false, para no caer en el
      // default amplio de LEGACY_COORG_DEFAULTS (editGuests: true de fábrica
      // habilitaría cualquier escritura sobre el invitado, tapando el chequeo
      // puntual que este test quiere aislar).
      await seedEvent(testEnv, EVENT_ID, {
        requiresPayment: true,
        paymentMethods: ['cash'],
        coOrganizersMap: { [COORG_UID]: true },
        coOrganizerPermissions: {
          [COORG_UID]: {
            addGuests: false,
            editGuests: false,
            deleteGuests: false,
            shareInviteLink: false,
            confirmPayments: false,
            scanQr: true,
            viewGuestList: true,
            postWall: false,
            moderateWall: false,
            editEvent: false,
            manageCoOrganizers: false,
            viewReports: false,
            exportLists: false,
            downloadEventInfo: false,
          },
        },
      })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, paymentStatus: 'unpaid' })
      const coOrgDb = testEnv.authenticatedContext(COORG_UID).firestore()

      await assertFails(
        updateDoc(doc(coOrgDb, 'events', EVENT_ID, 'guests', GUEST_ID), {
          status: 'checked_in',
          paymentStatus: 'paid',
        }),
      )
    })
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
        { name: 'Uno editado', lastName: '', phone: '', phoneCountry: '' },
        { name: 'Dos editado', lastName: '', phone: '', phoneCountry: '' },
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

    it('should reject self-edit from a device not in lockTokens (pass claimed by other devices)', async () => {
      await seedEvent(testEnv, EVENT_ID)
      // lockTokens es la fuente real de verdad (ver claimGuestPass) — un doc
      // con lockToken pero SIN lockTokens se trata como "sin reclamar
      // todavía" (transición permisiva para docs legacy), así que este test
      // necesita sembrar lockTokens explícitamente para probar el rechazo.
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, companions: [], lockToken: 'device-a', lockTokens: ['device-a'] })
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

    it('should allow self-edit from any device already recognized in lockTokens', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, companions: [], lockToken: 'device-b', lockTokens: ['device-a', 'device-b'] })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      await updateGuestSelf(
        EVENT_ID,
        GUEST_ID,
        'device-a',
        { name: 'Editado desde el primer dispositivo', lastName: '', phone: '', email: '', companions: [], customData: {} },
        [],
      )

      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.name).toBe('Editado desde el primer dispositivo')
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

      await updateGuest(EVENT_ID, GUEST_ID, { name: 'Editado por organizador' }, 0)

      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.name).toBe('Editado por organizador')
    })
  })

  describe('claimGuestPass (reconocimiento de dispositivos, no bloqueo)', () => {
    it('should claim an unclaimed pass for the first device', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, lockToken: null })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      const devices = await claimGuestPass(EVENT_ID, GUEST_ID, 'device-a')

      expect(devices).toEqual(['device-a'])
      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.lockToken).toBe('device-a')
      expect(guest?.lockTokens).toEqual(['device-a'])
    })

    it('should be a no-op (not grow the list) when the same device claims again', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, lockToken: 'device-a', lockTokens: ['device-a'] })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      const devices = await claimGuestPass(EVENT_ID, GUEST_ID, 'device-a')

      expect(devices).toEqual(['device-a'])
    })

    it('should recognize a second device instead of blocking it (falso positivo típico: mismo invitado, otro navegador)', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, lockToken: 'device-a', lockTokens: ['device-a'] })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      const devices = await claimGuestPass(EVENT_ID, GUEST_ID, 'device-b')

      expect(devices).toEqual(['device-a', 'device-b'])
      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.lockToken).toBe('device-b')
    })

    it('should evict the oldest device (LRU) once an individual pass reaches its 3-device cap', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
        qrToken: QR_TOKEN,
        isGroup: false,
        lockToken: 'device-c',
        lockTokens: ['device-a', 'device-b', 'device-c'],
      })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      const devices = await claimGuestPass(EVENT_ID, GUEST_ID, 'device-d')

      expect(devices).toEqual(['device-b', 'device-c', 'device-d'])
    })

    it('should allow a group pass to grow past 3 devices up to its own (higher) cap', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
        qrToken: QR_TOKEN,
        isGroup: true,
        lockToken: 'device-c',
        lockTokens: ['device-a', 'device-b', 'device-c'],
      })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      const devices = await claimGuestPass(EVENT_ID, GUEST_ID, 'device-d')

      expect(devices).toEqual(['device-a', 'device-b', 'device-c', 'device-d'])
    })

    it('should reject a direct write that tries to sneak the lockTokens array past its cap (bypassing the app function)', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
        qrToken: QR_TOKEN,
        isGroup: false,
        lockToken: 'device-a',
        lockTokens: ['device-a'],
      })
      const publicDb = testEnv.unauthenticatedContext().firestore()

      await assertFails(
        updateDoc(doc(publicDb, 'events', EVENT_ID, 'guests', GUEST_ID), {
          lockToken: 'device-e',
          lockTokens: ['device-a', 'device-b', 'device-c', 'device-d', 'device-e'],
        }),
      )
    })
  })

  // Antes, las 3 ramas de `allow update` de events/{eventId} que dejan tocar
  // checkedInCount/occupancyCount/guestCount/peopleCount/paidCount solo
  // exigían isOwnerOrCoOrg (cualquier coanfitrión) — ver Fase 1 de la
  // auditoría de seguridad. Estos tests prueban que ahora exigen el permiso
  // puntual (scanQr / deleteGuests+confirmPayments+editGuests / ambos a la
  // vez), hablando directo contra Firestore (sin pasar por guests.ts) para
  // aislar exactamente el gap que existía.
  describe('event counter permission gate (direct writes to events/{eventId})', () => {
    const COORG_UID = 'coorg-counter-uid'

    async function seedCoOrg(overrides: Record<string, unknown>) {
      await seedEvent(testEnv, EVENT_ID, {
        checkedInCount: 0,
        occupancyCount: 0,
        guestCount: 1,
        peopleCount: 1,
        paidCount: 0,
        coOrganizersMap: { [COORG_UID]: true },
        coOrganizerPermissions: {
          [COORG_UID]: {
            addGuests: false,
            editGuests: false,
            deleteGuests: false,
            shareInviteLink: false,
            confirmPayments: false,
            scanQr: false,
            viewGuestList: true,
            postWall: false,
            moderateWall: false,
            editEvent: false,
            manageCoOrganizers: false,
            viewReports: false,
            exportLists: false,
            downloadEventInfo: false,
            ...overrides,
          },
        },
      })
    }

    it('should reject a co-organizer without scanQr writing checkedInCount/occupancyCount directly', async () => {
      await seedCoOrg({})
      const coOrgDb = testEnv.authenticatedContext(COORG_UID).firestore()

      await assertFails(
        updateDoc(doc(coOrgDb, 'events', EVENT_ID), { checkedInCount: 1, occupancyCount: 1 }),
      )
    })

    it('should allow a co-organizer with scanQr writing checkedInCount/occupancyCount directly', async () => {
      await seedCoOrg({ scanQr: true })
      const coOrgDb = testEnv.authenticatedContext(COORG_UID).firestore()

      await updateDoc(doc(coOrgDb, 'events', EVENT_ID), { checkedInCount: 1, occupancyCount: 1 })

      const event = await getEventDoc(testEnv, EVENT_ID)
      expect(event?.checkedInCount).toBe(1)
    })

    it('should reject a co-organizer with only viewGuestList writing guestCount/peopleCount/paidCount directly', async () => {
      await seedCoOrg({})
      const coOrgDb = testEnv.authenticatedContext(COORG_UID).firestore()

      await assertFails(
        updateDoc(doc(coOrgDb, 'events', EVENT_ID), { guestCount: 0, peopleCount: 0, paidCount: 0 }),
      )
    })

    it('should allow a co-organizer with deleteGuests writing guestCount/peopleCount/paidCount directly', async () => {
      await seedCoOrg({ deleteGuests: true })
      const coOrgDb = testEnv.authenticatedContext(COORG_UID).firestore()

      await updateDoc(doc(coOrgDb, 'events', EVENT_ID), { guestCount: 0, peopleCount: 0, paidCount: 0 })

      const event = await getEventDoc(testEnv, EVENT_ID)
      expect(event?.guestCount).toBe(0)
    })

    it('should reject a co-organizer with scanQr but not confirmPayments combining the 3 confirmPaymentAndCheckIn counters', async () => {
      await seedCoOrg({ scanQr: true })
      const coOrgDb = testEnv.authenticatedContext(COORG_UID).firestore()

      await assertFails(
        updateDoc(doc(coOrgDb, 'events', EVENT_ID), { checkedInCount: 1, occupancyCount: 1, paidCount: 1 }),
      )
    })

    it('should allow a co-organizer with both scanQr and confirmPayments combining the 3 confirmPaymentAndCheckIn counters', async () => {
      await seedCoOrg({ scanQr: true, confirmPayments: true })
      const coOrgDb = testEnv.authenticatedContext(COORG_UID).firestore()

      await updateDoc(doc(coOrgDb, 'events', EVENT_ID), { checkedInCount: 1, occupancyCount: 1, paidCount: 1 })

      const event = await getEventDoc(testEnv, EVENT_ID)
      expect(event?.paidCount).toBe(1)
    })
  })

  // Fase 6 de la auditoría de rendimiento: subscribeToGuests pasó de un
  // listener sin límite a una ventana en vivo acotada (limitCount), con
  // guestContacts resuelto por id (no por su propio listener sin límite).
  // Estos tests cubren exactamente ese comportamiento nuevo.
  describe('subscribeToGuests (Fase 6: ventana acotada)', () => {
    // Junta emisiones del callback hasta `count` (subscribeToGuests emite al
    // menos dos veces cuando hay contactos que resolver: una vez con los
    // guests recién llegados, sin contacto, y otra vez ya fusionados) y
    // devuelve la ÚLTIMA — el estado asentado, no el intermedio.
    function collectGuestEmissions(
      eventId: string,
      limitCount: number | null,
      count: number,
    ): Promise<import('../../types').GuestData[]> {
      return new Promise((resolve, reject) => {
        const emissions: import('../../types').GuestData[][] = []
        const unsub = subscribeToGuests(
          eventId,
          (guests) => {
            emissions.push(guests)
            if (emissions.length >= count) {
              unsub()
              resolve(emissions[emissions.length - 1])
            }
          },
          (err) => { unsub(); reject(err) },
          limitCount,
        )
      })
    }

    async function seedContact(eventId: string, guestId: string, data: { phone?: string; email?: string }) {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'events', eventId, 'guestContacts', guestId), data)
      })
    }

    it('respects limitCount, ordered by createdAt asc (oldest first), and fuses guestContacts by id', async () => {
      await seedEvent(testEnv, EVENT_ID, { guestCount: 5 })
      for (let i = 0; i < 5; i++) {
        await seedGuest(testEnv, EVENT_ID, `guest-${i}`, { createdAt: 1000 + i, name: `Guest ${i}` })
      }
      await seedContact(EVENT_ID, 'guest-0', { phone: '555-0000', email: '' })
      await seedContact(EVENT_ID, 'guest-1', { phone: '555-0001', email: '' })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      const bounded = await collectGuestEmissions(EVENT_ID, 2, 2)

      expect(bounded).toHaveLength(2)
      expect(bounded.map((g) => g.name)).toEqual(['Guest 0', 'Guest 1'])
      expect(bounded.find((g) => g.id === 'guest-0')?.phone).toBe('555-0000')
      expect(bounded.find((g) => g.id === 'guest-1')?.phone).toBe('555-0001')
    })

    it('returns every guest when limitCount is null, not just the default window', async () => {
      await seedEvent(testEnv, EVENT_ID, { guestCount: 5 })
      for (let i = 0; i < 5; i++) {
        await seedGuest(testEnv, EVENT_ID, `guest-${i}`, { createdAt: 2000 + i, name: `Guest ${i}` })
      }
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      const all = await collectGuestEmissions(EVENT_ID, null, 1)

      expect(all).toHaveLength(5)
    })
  })

  // Auditoría de escalabilidad (F22): rsvpYesCount/rsvpNoCount/
  // rsvpPendingCount reemplazan el recorrido de `guests` que antes hacía
  // Reports.tsx para el desglose de RSVP.
  describe('rsvpYesCount/rsvpNoCount/rsvpPendingCount (auditoría F22)', () => {
    it('moves the guest from rsvpPendingCount to rsvpYesCount on setGuestRsvp', async () => {
      await seedEvent(testEnv, EVENT_ID, { rsvpYesCount: 0, rsvpPendingCount: 1 })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, rsvpStatus: 'pending' })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      await setGuestRsvp(EVENT_ID, QR_TOKEN, 'yes')

      const event = await getEventDoc(testEnv, EVENT_ID)
      expect(event?.rsvpYesCount).toBe(1)
      expect(event?.rsvpPendingCount).toBe(0)
      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.rsvpStatus).toBe('yes')
    })

    it('moves the guest again on a second RSVP change (yes -> no), without double-counting', async () => {
      await seedEvent(testEnv, EVENT_ID, { rsvpYesCount: 1, rsvpNoCount: 0, rsvpPendingCount: 0 })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, rsvpStatus: 'yes' })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      await setGuestRsvp(EVENT_ID, QR_TOKEN, 'no')

      const event = await getEventDoc(testEnv, EVENT_ID)
      expect(event?.rsvpYesCount).toBe(0)
      expect(event?.rsvpNoCount).toBe(1)
    })

    it('does not touch the event counters when the RSVP does not actually change', async () => {
      await seedEvent(testEnv, EVENT_ID, { rsvpYesCount: 1, rsvpPendingCount: 0 })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, rsvpStatus: 'yes' })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      await setGuestRsvp(EVENT_ID, QR_TOKEN, 'yes')

      const event = await getEventDoc(testEnv, EVENT_ID)
      expect(event?.rsvpYesCount).toBe(1)
    })

    it('moves the guest back to rsvpPendingCount on resetGuestRsvp', async () => {
      await seedEvent(testEnv, EVENT_ID, { rsvpNoCount: 1, rsvpPendingCount: 0 })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, rsvpStatus: 'no' })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      await resetGuestRsvp(EVENT_ID, GUEST_ID)

      const event = await getEventDoc(testEnv, EVENT_ID)
      expect(event?.rsvpNoCount).toBe(0)
      expect(event?.rsvpPendingCount).toBe(1)
      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.rsvpStatus).toBe('pending')
    })

    it('decrements rsvpYesCount (not rsvpPendingCount) when deleting a guest who had confirmed', async () => {
      await seedEvent(testEnv, EVENT_ID, { guestCount: 1, peopleCount: 1, rsvpYesCount: 1, rsvpPendingCount: 0 })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      await deleteGuest(EVENT_ID, {
        id: GUEST_ID,
        status: 'invited',
        companions: [],
        checkedOutAt: null,
        exitType: null,
        paymentStatus: 'unpaid',
        rsvpStatus: 'yes',
      })

      const event = await getEventDoc(testEnv, EVENT_ID)
      expect(event?.rsvpYesCount).toBe(0)
      expect(event?.rsvpPendingCount).toBe(0)
    })

    // Un cliente hablando directo con Firestore no puede inflar rsvpYesCount
    // sin una resta compensatoria en otro balde — ver rsvpCountsOk en
    // firestore.rules (exige que la SUMA de los 3 se mantenga igual).
    it('rejects a direct write that inflates rsvpYesCount without a matching decrease elsewhere', async () => {
      await seedEvent(testEnv, EVENT_ID, { rsvpYesCount: 0, rsvpNoCount: 0, rsvpPendingCount: 0 })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      await expect(
        updateDoc(doc(dbHolder.db, 'events', EVENT_ID), { rsvpYesCount: 1000 }),
      ).rejects.toThrow()
    })
  })

  // Auditoría de escalabilidad (F3): Reports.tsx reemplazó el listener sin
  // límite (subscribeToGuests con showAllGuests) por esta lectura puntual.
  describe('getAllGuests (auditoría F3)', () => {
    it('returns every guest ordered by createdAt, with no limit', async () => {
      await seedEvent(testEnv, EVENT_ID, { guestCount: 3 })
      await seedGuest(testEnv, EVENT_ID, 'guest-a', { createdAt: 300, name: 'C' })
      await seedGuest(testEnv, EVENT_ID, 'guest-b', { createdAt: 100, name: 'A' })
      await seedGuest(testEnv, EVENT_ID, 'guest-c', { createdAt: 200, name: 'B' })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      const guests = await getAllGuests(EVENT_ID)

      expect(guests.map((g) => g.name)).toEqual(['A', 'B', 'C'])
    })

    it('rejects a caller without viewGuestList permission', async () => {
      const COORG_UID = 'coorg-noview-uid'
      await seedEvent(testEnv, EVENT_ID, {
        guestCount: 0,
        coOrganizersMap: { [COORG_UID]: true },
        coOrganizerPermissions: {
          [COORG_UID]: {
            addGuests: false, editGuests: false, deleteGuests: false, shareInviteLink: false,
            confirmPayments: false, scanQr: false, viewGuestList: false, postWall: false,
            moderateWall: false, editEvent: false, manageCoOrganizers: false, viewReports: false,
            exportLists: false, downloadEventInfo: false,
          },
        },
      })
      dbHolder.db = testEnv.authenticatedContext(COORG_UID).firestore()

      await expect(getAllGuests(EVENT_ID)).rejects.toThrow()
    })
  })
})
