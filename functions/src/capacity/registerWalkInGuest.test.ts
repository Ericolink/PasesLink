import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import {
  clearFirestoreEmulator,
  getGuestContactsDoc,
  getGuestDoc,
  getTestFirestore,
  seedEvent,
  seedUserProfile,
  seedWaitlistEntry,
  uniqueId,
} from '../__tests__/helpers.js'
import { registerWalkInGuest } from './registerWalkInGuest.js'

describe('registerWalkInGuest (servicio)', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('creates a guest and bumps guestCount/peopleCount/rsvpYesCount', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'open', guestCount: 0, peopleCount: 0 })

    const result = await registerWalkInGuest(db, eventId, { name: 'Ana López' })

    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error('expected success')
    const guest = await getGuestDoc(db, eventId, result.guestId)
    expect(guest?.name).toBe('Ana López')
    expect(guest?.status).toBe('invited')
    expect(guest?.rsvpStatus).toBe('yes')
    expect(guest?.qrToken).toBe(result.qrToken)
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.guestCount).toBe(1)
    expect(event.data()?.peopleCount).toBe(1)
    expect(event.data()?.rsvpYesCount).toBe(1)
  })

  it('stores email/phone in guestContacts, lowercasing the email', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'open' })

    const result = await registerWalkInGuest(db, eventId, {
      name: 'Ana López',
      email: 'Ana@Example.com',
      phone: '+50412345678',
      phoneCountry: 'HN',
    })

    if (result.status !== 'success') throw new Error('expected success')
    const contact = await getGuestContactsDoc(db, eventId, result.guestId)
    expect(contact?.email).toBe('ana@example.com')
    expect(contact?.phone).toBe('+50412345678')
    expect(contact?.phoneCountry).toBe('HN')
  })

  it('rejects registration when entryMode is not open/hybrid', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'invite_only' })

    const result = await registerWalkInGuest(db, eventId, { name: 'Ana López' })

    expect(result.status).toBe('not_open')
  })

  it('returns event_not_found for a missing event', async () => {
    const result = await registerWalkInGuest(db, 'nonexistent-event', { name: 'Ana López' })
    expect(result.status).toBe('event_not_found')
  })

  it('clamps partySize to 1 + maxCompanions', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'open', maxCompanions: 2, peopleCount: 0 })

    const result = await registerWalkInGuest(db, eventId, { name: 'Ana López', partySize: 10 })

    if (result.status !== 'success') throw new Error('expected success')
    const guest = await getGuestDoc(db, eventId, result.guestId)
    // partySize clampeado a 1 + maxCompanions (2) = 3 -> companions = 2.
    expect(guest?.companions).toBe(2)
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.peopleCount).toBe(3)
  })

  it('rejects registration when it would exceed capacity', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'open', attendeeLimitEnabled: true, capacity: 5, peopleCount: 5 })

    const result = await registerWalkInGuest(db, eventId, { name: 'Ana López' })

    expect(result.status).toBe('full')
  })

  it('counts active waitlist offers atomically against capacity (read inside the same transaction)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'open', attendeeLimitEnabled: true, capacity: 5, peopleCount: 4 })
    await seedWaitlistEntry(db, eventId, 'offer-1', { status: 'offered', partySize: 1 })

    // 1 lugar libre nominal, pero ya prometido a la oferta activa -> lleno.
    const result = await registerWalkInGuest(db, eventId, { name: 'Ana López' })

    expect(result.status).toBe('full')
  })

  it('allows registration when attendeeLimitEnabled is false, regardless of capacity', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'open', attendeeLimitEnabled: false, capacity: 1, peopleCount: 10 })

    const result = await registerWalkInGuest(db, eventId, { name: 'Ana López' })

    expect(result.status).toBe('success')
  })

  it('trusts only the verified authUid for guestUid, and resolves guestPhotoURL from the real profile', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'open' })
    await seedUserProfile(db, 'user-1', { photoURL: 'https://example.com/real.jpg' })

    const result = await registerWalkInGuest(db, eventId, { name: 'Ana López', authUid: 'user-1' })

    if (result.status !== 'success') throw new Error('expected success')
    const guest = await getGuestDoc(db, eventId, result.guestId)
    expect(guest?.guestUid).toBe('user-1')
    expect(guest?.guestPhotoURL).toBe('https://example.com/real.jpg')
  })

  it('rejects a customData with too many fields', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'open' })
    const customData: Record<string, string> = {}
    for (let i = 0; i < 31; i++) customData[`field-${i}`] = 'value'

    await expect(registerWalkInGuest(db, eventId, { name: 'Ana López', customData })).rejects.toThrow(
      'demasiados campos',
    )
  })

  it('rejects a customData value that is too long', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      entryMode: 'open',
      customFields: [{ id: 'field', label: 'Campo', type: 'text', required: false }],
    })

    await expect(
      registerWalkInGuest(db, eventId, { name: 'Ana López', customData: { field: 'x'.repeat(301) } }),
    ).rejects.toThrow('300 caracteres')
  })

  it('rejects a customData field id that does not correspond to this event', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      entryMode: 'open',
      customFields: [{ id: 'allergy', label: 'Alergias', type: 'text', required: false }],
    })

    await expect(
      registerWalkInGuest(db, eventId, { name: 'Ana López', customData: { injected: 'valor' } }),
    ).rejects.toThrow('no corresponde a este evento')
  })

  it('rejects registration missing a required custom field', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      entryMode: 'open',
      customFields: [{ id: 'tshirt', label: 'Talla de camiseta', type: 'text', required: true }],
    })

    await expect(registerWalkInGuest(db, eventId, { name: 'Ana López' })).rejects.toThrow('obligatorio')
  })

  it('rejects a select custom field value that is not one of the configured options', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      entryMode: 'open',
      customFields: [
        {
          id: 'menu',
          label: 'Menú',
          type: 'select',
          required: true,
          options: [{ id: 'veg', label: 'Vegetariano' }, { id: 'meat', label: 'Con carne' }],
        },
      ],
    })

    await expect(
      registerWalkInGuest(db, eventId, { name: 'Ana López', customData: { menu: 'fake-option' } }),
    ).rejects.toThrow('no es una opción válida')
  })

  it('accepts a valid select custom field value and stores the option id', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      entryMode: 'open',
      customFields: [
        {
          id: 'menu',
          label: 'Menú',
          type: 'select',
          required: true,
          options: [{ id: 'veg', label: 'Vegetariano' }, { id: 'meat', label: 'Con carne' }],
        },
      ],
    })

    const result = await registerWalkInGuest(db, eventId, { name: 'Ana López', customData: { menu: 'veg' } })

    if (result.status !== 'success') throw new Error('expected success')
    const guest = await getGuestDoc(db, eventId, result.guestId)
    expect(guest?.customData).toEqual({ menu: 'veg' })
  })

  it('rejects a partySize that is not a real number (payload manipulado)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'open' })

    await expect(
      registerWalkInGuest(db, eventId, { name: 'Ana López', partySize: 'muchos' as unknown as number }),
    ).rejects.toThrow('cantidad de personas')
    const event = await db.collection('events').doc(eventId).get()
    // El evento no debe quedar contaminado con NaN.
    expect(Number.isFinite(event.data()?.peopleCount)).toBe(true)
  })

  it('rejects a paymentMethod that is not enabled for this event', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'open', requiresPayment: true, paymentMethods: ['transfer'] })

    await expect(
      registerWalkInGuest(db, eventId, { name: 'Ana López', paymentMethod: 'cash' }),
    ).rejects.toThrow('método de pago')
  })

  it('auto-selects the single enabled paymentMethod when the client sends none', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'open', requiresPayment: true, paymentMethods: ['cash'] })

    const result = await registerWalkInGuest(db, eventId, { name: 'Ana López' })

    if (result.status !== 'success') throw new Error('expected success')
    const guest = await getGuestDoc(db, eventId, result.guestId)
    expect(guest?.paymentMethod).toBe('cash')
  })

  it('rejects a party size that would exceed capacity even with some room left', async () => {
    // Queda 1 lugar (199/200) pero pide traer 1 acompañante (partySize 2) —
    // no entra, aunque el evento no esté técnicamente lleno todavía.
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      entryMode: 'open', attendeeLimitEnabled: true, capacity: 200, peopleCount: 199, maxCompanions: 5,
    })

    const result = await registerWalkInGuest(db, eventId, { name: 'Con Acompañante', partySize: 2 })

    expect(result.status).toBe('full')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.peopleCount).toBe(199)
  })

  it('never lets two simultaneous registrations for the last spot both succeed', async () => {
    // Firestore reintenta automáticamente la transacción que pierde el
    // conflicto de versión — ver CAPACITY_LIMIT_ARCHITECTURE.md §7.
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'open', attendeeLimitEnabled: true, capacity: 200, peopleCount: 199 })

    const results = await Promise.all([
      registerWalkInGuest(db, eventId, { name: 'Carrera A' }),
      registerWalkInGuest(db, eventId, { name: 'Carrera B' }),
    ])

    const succeeded = results.filter((r) => r.status === 'success')
    const full = results.filter((r) => r.status === 'full')
    expect(succeeded).toHaveLength(1)
    expect(full).toHaveLength(1)

    const event = await db.collection('events').doc(eventId).get()
    // Nunca 201/200 — exactamente uno de los dos registros ganó la carrera.
    expect(event.data()?.peopleCount).toBe(200)
  })

  it('falls back to the legacy limit (party of 10) when the event has no maxCompanions configured', async () => {
    // seedEvent no incluye maxCompanions por defecto -> mismo escenario que
    // un evento anterior a que existiera el campo.
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'open', peopleCount: 0 })

    const result = await registerWalkInGuest(db, eventId, { name: 'Sin Límite Configurado', partySize: 4 })

    expect(result.status).toBe('success')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.peopleCount).toBe(4)
  })

  it('clamps the party size to 10 on a legacy event without maxCompanions', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'open', peopleCount: 0 })

    const result = await registerWalkInGuest(db, eventId, { name: 'Grupo Legacy', partySize: 15 })

    expect(result.status).toBe('success')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.peopleCount).toBe(10)
  })

  it('still allows no companions when maxCompanions is explicitly 0', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'open', peopleCount: 0, maxCompanions: 0 })

    const result = await registerWalkInGuest(db, eventId, { name: 'Sin Acompañantes', partySize: 4 })

    expect(result.status).toBe('success')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.peopleCount).toBe(1)
  })

  it('registers by transfer or cash without any hold/expiry (no more apartado temporal)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'open', requiresPayment: true, paymentMethods: ['transfer', 'cash'] })

    const result = await registerWalkInGuest(db, eventId, { name: 'Transferencia', paymentMethod: 'transfer' })

    if (result.status !== 'success') throw new Error('expected success')
    const guest = await getGuestDoc(db, eventId, result.guestId)
    expect(guest?.paymentStatus).toBe('unpaid')
    expect(guest?.paymentMethod).toBe('transfer')
    expect(guest?.holdExpiresAt).toBeNull()
  })

  it('self-registers a full party of 21 when the event allows the maximum 20 companions', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'open', peopleCount: 0, maxCompanions: 20, attendeeLimitEnabled: false })

    const result = await registerWalkInGuest(db, eventId, { name: 'Grupo Grande', partySize: 21 })

    expect(result.status).toBe('success')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.peopleCount).toBe(21)
  })

  // Regresión del "Missing or insufficient permissions" del auto-registro en
  // rules (ya no aplica del lado servidor, pero el mismo fallback de datos
  // sigue siendo necesario): eventos creados antes de que existiera
  // peopleCount no tienen ese campo.
  it('self-registers on a legacy event that has no peopleCount field, backfilling it from guestCount', async () => {
    const eventId = uniqueId('event')
    await db.collection('events').doc(eventId).set({
      ownerId: 'owner-uid', entryMode: 'open', guestCount: 3,
    })

    const result = await registerWalkInGuest(db, eventId, { name: 'Invitado Legacy' })

    expect(result.status).toBe('success')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.guestCount).toBe(4)
    expect(event.data()?.peopleCount).toBe(4)
  })

  it('leaves guestUid and guestPhotoURL null when registering without a session', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'open' })

    const result = await registerWalkInGuest(db, eventId, { name: 'Sin Cuenta' })

    if (result.status !== 'success') throw new Error('expected success')
    const guest = await getGuestDoc(db, eventId, result.guestId)
    expect(guest?.guestUid).toBeNull()
    expect(guest?.guestPhotoURL).toBeNull()
  })

  // Regresión: cuenta autenticada SIN documento users/{uid} (p.ej. login con
  // Google sin completar el perfil) — antes, el get() de la regla sobre un
  // documento inexistente denegaba el registro; acá userSnap.data() es
  // simplemente undefined y guestPhotoURL cae a null sin lanzar.
  it('lets a logged-in user without a users/{uid} document self-register', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'open' })

    const result = await registerWalkInGuest(db, eventId, { name: 'Sin Perfil', authUid: 'user-sin-perfil' })

    if (result.status !== 'success') throw new Error('expected success')
    const guest = await getGuestDoc(db, eventId, result.guestId)
    expect(guest?.guestUid).toBe('user-sin-perfil')
    expect(guest?.guestPhotoURL).toBeNull()
  })
})
