import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedUserProfile, uniqueId } from '../__tests__/helpers.js'
import { processQueuedNotification } from './onNotificationQueued.js'

describe('processQueuedNotification', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('marks as sent as a no-op when the recipient has no fcmTokens', async () => {
    const eventId = uniqueId('event')
    const notifId = uniqueId('notif')
    const uid = uniqueId('user')
    await seedUserProfile(db, uid, { fcmTokens: [] })
    const notifRef = db.collection('events').doc(eventId).collection('notificationQueue').doc(notifId)
    await notifRef.set({ type: 'rsvp_new', recipientUid: uid, channels: ['push'], status: 'queued' })

    await processQueuedNotification(db, notifRef, { type: 'rsvp_new', recipientUid: uid, channels: ['push'] })

    const notifSnap = await notifRef.get()
    expect(notifSnap.data()?.status).toBe('sent')

    const logSnap = await db.collection('events').doc(eventId).collection('sendLog').doc(`${notifId}_push`).get()
    expect(logSnap.exists).toBe(true)
    expect(logSnap.data()?.status).toBe('sent')
  })

  it('skips the push channel entirely when it is not in channels', async () => {
    const eventId = uniqueId('event')
    const notifId = uniqueId('notif')
    const uid = uniqueId('user')
    const notifRef = db.collection('events').doc(eventId).collection('notificationQueue').doc(notifId)
    await notifRef.set({ type: 'event_updated', recipientUid: uid, channels: ['email'], status: 'queued' })

    await processQueuedNotification(db, notifRef, { type: 'event_updated', recipientUid: uid, channels: ['email'] })

    const notifSnap = await notifRef.get()
    expect(notifSnap.data()?.status).toBe('sent')
  })

  it('logs the attempt and fails cleanly when FCM cannot be reached (no real credentials in the test env)', async () => {
    const eventId = uniqueId('event')
    const notifId = uniqueId('notif')
    const uid = uniqueId('user')
    await seedUserProfile(db, uid, { fcmTokens: ['fake-token'] })
    const notifRef = db.collection('events').doc(eventId).collection('notificationQueue').doc(notifId)
    await notifRef.set({ type: 'payment_confirmed', recipientUid: uid, channels: ['push'], status: 'queued' })

    await expect(
      processQueuedNotification(db, notifRef, { type: 'payment_confirmed', recipientUid: uid, channels: ['push'] }),
    ).resolves.toBeUndefined()

    const notifSnap = await notifRef.get()
    expect(notifSnap.data()?.status).toBe('failed')
  })

  it('handles a malformed notification (no payload/channels, unknown recipient) without throwing', async () => {
    const eventId = uniqueId('event')
    const notifId = uniqueId('notif')
    const uid = uniqueId('user') // nunca se crea el doc de usuario
    const notifRef = db.collection('events').doc(eventId).collection('notificationQueue').doc(notifId)
    await notifRef.set({ type: 'rsvp_new', recipientUid: uid, status: 'queued' })

    await expect(
      processQueuedNotification(db, notifRef, { type: 'rsvp_new', recipientUid: uid }),
    ).resolves.toBeUndefined()

    const notifSnap = await notifRef.get()
    expect(notifSnap.data()?.status).toBe('sent')
  })

  it('never processes twice for the same notification (dedup vía sendLog.create())', async () => {
    const eventId = uniqueId('event')
    const notifId = uniqueId('notif')
    const uid = uniqueId('user')
    await seedUserProfile(db, uid, { fcmTokens: [] })
    const notifRef = db.collection('events').doc(eventId).collection('notificationQueue').doc(notifId)
    await notifRef.set({ type: 'rsvp_new', recipientUid: uid, channels: ['push'], status: 'queued' })
    const notif = { type: 'rsvp_new', recipientUid: uid, channels: ['push'] }

    await processQueuedNotification(db, notifRef, notif)
    await notifRef.update({ status: 'queued' }) // simula un reintento at-least-once del trigger
    await processQueuedNotification(db, notifRef, notif)

    const logSnap = await db.collection('events').doc(eventId).collection('sendLog').doc(`${notifId}_push`).get()
    expect(logSnap.data()?.status).toBe('sent')
    // El segundo llamado chocó contra el .create() y volvió sin tocar el
    // doc de notificación — quedó en 'queued' (el estado que le puso el
    // "reintento" simulado arriba), no en 'sent' de nuevo.
    const notifSnap = await notifRef.get()
    expect(notifSnap.data()?.status).toBe('queued')
  })
})
