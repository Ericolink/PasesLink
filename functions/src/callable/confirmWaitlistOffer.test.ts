import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, getWaitlistEntry, seedEvent, seedWaitlistEntry, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { confirmWaitlistOffer } from './confirmWaitlistOffer.js'

describe('confirmWaitlistOffer', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('creates the guest doc, updates event counters, and marks the entry promoted', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 5, guestCount: 5, rsvpYesCount: 5 })
    await seedWaitlistEntry(db, eventId, 'entry-1', {
      name: 'Ana Ofrecida', partySize: 2, email: 'ana@test.com', phone: '5512345678',
      status: 'offered', offerToken: 'token-1', offerExpiresAt: Date.now() + 60_000,
    })

    const result = await confirmWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'entry-1', offerToken: 'token-1' }))

    expect(result.qrToken).toBeTruthy()

    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    expect(entry?.status).toBe('promoted')
    expect(entry?.promotedGuestId).toBeTruthy()

    const eventSnap = await db.collection('events').doc(eventId).get()
    expect(eventSnap.data()?.peopleCount).toBe(7)
    expect(eventSnap.data()?.guestCount).toBe(6)

    const guestSnap = await db.collection('events').doc(eventId).collection('guests').doc(entry!.promotedGuestId as string).get()
    expect(guestSnap.data()?.name).toBe('Ana Ofrecida')
    expect(guestSnap.data()?.companions).toBe(1)
    expect(guestSnap.data()?.rsvpStatus).toBe('yes')

    const contactSnap = await db.collection('events').doc(eventId).collection('guestContacts').doc(entry!.promotedGuestId as string).get()
    expect(contactSnap.data()?.email).toBe('ana@test.com')
  })

  it('propagates the waitlist entry\'s registrationSource: "self" onto the promoted guest', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 0, guestCount: 0 })
    await seedWaitlistEntry(db, eventId, 'entry-1', {
      status: 'offered', offerToken: 'token-1', offerExpiresAt: Date.now() + 60_000, registrationSource: 'self',
    })

    await confirmWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'entry-1', offerToken: 'token-1' }))

    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    const guestSnap = await db.collection('events').doc(eventId).collection('guests').doc(entry!.promotedGuestId as string).get()
    expect(guestSnap.data()?.registrationSource).toBe('self')
  })

  it('defaults to registrationSource: "organizer" when the waitlist entry predates the field', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 0, guestCount: 0 })
    await seedWaitlistEntry(db, eventId, 'entry-1', {
      status: 'offered', offerToken: 'token-1', offerExpiresAt: Date.now() + 60_000,
    })

    await confirmWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'entry-1', offerToken: 'token-1' }))

    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    const guestSnap = await db.collection('events').doc(eventId).collection('guests').doc(entry!.promotedGuestId as string).get()
    expect(guestSnap.data()?.registrationSource).toBe('organizer')
  })

  it('copies customData (respuestas a campos personalizados) into the new guest doc', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 0 })
    await seedWaitlistEntry(db, eventId, 'entry-1', {
      status: 'offered', offerToken: 'token-1', offerExpiresAt: Date.now() + 60_000,
      customData: { alergias: 'Ninguna', talla: 'M' },
    })

    const result = await confirmWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'entry-1', offerToken: 'token-1' }))

    const guestSnap = await db.collection('events').doc(eventId).collection('guests').doc(
      (await getWaitlistEntry(db, eventId, 'entry-1'))!.promotedGuestId as string,
    ).get()
    expect(guestSnap.data()?.customData).toEqual({ alergias: 'Ninguna', talla: 'M' })
    expect(result.qrToken).toBeTruthy()
  })

  it('uses the chosen payment method when the event requires payment', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 0, requiresPayment: true })
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'offered', offerToken: 'token-1', offerExpiresAt: Date.now() + 60_000 })

    await confirmWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'entry-1', offerToken: 'token-1', paymentMethod: 'cash' }))

    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    const guestSnap = await db.collection('events').doc(eventId).collection('guests').doc(entry!.promotedGuestId as string).get()
    expect(guestSnap.data()?.paymentMethod).toBe('cash')
  })

  it('never sets a payment method for a free event, even if one is passed', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 0, requiresPayment: false })
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'offered', offerToken: 'token-1', offerExpiresAt: Date.now() + 60_000 })

    await confirmWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'entry-1', offerToken: 'token-1', paymentMethod: 'cash' }))

    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    const guestSnap = await db.collection('events').doc(eventId).collection('guests').doc(entry!.promotedGuestId as string).get()
    expect(guestSnap.data()?.paymentMethod).toBeNull()
  })

  it('rejects an invalid offerToken', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 0 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'offered', offerToken: 'real-token', offerExpiresAt: Date.now() + 60_000 })

    await expect(
      confirmWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'entry-1', offerToken: 'wrong-token' })),
    ).rejects.toThrow(HttpsError)

    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    expect(entry?.status).toBe('offered')
  })

  it('confirms successfully no matter how long the offer has been open (no auto-expiry)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 0 })
    // offerExpiresAt es vestigial (siempre null en producción, ver
    // promote.ts) — un valor viejo acá no debe afectar nada.
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'offered', offerToken: 'token-1', offerExpiresAt: Date.now() - 999_999_999 })

    const result = await confirmWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'entry-1', offerToken: 'token-1' }))

    expect(result.qrToken).toBeTruthy()
  })

  it('rejects confirming twice (the second attempt no longer sees status offered)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 0 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'offered', offerToken: 'token-1', offerExpiresAt: Date.now() + 60_000 })

    await confirmWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'entry-1', offerToken: 'token-1' }))

    await expect(
      confirmWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'entry-1', offerToken: 'token-1' })),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects when a concurrent manual add already consumed the last spot', async () => {
    // El caso borde real detectado en la revisión de arquitectura (§7 del
    // RFC): la oferta reservó el lugar de forma lógica, pero si peopleCount
    // ya subió por otro camino, el chequeo final acá adentro es la garantía
    // que realmente importa.
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 5, peopleCount: 5 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'offered', offerToken: 'token-1', offerExpiresAt: Date.now() + 60_000, partySize: 1 })

    await expect(
      confirmWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'entry-1', offerToken: 'token-1' })),
    ).rejects.toThrow(HttpsError)

    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    expect(entry?.status).toBe('offered')
  })

  it('never lets two simultaneous confirmations of the same offer both create a guest', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 0 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'offered', offerToken: 'token-1', offerExpiresAt: Date.now() + 60_000 })

    const results = await Promise.allSettled([
      confirmWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'entry-1', offerToken: 'token-1' })),
      confirmWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'entry-1', offerToken: 'token-1' })),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const guestsSnap = await db.collection('events').doc(eventId).collection('guests').get()
    expect(guestsSnap.docs).toHaveLength(1)
  })
})
