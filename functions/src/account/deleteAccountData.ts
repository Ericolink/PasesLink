// Limpieza de Firestore para la autoeliminación de cuenta (Perfil → Cuenta
// → "Eliminar mi cuenta") — separado del callable (callable/deleteAccount.ts)
// para poder probarlo contra el emulador de Firestore sin tocar Firebase
// Authentication, mismo criterio que checkin/confirmPaymentAndCheckIn.ts.
// NO borra el usuario de Auth ni valida sesión reciente — eso es
// responsabilidad exclusiva del callable, que llama a esto después.
//
// Decisión de producto (eventos propios): se eliminan en cascada junto con
// la cuenta (Opción A), no se bloquea el borrado ni se ofrece transferencia.
// Encaja con el objetivo principal declarado — reciclar cuentas de prueba
// rápido durante desarrollo — y bloquear mientras haya eventos frustraría
// justo ese caso de uso. El resto de los datos donde el usuario aparece
// como actor histórico en eventos AJENOS (paidBy, scannedBy,
// notificationQueue.recipientUid, reports, feedback) se conserva tal cual:
// pertenece al organizador de ese evento, no a esta cuenta.
import { FieldValue, type Firestore } from 'firebase-admin/firestore'

export type DeleteAccountDataResult = {
  ownedEventsDeleted: number
  coOrganizationsRemoved: number
  guestLinksUnlinked: number
}

export async function deleteAccountData(db: Firestore, uid: string): Promise<DeleteAccountDataResult> {
  // 1) Eventos propios: borrado en cascada completo. recursiveDelete cubre
  // TODAS las subcolecciones (incluidas las que el deleteEvent del cliente
  // no cubre hoy: notificationQueue, tables, concessions*, csvImportJobs,
  // counterShards, etc.), sin necesidad de enumerarlas a mano ni arrastrar
  // ese gap acá.
  const ownedEventsSnap = await db.collection('events').where('ownerId', '==', uid).get()
  for (const eventDoc of ownedEventsSnap.docs) {
    await db.recursiveDelete(eventDoc.ref)
  }

  // 2) Co-organizador en eventos ajenos: se limpia únicamente su entrada en
  // los dos mapas del evento — el evento y el resto de sus datos (invitados,
  // pagos, check-ins) quedan intactos, pertenecen al dueño.
  const coOrgEventsSnap = await db
    .collection('events')
    .where(`coOrganizersMap.${uid}`, '!=', null)
    .get()
  for (const eventDoc of coOrgEventsSnap.docs) {
    await eventDoc.ref.update({
      [`coOrganizersMap.${uid}`]: FieldValue.delete(),
      [`coOrganizerPermissions.${uid}`]: FieldValue.delete(),
    })
  }

  // 3) Invitaciones recibidas en eventos de otros organizadores: se
  // desvincula guestUid (vuelve a null, mismo estado que un pase nunca
  // reclamado — ver claimGuestOwnership). El documento del invitado sigue
  // perteneciendo al organizador de ese evento, nunca se borra.
  const guestLinksSnap = await db.collectionGroup('guests').where('guestUid', '==', uid).get()
  for (const guestDoc of guestLinksSnap.docs) {
    await guestDoc.ref.update({ guestUid: null })
  }

  // 4) Rol de admin, si aplica. Se borra explícitamente en vez de dejar que
  // onAdminWritten reaccione solo: ese trigger limpia el custom claim, pero
  // el doc admins/{uid} referenciando un uid ya inexistente en Auth
  // quedaría como basura silenciosa si no se borra acá.
  const adminRef = db.doc(`admins/${uid}`)
  if ((await adminRef.get()).exists) {
    await adminRef.delete()
  }

  // 5) Perfil propio: users/{uid} + subcolecciones (invitations,
  // legalAcceptances, sendLog del correo de bienvenida).
  await db.recursiveDelete(db.doc(`users/${uid}`))

  return {
    ownedEventsDeleted: ownedEventsSnap.size,
    coOrganizationsRemoved: coOrgEventsSnap.size,
    guestLinksUnlinked: guestLinksSnap.size,
  }
}
