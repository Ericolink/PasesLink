// Cancela una importación CSV en curso — el organizador solo detiene lo que
// falta procesar, no interrumpe una tarea de Cloud Tasks a mitad de un
// chunk ya en vuelo (esa termina de escribir sus invitados con normalidad;
// runCsvImportChunk revisa el status ANTES de encolar el siguiente chunk,
// así que "cancelado" nunca deja de tener efecto, solo puede tardar un
// chunk en notarse).
import { FieldValue, type Firestore } from 'firebase-admin/firestore'

export class CsvImportCancelError extends Error {}

export async function cancelCsvImportJob(db: Firestore, eventId: string, jobId: string): Promise<void> {
  const jobRef = db.collection('events').doc(eventId).collection('csvImportJobs').doc(jobId)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef)
    if (!snap.exists) throw new CsvImportCancelError('La importación no existe.')
    const status = snap.data()!.status as string
    if (status !== 'pending' && status !== 'processing') {
      throw new CsvImportCancelError('Esta importación ya terminó y no se puede cancelar.')
    }
    tx.update(jobRef, { status: 'cancelled', completedAt: FieldValue.serverTimestamp() })
  })
}
