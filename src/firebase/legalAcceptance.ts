import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from './config'
import { ACCEPTANCE_REQUIRED_DOCS } from '../legal/documents'

// 'guest_pass_email'/'guest_pass_google' distinguen cuentas creadas desde el
// CTA de RSVP (GuestSignupPrompt en GuestPass) del registro tradicional;
// 'event_join_email'/'event_join_google' son el mismo CTA pero ofrecido antes
// de autoregistrarse (GuestSignupPrompt en EventJoin) — permite medir
// conversión de invitado a usuario registrado en el historial de aceptaciones.
// 'reaccept': el usuario ya tenía cuenta y aceptó una versión anterior de
// Términos/Privacidad — la usa LegalAcceptanceGate cuando se publica una
// versión nueva (ver src/components/LegalAcceptanceGate.tsx).
export type LegalAcceptanceMethod =
  | 'register_email'
  | 'google'
  | 'facebook'
  | 'guest_pass_email'
  | 'guest_pass_google'
  | 'event_join_email'
  | 'event_join_google'
  | 'reaccept'

/**
 * Registra la aceptación de los documentos legales vigentes que exigen
 * consentimiento activo (ACCEPTANCE_REQUIRED_DOCS — hoy Términos y
 * Privacidad, no el Aviso de Cookies) para un usuario: guarda el detalle en
 * un historial append-only (`legalAcceptances`, mismo patrón inmutable que
 * adminAuditLog) y denormaliza la última versión aceptada en
 * `users/{uid}.legalAcceptedVersions` para lecturas rápidas.
 *
 * Un solo batch (antes: dos escrituras independientes via Promise.all) — si
 * el proceso se interrumpía entre una y otra, `legalAcceptedVersions` podía
 * quedar actualizado sin su entrada correspondiente en el historial
 * inmutable, o viceversa.
 */
export async function recordLegalAcceptance(uid: string, method: LegalAcceptanceMethod) {
  const documents = ACCEPTANCE_REQUIRED_DOCS.map((d) => ({ id: d.id, version: d.version }))
  const acceptedVersions = Object.fromEntries(documents.map((d) => [d.id, d.version]))

  const batch = writeBatch(db)
  batch.set(doc(collection(db, 'users', uid, 'legalAcceptances')), {
    documents,
    method,
    acceptedAt: serverTimestamp(),
  })
  batch.set(doc(db, 'users', uid), { legalAcceptedVersions: acceptedVersions }, { merge: true })
  await batch.commit()
}
