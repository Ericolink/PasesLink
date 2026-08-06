import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { MAX_ROWS_PER_IMPORT } from '../csvImport/config.js'

const enqueueCsvImportChunkMock = vi.fn().mockResolvedValue(undefined)
vi.mock('../csvImport/queue.js', () => ({
  enqueueCsvImportChunk: (...args: unknown[]) => enqueueCsvImportChunkMock(...args),
}))

const { startCsvImport } = await import('./startCsvImport.js')

const OWNER_UID = 'owner-uid'

describe('startCsvImport', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
    enqueueCsvImportChunkMock.mockClear()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('creates the job + chunks and enqueues chunk 0', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    const result = await startCsvImport.run(fakeCallableRequest({
      eventId, fileName: 'invitados.csv', rows: [{ name: 'Ana' }, { name: 'Beto' }],
    }, OWNER_UID))

    expect(result.jobId).toBeTruthy()
    expect(enqueueCsvImportChunkMock).toHaveBeenCalledWith({ eventId, jobId: result.jobId, chunkIndex: 0 })
    const jobSnap = await db.collection('events').doc(eventId).collection('csvImportJobs').doc(result.jobId).get()
    expect(jobSnap.data()).toMatchObject({ status: 'pending', totalRows: 2 })
  })

  it('lets a co-organizer with addGuests import rows', async () => {
    const COORG_UID = 'coorg-csv-uid'
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      ownerId: OWNER_UID,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: { [COORG_UID]: { addGuests: true } },
    })

    const result = await startCsvImport.run(fakeCallableRequest({ eventId, rows: [{ name: 'Ana' }] }, COORG_UID))
    expect(result.jobId).toBeTruthy()
  })

  it('rejects a caller without addGuests permission', async () => {
    const COORG_UID = 'coorg-noadd-uid'
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      ownerId: OWNER_UID,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: { [COORG_UID]: { addGuests: false } },
    })

    await expect(
      startCsvImport.run(fakeCallableRequest({ eventId, rows: [{ name: 'Ana' }] }, COORG_UID)),
    ).rejects.toThrow(HttpsError)
    expect(enqueueCsvImportChunkMock).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await expect(
      startCsvImport.run(fakeCallableRequest({ eventId, rows: [{ name: 'Ana' }] })),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects an empty rows array', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await expect(
      startCsvImport.run(fakeCallableRequest({ eventId, rows: [] }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a file over MAX_ROWS_PER_IMPORT', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    const rows = Array.from({ length: MAX_ROWS_PER_IMPORT + 1 }, (_, i) => ({ name: `Invitado ${i}` }))
    await expect(
      startCsvImport.run(fakeCallableRequest({ eventId, rows }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
    expect(enqueueCsvImportChunkMock).not.toHaveBeenCalled()
  })

  it('rejects an event that does not exist', async () => {
    await expect(
      startCsvImport.run(fakeCallableRequest({ eventId: 'no-existe', rows: [{ name: 'Ana' }] }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })
})
