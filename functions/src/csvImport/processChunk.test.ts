import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, uniqueId } from '../__tests__/helpers.js'
import { createCsvImportJob } from './createJob.js'
import { markCsvImportJobFailed, runCsvImportChunk } from './processChunk.js'
import type { Logger } from '../lib/observability/logger.js'

function fakeLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

async function jobRefFor(db: Firestore, eventId: string, jobId: string) {
  return db.collection('events').doc(eventId).collection('csvImportJobs').doc(jobId)
}

describe('runCsvImportChunk', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('creates guest + contact docs from a single chunk and marks the job completed', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { guestCount: 0, peopleCount: 0 })
    const { jobId } = await createCsvImportJob(db, {
      eventId, uid: 'owner-uid', uidEmail: null, fileName: 'a.csv',
      rows: [
        { name: 'Juan', lastName: 'Pérez', phone: '11-2222-3333', email: 'juan@test.com' },
        { name: 'María', lastName: 'López' },
      ],
    })

    const outcome = await runCsvImportChunk(db, eventId, jobId, 0, fakeLogger())

    expect(outcome).toEqual({ nextChunkIndex: null })
    const jobSnap = await (await jobRefFor(db, eventId, jobId)).get()
    expect(jobSnap.data()).toMatchObject({
      status: 'completed', processedRows: 2, successCount: 2, failedCount: 0, progressPercent: 100, nextChunkIndex: 1,
    })
    expect(jobSnap.data()?.startedAt).not.toBeNull()
    expect(jobSnap.data()?.completedAt).not.toBeNull()

    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.guestCount).toBe(2)
  })

  it('chains to the next chunk without finishing the job when more chunks remain', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { attendeeLimitEnabled: false })
    const rows = Array.from({ length: 205 }, (_, i) => ({ name: `Invitado ${i}` })) // 2 chunks (200 + 5)
    const { jobId } = await createCsvImportJob(db, { eventId, uid: 'owner-uid', uidEmail: null, fileName: '', rows })

    const outcome = await runCsvImportChunk(db, eventId, jobId, 0, fakeLogger())

    expect(outcome).toEqual({ nextChunkIndex: 1 })
    const jobSnap = await (await jobRefFor(db, eventId, jobId)).get()
    expect(jobSnap.data()).toMatchObject({ status: 'processing', processedRows: 200, successCount: 200, nextChunkIndex: 1 })
    expect(jobSnap.data()?.completedAt).toBeNull()
  })

  it('rejects an invalid row but keeps processing the rest of the chunk (completed_with_errors)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    const { jobId } = await createCsvImportJob(db, {
      eventId, uid: 'owner-uid', uidEmail: null, fileName: '',
      rows: [{ name: 'Ana', email: 'not-an-email' }, { name: 'Beto' }],
    })

    await runCsvImportChunk(db, eventId, jobId, 0, fakeLogger())

    const jobSnap = await (await jobRefFor(db, eventId, jobId)).get()
    expect(jobSnap.data()).toMatchObject({ status: 'completed_with_errors', successCount: 1, failedCount: 1 })
    const chunkSnap = await (await jobRefFor(db, eventId, jobId)).collection('chunks').doc('0').get()
    expect(chunkSnap.data()?.rejectedSamples).toEqual([{ name: 'Ana', reason: 'El email no tiene un formato válido.' }])
  })

  it('reports capacity-full skips as rejected rows (completed_with_errors)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 1, guestCount: 0, peopleCount: 0 })
    const { jobId } = await createCsvImportJob(db, {
      eventId, uid: 'owner-uid', uidEmail: null, fileName: '',
      rows: [{ name: 'Ana' }, { name: 'Beto' }],
    })

    await runCsvImportChunk(db, eventId, jobId, 0, fakeLogger())

    const jobSnap = await (await jobRefFor(db, eventId, jobId)).get()
    expect(jobSnap.data()).toMatchObject({ status: 'completed_with_errors', successCount: 1, failedCount: 1 })
  })

  it('is a safe no-op on a duplicate delivery of an already-advanced chunk (no duplicate guests)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { guestCount: 0, peopleCount: 0 })
    const { jobId } = await createCsvImportJob(db, { eventId, uid: 'owner-uid', uidEmail: null, fileName: '', rows: [{ name: 'Ana' }] })

    await runCsvImportChunk(db, eventId, jobId, 0, fakeLogger())
    const secondOutcome = await runCsvImportChunk(db, eventId, jobId, 0, fakeLogger())

    expect(secondOutcome).toEqual({ nextChunkIndex: null })
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.guestCount).toBe(1)
  })

  it('discards a chunk from a cancelled job without creating guests', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { guestCount: 0 })
    const { jobId } = await createCsvImportJob(db, { eventId, uid: 'owner-uid', uidEmail: null, fileName: '', rows: [{ name: 'Ana' }] })
    const jobRef = await jobRefFor(db, eventId, jobId)
    await jobRef.update({ status: 'cancelled' })

    const outcome = await runCsvImportChunk(db, eventId, jobId, 0, fakeLogger())

    expect(outcome).toEqual({ nextChunkIndex: null })
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.guestCount).toBe(0)
  })
})

describe('markCsvImportJobFailed', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('marks the job failed with the error message and a completion timestamp', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    const { jobId } = await createCsvImportJob(db, { eventId, uid: 'owner-uid', uidEmail: null, fileName: '', rows: [{ name: 'Ana' }] })

    await markCsvImportJobFailed(db, eventId, jobId, 'timeout de red')

    const jobSnap = await (await jobRefFor(db, eventId, jobId)).get()
    expect(jobSnap.data()).toMatchObject({ status: 'failed', errorMessage: 'timeout de red' })
    expect(jobSnap.data()?.completedAt).not.toBeNull()
  })
})
