import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { createCsvImportJob } from '../csvImport/createJob.js'

vi.mock('../csvImport/queue.js', () => ({ enqueueCsvImportChunk: vi.fn().mockResolvedValue(undefined) }))

const { cancelCsvImportJob } = await import('./cancelCsvImportJob.js')

const OWNER_UID = 'owner-uid'

describe('cancelCsvImportJob', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('cancels a pending import job', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    const { jobId } = await createCsvImportJob(db, { eventId, uid: OWNER_UID, uidEmail: null, fileName: '', rows: [{ name: 'Ana' }] })

    const result = await cancelCsvImportJob.run(fakeCallableRequest({ eventId, jobId }, OWNER_UID))

    expect(result).toEqual({ ok: true })
    const jobSnap = await db.collection('events').doc(eventId).collection('csvImportJobs').doc(jobId).get()
    expect(jobSnap.data()?.status).toBe('cancelled')
  })

  it('rejects a caller without addGuests permission', async () => {
    const COORG_UID = 'coorg-noadd-uid'
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      ownerId: OWNER_UID,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: { [COORG_UID]: { addGuests: false } },
    })
    const { jobId } = await createCsvImportJob(db, { eventId, uid: OWNER_UID, uidEmail: null, fileName: '', rows: [{ name: 'Ana' }] })

    await expect(
      cancelCsvImportJob.run(fakeCallableRequest({ eventId, jobId }, COORG_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects an unauthenticated caller', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await expect(
      cancelCsvImportJob.run(fakeCallableRequest({ eventId, jobId: 'whatever' })),
    ).rejects.toThrow(HttpsError)
  })

  it('surfaces a failed-precondition error for a job that already finished', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    const { jobId } = await createCsvImportJob(db, { eventId, uid: OWNER_UID, uidEmail: null, fileName: '', rows: [{ name: 'Ana' }] })
    await db.collection('events').doc(eventId).collection('csvImportJobs').doc(jobId).update({ status: 'completed' })

    await expect(
      cancelCsvImportJob.run(fakeCallableRequest({ eventId, jobId }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })
})
