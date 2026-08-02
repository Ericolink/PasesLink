// Reimplementación mínima, del lado de Cloud Functions, del mismo criterio
// que canDo()/coOrgPerm() en firestore.rules — no se puede ejecutar
// firestore.rules como código Node, así que esta es la versión Admin SDK
// del mismo chequeo: el dueño siempre puede; un co-organizador puede si
// tiene el permiso puntual (o no tiene entrada en coOrganizerPermissions,
// en cuyo caso el default LEGACY es true, mismo criterio que las rules).
// Reutiliza el permiso 'addGuests' ya existente — tanto la lista de espera
// como la reconfirmación son extensiones de "gestionar invitados", no
// categorías de permiso nuevas (de ahí el nombre genérico, no
// "canManageWaitlist" — lo usan dos features distintas).
import type { DocumentData } from 'firebase-admin/firestore'

export function canManageGuests(event: DocumentData, uid: string): boolean {
  if (event.ownerId === uid) return true
  const coOrganizersMap = event.coOrganizersMap as Record<string, unknown> | undefined
  if (!coOrganizersMap || !(uid in coOrganizersMap)) return false
  const perms = event.coOrganizerPermissions as Record<string, Record<string, boolean>> | undefined
  return perms?.[uid]?.addGuests ?? true
}

// Mismo criterio que canManageGuests, para el permiso puntual `confirmPayments`
// (setGuestPaymentStatus/bulkSetGuestPaymentStatus, ver functions/src/payments/).
export function canConfirmPayments(event: DocumentData, uid: string): boolean {
  if (event.ownerId === uid) return true
  const coOrganizersMap = event.coOrganizersMap as Record<string, unknown> | undefined
  if (!coOrganizersMap || !(uid in coOrganizersMap)) return false
  const perms = event.coOrganizerPermissions as Record<string, Record<string, boolean>> | undefined
  return perms?.[uid]?.confirmPayments ?? true
}

// Mismo criterio, para el permiso `scanQr` (checkInGuest/checkOutGuest/
// confirmPaymentAndCheckIn, ver functions/src/checkin/).
export function canScanQr(event: DocumentData, uid: string): boolean {
  if (event.ownerId === uid) return true
  const coOrganizersMap = event.coOrganizersMap as Record<string, unknown> | undefined
  if (!coOrganizersMap || !(uid in coOrganizersMap)) return false
  const perms = event.coOrganizerPermissions as Record<string, Record<string, boolean>> | undefined
  return perms?.[uid]?.scanQr ?? true
}

// Mismo criterio, para el permiso `editGuests` (allowGuestReentry, ver
// functions/src/callable/allowGuestReentry.ts) — mismo gate que ya usa el
// botón "Permitir reingreso" del lado del cliente (GuestDetailSheet.tsx).
export function canEditGuests(event: DocumentData, uid: string): boolean {
  if (event.ownerId === uid) return true
  const coOrganizersMap = event.coOrganizersMap as Record<string, unknown> | undefined
  if (!coOrganizersMap || !(uid in coOrganizersMap)) return false
  const perms = event.coOrganizerPermissions as Record<string, Record<string, boolean>> | undefined
  return perms?.[uid]?.editGuests ?? true
}

// Mismo criterio, para el permiso `manageConcessions` (cancelConcessionOrder,
// ver functions/src/callable/cancelConcessionOrder.ts) — mismo gate que
// isValidConcessionStockRelease en firestore.rules (sin la rama isAdmin() de
// ahí: ningún Callable migrado hasta ahora la replica, ver checkInGuest/
// setGuestPaymentStatus).
export function canManageConcessions(event: DocumentData, uid: string): boolean {
  if (event.ownerId === uid) return true
  const coOrganizersMap = event.coOrganizersMap as Record<string, unknown> | undefined
  if (!coOrganizersMap || !(uid in coOrganizersMap)) return false
  const perms = event.coOrganizerPermissions as Record<string, Record<string, boolean>> | undefined
  return perms?.[uid]?.manageConcessions ?? false
}

// Puerto de guestLockTokensOk en firestore.rules: sin `lockTokens` o vacío
// (pase sin reclamar todavía) siempre pasa; si no, el token entrante debe
// estar en la lista de dispositivos ya reconocidos. Usada por
// createConcessionOrder para verificar que quien hace el checkout es dueño
// del guestId que declara (reemplaza a isGuestOrderActor de rules, que hace
// exists() + esta misma función — acá el llamador ya tiene el doc leído).
export function guestLockTokensOk(guestData: DocumentData, incomingToken: string | null): boolean {
  const lockTokens = guestData.lockTokens as string[] | undefined
  if (!lockTokens || lockTokens.length === 0) return true
  return incomingToken != null && lockTokens.includes(incomingToken)
}
