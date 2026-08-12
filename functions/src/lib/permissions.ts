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

// Mismo criterio, para el permiso `manageCoOrganizers` (createCoOrganizerInvite,
// ver functions/src/callable/) — default `?? false`, igual que
// LEGACY_COORG_DEFAULTS.manageCoOrganizers (src/types/coOrganizerPermissions.ts):
// a diferencia de la mayoría de los permisos (default amplio `true`), gestionar
// coorganizadores es sensible y arranca cerrado salvo que el dueño lo otorgue
// explícitamente.
export function canManageCoOrganizers(event: DocumentData, uid: string): boolean {
  if (event.ownerId === uid) return true
  const coOrganizersMap = event.coOrganizersMap as Record<string, unknown> | undefined
  if (!coOrganizersMap || !(uid in coOrganizersMap)) return false
  const perms = event.coOrganizerPermissions as Record<string, Record<string, boolean>> | undefined
  return perms?.[uid]?.manageCoOrganizers ?? false
}

// Puerto de resolveConcessionsStaffEntry (src/types/concessions.ts) — no se
// puede importar src/ desde functions/, mismo motivo documentado arriba.
// Shape legado (string = solo el email, sin roles) se resuelve como
// solo-preparación: es el único acceso que esos encargados ya tenían antes
// de existir el rol de caja.
function resolveStaffEntry(raw: unknown): { email: string; roles: { cashier: boolean; prep: boolean } } | null {
  if (raw == null) return null
  if (typeof raw === 'string') return { email: raw, roles: { cashier: false, prep: true } }
  const entry = raw as { email?: string; roles?: { cashier?: boolean; prep?: boolean } }
  return { email: entry.email || '', roles: { cashier: !!entry.roles?.cashier, prep: !!entry.roles?.prep } }
}

// Encargado de caja: valida pagos (confirmar/rechazar), sin ser
// coorganizador ni tener acceso a `concessionsFulfillment`. Usado por
// acceptConcessionsStaffInvite.ts para mergear roles.
export function isConcessionsCashier(event: DocumentData, uid: string): boolean {
  const staffMap = event.concessions?.concessionsStaffMap as Record<string, unknown> | undefined
  const entry = resolveStaffEntry(staffMap?.[uid])
  return !!entry?.roles.cashier
}

// Encargado de preparación: ve/avanza `concessionsFulfillment` y puede
// marcar agotado/disponible en el catálogo, sin ver dinero ni comprobantes.
export function isConcessionsPrep(event: DocumentData, uid: string): boolean {
  const staffMap = event.concessions?.concessionsStaffMap as Record<string, unknown> | undefined
  const entry = resolveStaffEntry(staffMap?.[uid])
  return !!entry?.roles.prep
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
