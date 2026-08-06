import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, uniqueId } from '../__tests__/helpers.js'
import { createCsvImportJob } from './createJob.js'
import { cancelCsvImportJob, CsvImportCancelError } from './cancelJob.js'

describe('cancelCsvImportJob', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('cancels a pending job', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    const { jobId } = await createCsvImportJob(db, { eventId, uid: 'owner-uid', uidEmail: null, fileName: '', rows: [{ name: 'Ana' }] })

    await cancelCsvImportJob(db, eventId, jobId)

    const jobSnap = await db.collection('events').doc(eventId).collection('csvImportJobs').doc(jobId).get()
    expect(jobSnap.data()?.status).toBe('cancelled')
    expect(jobSnap.data()?.completedAt).not.toBeNull()
  })

  it('cancels a processing job', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    const { jobId } = await createCsvImportJob(db, { eventId, uid: 'owner-uid', uidEmail: null, fileName: '', rows: [{ name: 'Ana' }] })
    const jobRef = db.collection('events').doc(eventId).collection('csvImportJobs').doc(jobId)
    await jobRef.update({ status: 'processing' })

    await cancelCsvImportJob(db, eventId, jobId)

    expect((await jobRef.get()).data()?.status).toBe('cancelled')
  })

  it('rejects cancelling a job that already finished', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    const { jobId } = await createCsvImportJob(db, { eventId, uid: 'owner-uid', uidEmail: null, fileName: '', rows: [{ name: 'Ana' }] })
    const jobRef = db.collection('events').doc(eventId).collection('csvImportJobs').doc(jobId)
    await jobRef.update({ status: 'completed' })

    await expect(cancelCsvImportJob(db, eventId, jobId)).rejects.toThrow(CsvImportCancelError)
    expect((await jobRef.get()).data()?.status).toBe('completed')
  })

  it('rejects cancelling a job that does not exist', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    await expect(cancelCsvImportJob(db, eventId, 'no-existe')).rejects.toThrow(CsvImportCancelError)
  })
})
