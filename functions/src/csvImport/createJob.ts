// Arranque de una importación CSV asíncrona: persiste el job + sus filas ya
// troceadas en chunks (events/{eventId}/csvImportJobs/{jobId}/chunks/{n}) y
// devuelve el jobId — el procesamiento pesado (validar cada fila,
// createGuestsWithCapacity) NUNCA corre acá, ver processChunk.ts. Guardar
// las filas en Firestore desde este primer paso (en vez de pasarlas de
// tarea en tarea) es lo que deja la estructura preparada para una futura
// reanudación: cualquier chunk puede reprocesarse sin pedirle al organizador
// que vuelva a subir el archivo.
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { MAX_ROWS_PER_IMPORT, ROWS_PER_CHUNK } from './config.js'
import type { CsvImportRowInput } from './types.js'

export class CsvImportValidationError extends Error {}

export interface CreateCsvImportJobInput {
  eventId: string
  uid: string
  uidEmail: string | null
  fileName: string
  rows: CsvImportRowInput[]
}

export interface CreateCsvImportJobResult {
  jobId: string
}

export async function createCsvImportJob(db: Firestore, input: CreateCsvImportJobInput): Promise<CreateCsvImportJobResult> {
  const { eventId, uid, uidEmail, fileName, rows } = input
  if (rows.length === 0) {
    throw new CsvImportValidationError('El archivo no tiene invitados para importar.')
  }
  if (rows.length > MAX_ROWS_PER_IMPORT) {
    throw new CsvImportValidationError(`El archivo supera el máximo de ${MAX_ROWS_PER_IMPORT} invitados por importación.`)
  }

  const jobRef = db.collection('events').doc(eventId).collection('csvImportJobs').doc()
  const chunksCol = jobRef.collection('chunks')
  const totalChunks = Math.ceil(rows.length / ROWS_PER_CHUNK)

  // Un solo batch (job + hasta 25 chunks con MAX_ROWS_PER_IMPORT/ROWS_PER_CHUNK
  // actuales, muy por debajo del límite de 500 escrituras de un batch): el
  // job nunca queda visible a medio crear.
  const batch = db.batch()
  batch.set(jobRef, {
    eventId,
    createdBy: uid,
    createdByEmail: uidEmail,
    fileName: fileName ? fileName.slice(0, 200) : 'importación.csv',
    status: 'pending',
    totalRows: rows.length,
    totalChunks,
    // Cursor de avance — única fuente de verdad de qué chunk falta procesar
    // (ver runCsvImportChunk en processChunk.ts), no el status de cada chunk.
    nextChunkIndex: 0,
    processedRows: 0,
    successCount: 0,
    failedCount: 0,
    progressPercent: 0,
    createdAt: FieldValue.serverTimestamp(),
    startedAt: null,
    completedAt: null,
    errorMessage: null,
  })
  for (let i = 0; i < totalChunks; i++) {
    const chunkRows = rows.slice(i * ROWS_PER_CHUNK, (i + 1) * ROWS_PER_CHUNK)
    batch.set(chunksCol.doc(String(i)), {
      rows: chunkRows,
      status: 'pending',
      addedCount: 0,
      rejectedCount: 0,
    })
  }
  await batch.commit()

  return { jobId: jobRef.id }
}
