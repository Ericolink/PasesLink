import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, uniqueId } from '../__tests__/helpers.js'
import { createCsvImportJob, CsvImportValidationError } from './createJob.js'
import { MAX_ROWS_PER_IMPORT, ROWS_PER_CHUNK } from './config.js'

describe('createCsvImportJob', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('creates the job doc pending, with its cursor and counters at zero', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)

    const { jobId } = await createCsvImportJob(db, {
      eventId, uid: 'owner-uid', uidEmail: 'owner@test.com', fileName: 'invitados.csv',
      rows: [{ name: 'Ana' }, { name: 'Beto' }],
    })

    const jobSnap = await db.collection('events').doc(eventId).collection('csvImportJobs').doc(jobId).get()
    expect(jobSnap.data()).toMatchObject({
      eventId,
      createdBy: 'owner-uid',
      createdByEmail: 'owner@test.com',
      fileName: 'invitados.csv',
      status: 'pending',
      totalRows: 2,
      totalChunks: 1,
      nextChunkIndex: 0,
      processedRows: 0,
      successCount: 0,
      failedCount: 0,
      progressPercent: 0,
    })
  })

  it('splits rows into chunks of ROWS_PER_CHUNK, preserving row order', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    const rows = Array.from({ length: ROWS_PER_CHUNK + 5 }, (_, i) => ({ name: `Invitado ${i}` }))

    const { jobId } = await createCsvImportJob(db, { eventId, uid: 'owner-uid', uidEmail: null, fileName: 'grande.csv', rows })

    const jobRef = db.collection('events').doc(eventId).collection('csvImportJobs').doc(jobId)
    expect((await jobRef.get()).data()?.totalChunks).toBe(2)
    const chunk0 = await jobRef.collection('chunks').doc('0').get()
    const chunk1 = await jobRef.collection('chunks').doc('1').get()
    expect(chunk0.data()?.rows).toHaveLength(ROWS_PER_CHUNK)
    expect(chunk1.data()?.rows).toHaveLength(5)
    expect(chunk0.data()?.rows[0]).toEqual({ name: 'Invitado 0' })
    expect(chunk1.data()?.rows[0]).toEqual({ name: `Invitado ${ROWS_PER_CHUNK}` })
    expect(chunk0.data()?.status).toBe('pending')
  })

  it('rejects an empty rows array', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    await expect(
      createCsvImportJob(db, { eventId, uid: 'owner-uid', uidEmail: null, fileName: '', rows: [] }),
    ).rejects.toThrow(CsvImportValidationError)
  })

  it('rejects a file over MAX_ROWS_PER_IMPORT', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    const rows = Array.from({ length: MAX_ROWS_PER_IMPORT + 1 }, (_, i) => ({ name: `Invitado ${i}` }))
    await expect(
      createCsvImportJob(db, { eventId, uid: 'owner-uid', uidEmail: null, fileName: '', rows }),
    ).rejects.toThrow(CsvImportValidationError)
  })
})
