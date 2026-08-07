import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, uniqueId } from '../__tests__/helpers.js'
import { recordFirstEventForFunnel } from './onEventCreated.js'

describe('recordFirstEventForFunnel', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('increments usersWithEventsCount on a user\'s first event', async () => {
    const uid = uniqueId('user')
    const eventId = uniqueId('event')

    await recordFirstEventForFunnel(db, uid, eventId)

    const funnelSnap = await db.doc('platformStats/funnel').get()
    expect(funnelSnap.data()?.usersWithEventsCount).toBe(1)

    const markerSnap = await db.doc(`platformStats/funnelMarkers/users/${uid}`).get()
    expect(markerSnap.data()?.firstEventId).toBe(eventId)
  })

  it('does not increment again for a second event by the same user', async () => {
    const uid = uniqueId('user')

    await recordFirstEventForFunnel(db, uid, uniqueId('event'))
    await recordFirstEventForFunnel(db, uid, uniqueId('event'))

    const funnelSnap = await db.doc('platformStats/funnel').get()
    expect(funnelSnap.data()?.usersWithEventsCount).toBe(1)
  })

  it('increments once per distinct user, even with concurrent first events', async () => {
    const uidA = uniqueId('user')
    const uidB = uniqueId('user')

    await Promise.all([
      recordFirstEventForFunnel(db, uidA, uniqueId('event')),
      recordFirstEventForFunnel(db, uidB, uniqueId('event')),
      // Carrera simulada: dos "primeros eventos" del mismo uid en paralelo —
      // el .create() del marcador solo deja pasar a uno.
      recordFirstEventForFunnel(db, uidA, uniqueId('event')),
    ])

    const funnelSnap = await db.doc('platformStats/funnel').get()
    expect(funnelSnap.data()?.usersWithEventsCount).toBe(2)
  })
})
