import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ObservabilityContext } from '../lib/observability/withObservability.js'

const promiseMock = vi.fn()
const exportDocumentsMock = vi.fn()
const getProjectIdMock = vi.fn().mockResolvedValue('app-pases-9e6e7')
const databasePathMock = vi.fn((project: string, database: string) => `projects/${project}/databases/${database}`)

vi.mock('firebase-admin/firestore', () => ({
  v1: {
    FirestoreAdminClient: vi.fn().mockImplementation(function FirestoreAdminClient() {
      return {
        exportDocuments: exportDocumentsMock,
        getProjectId: getProjectIdMock,
        databasePath: databasePathMock,
      }
    }),
  },
}))

const getFilesMock = vi.fn()
const saveMock = vi.fn().mockResolvedValue(undefined)
const fileMock = vi.fn(() => ({ save: saveMock }))
const bucketMock = vi.fn(() => ({ getFiles: getFilesMock, file: fileMock }))

vi.mock('firebase-admin/storage', () => ({
  getStorage: vi.fn(() => ({ bucket: bucketMock })),
}))

const { runFirestoreExport } = await import('./exportFirestore.js')

function fakeCtx(): ObservabilityContext & { logger: { info: ReturnType<typeof vi.fn> } } {
  return {
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    addContext: vi.fn(),
  }
}

describe('runFirestoreExport', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-02T09:00:00.000Z'))
    exportDocumentsMock.mockReset().mockResolvedValue([
      { name: 'operations/op-1', promise: promiseMock },
    ])
    promiseMock.mockReset().mockResolvedValue([{ outputUriPrefix: 'gs://app-pases-9e6e7-firestore-backups/firestore-backups/daily/2026-08-02T09-00-00-000Z' }])
    getFilesMock.mockReset().mockResolvedValue([[
      { metadata: { size: '1000' } },
      { metadata: { size: '500' } },
    ]])
    saveMock.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('exporta la base completa (todas las colecciones) al prefijo del nivel y timestamp correctos', async () => {
    const ctx = fakeCtx()
    await runFirestoreExport('daily', ctx)

    expect(databasePathMock).toHaveBeenCalledWith('app-pases-9e6e7', '(default)')
    expect(exportDocumentsMock).toHaveBeenCalledWith({
      name: 'projects/app-pases-9e6e7/databases/(default)',
      outputUriPrefix: 'gs://app-pases-9e6e7-firestore-backups/firestore-backups/daily/2026-08-02T09-00-00-000Z',
      collectionIds: [],
    })
  })

  it('espera a que termine la operación (LRO) antes de continuar', async () => {
    const ctx = fakeCtx()
    await runFirestoreExport('weekly', ctx)
    expect(promiseMock).toHaveBeenCalled()
  })

  it('calcula el tamaño aproximado sumando los objetos escritos bajo el prefijo del backup', async () => {
    const ctx = fakeCtx()
    await runFirestoreExport('monthly', ctx)

    expect(getFilesMock).toHaveBeenCalledWith({ prefix: 'firestore-backups/monthly/2026-08-02T09-00-00-000Z' })
    expect(ctx.addContext).toHaveBeenCalledWith(expect.objectContaining({ approxSizeBytes: 1500 }))
  })

  it('escribe un metadata.json con éxito:true, tier, timestamp y tamaño', async () => {
    const ctx = fakeCtx()
    await runFirestoreExport('daily', ctx)

    expect(fileMock).toHaveBeenCalledWith('firestore-backups/metadata/daily/2026-08-02T09-00-00-000Z.json')
    expect(saveMock).toHaveBeenCalledTimes(1)
    const written = JSON.parse(saveMock.mock.calls[0][0] as string)
    expect(written).toMatchObject({ tier: 'daily', success: true, approxSizeBytes: 1500 })
  })

  it('propaga el error si exportDocuments falla, sin escribir metadata', async () => {
    const ctx = fakeCtx()
    const failure = new Error('permiso denegado')
    exportDocumentsMock.mockRejectedValueOnce(failure)

    await expect(runFirestoreExport('daily', ctx)).rejects.toBe(failure)
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('propaga el error si la operación falla durante el export, sin escribir metadata', async () => {
    const ctx = fakeCtx()
    const failure = new Error('export interrumpido')
    promiseMock.mockRejectedValueOnce(failure)

    await expect(runFirestoreExport('weekly', ctx)).rejects.toBe(failure)
    expect(saveMock).not.toHaveBeenCalled()
  })
})
