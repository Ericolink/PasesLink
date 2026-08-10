import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, seedGuest, seedUserProfile, uniqueId } from '../__tests__/helpers.js'
import { deleteAccountData } from './deleteAccountData.js'

describe('deleteAccountData', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('elimina en cascada los eventos propios, incluidas sus subcolecciones', async () => {
    const uid = uniqueId('uid')
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: uid })
    await seedGuest(db, eventId, 'guest-1')

    const result = await deleteAccountData(db, uid)

    expect(result.ownedEventsDeleted).toBe(1)
    const eventSnap = await db.collection('events').doc(eventId).get()
    expect(eventSnap.exists).toBe(false)
    const guestSnap = await db.collection('events').doc(eventId).collection('guests').doc('guest-1').get()
    expect(guestSnap.exists).toBe(false)
  })

  it('no toca eventos ni invitados de otros usuarios', async () => {
    const uid = uniqueId('uid')
    const otherEventId = uniqueId('event')
    await seedEvent(db, otherEventId, { ownerId: 'someone-else' })
    await seedGuest(db, otherEventId, 'guest-1')

    await deleteAccountData(db, uid)

    const eventSnap = await db.collection('events').doc(otherEventId).get()
    expect(eventSnap.exists).toBe(true)
    const guestSnap = await db.collection('events').doc(otherEventId).collection('guests').doc('guest-1').get()
    expect(guestSnap.exists).toBe(true)
  })

  it('desvincula (no borra) su entrada de co-organizador en eventos ajenos', async () => {
    const uid = uniqueId('uid')
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      ownerId: 'someone-else',
      coOrganizersMap: { [uid]: 'test@example.com' },
      coOrganizerPermissions: { [uid]: { manageGuests: true } },
    })

    const result = await deleteAccountData(db, uid)

    expect(result.coOrganizationsRemoved).toBe(1)
    const eventSnap = await db.collection('events').doc(eventId).get()
    expect(eventSnap.exists).toBe(true)
    const data = eventSnap.data()!
    expect(data.coOrganizersMap).toEqual({})
    expect(data.coOrganizerPermissions).toEqual({})
  })

  it('desvincula guestUid en invitaciones de eventos ajenos sin borrar el invitado', async () => {
    const uid = uniqueId('uid')
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: 'someone-else' })
    await seedGuest(db, eventId, 'guest-1', { guestUid: uid })

    const result = await deleteAccountData(db, uid)

    expect(result.guestLinksUnlinked).toBe(1)
    const guestSnap = await db.collection('events').doc(eventId).collection('guests').doc('guest-1').get()
    expect(guestSnap.exists).toBe(true)
    expect(guestSnap.data()!.guestUid).toBeNull()
  })

  it('elimina admins/{uid} si existe', async () => {
    const uid = uniqueId('uid')
    await db.collection('admins').doc(uid).set({})

    await deleteAccountData(db, uid)

    const adminSnap = await db.collection('admins').doc(uid).get()
    expect(adminSnap.exists).toBe(false)
  })

  it('elimina users/{uid} y sus subcolecciones', async () => {
    const uid = uniqueId('uid')
    await seedUserProfile(db, uid, { email: 'test@example.com' })
    await db.collection('users').doc(uid).collection('invitations').doc('inv-1').set({ eventId: 'x' })

    await deleteAccountData(db, uid)

    const userSnap = await db.collection('users').doc(uid).get()
    expect(userSnap.exists).toBe(false)
    const invSnap = await db.collection('users').doc(uid).collection('invitations').doc('inv-1').get()
    expect(invSnap.exists).toBe(false)
  })
})
