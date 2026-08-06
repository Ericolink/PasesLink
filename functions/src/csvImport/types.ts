// Formas compartidas entre createJob.ts, processChunk.ts y las callables que
// envuelven cada una — separado en su propio archivo porque tanto el cliente
// (al armar el payload de startCsvImport) como el worker de Cloud Tasks
// necesitan la misma forma de fila sin depender uno del otro.
export type CsvImportJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'cancelled'

export interface CsvImportRowInput {
  name: string
  lastName?: string
  phone?: string
  email?: string
}
