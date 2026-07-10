import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './config'
import { LEGAL_DOCS_LIST } from '../legal/documents'

export type LegalAcceptanceMethod = 'register_email' | 'google' | 'facebook'

/**
 * Registra la aceptación de los documentos legales vigentes (LEGAL_DOCS) para
 * un usuario: guarda el detalle en un historial append-only (`legalAcceptances`,
 * mismo patrón inmutable que adminAuditLog) y denormaliza la última versión
 * aceptada en `users/{uid}.legalAcceptedVersions` para lecturas rápidas.
 */
export async function recordLegalAcceptance(uid: string, method: LegalAcceptanceMethod) {
  const documents = LEGAL_DOCS_LIST.map((d) => ({ id: d.id, version: d.version }))
  const acceptedVersions = Object.fromEntries(documents.map((d) => [d.id, d.version]))

  await Promise.all([
    addDoc(collection(db, 'users', uid, 'legalAcceptances'), {
      documents,
      method,
      acceptedAt: serverTimestamp(),
    }),
    setDoc(doc(db, 'users', uid), { legalAcceptedVersions: acceptedVersions }, { merge: true }),
  ])
}
