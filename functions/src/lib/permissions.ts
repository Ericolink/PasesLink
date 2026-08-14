// Fase 2 de ROLES_PERMISSIONS_REDESIGN.md: generaliza en un solo
// hasPermission() las ~9 funciones puntuales que tenía este archivo
// (canManageGuests/canConfirmPayments/canScanQr/canEditGuests/
// canManageConcessions/canManageCoOrganizers/isConcessionsCashier/
// isConcessionsPrep) — mismo criterio de resolución que
// resolveCollaboratorPermissions (src/types/collaboratorPermissions.ts): no
// se puede importar src/ desde functions/ (runtime standalone, ver el resto
// del archivo antes de este cambio), así que este es un puerto server-side,
// no una importación — si se agrega/cambia un rol o preset, portarlo acá
// también.
//
// Agrega el bypass de admin de plataforma que faltaba en todo Callable
// migrado hasta ahora (gap real documentado en
// BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md/ROLES_PERMISSIONS_REDESIGN.md): un
// admin de soporte ahora puede confirmar pagos/hacer check-in/etc. vía
// Callable igual que ya podía hacerlo escribiendo directo a Firestore
// (isAdmin() en firestore.rules).
import type { DocumentData } from 'firebase-admin/firestore'

export type CollaboratorRole = 'administrador' | 'recepcion' | 'caja' | 'ventas' | 'preparacion' | 'comunidad'

export type CollaboratorPermission =
  | 'addGuests'
  | 'editGuests'
  | 'deleteGuests'
  | 'shareInviteLink'
  | 'confirmPayments'
  | 'scanQr'
  | 'viewGuestList'
  | 'postWall'
  | 'moderateWall'
  | 'editEvent'
  | 'manageCoOrganizers'
  | 'viewReports'
  | 'exportLists'
  | 'downloadEventInfo'
  | 'manageSeating'
  | 'viewLiveDashboard'
  | 'manageConcessions'
  | 'viewPayments'
  | 'viewCatalog'
  | 'viewSales'
  | 'viewOrders'
  | 'prepareOrders'
  | 'cancelOrders'

type PermissionSet = Record<CollaboratorPermission, boolean>
// El subconjunto que ya existía como CoOrganizerPermissions del lado cliente
// (17 booleanos) — los 6 restantes de PermissionSet son derivados o propios
// de roles nuevos, nunca se guardan sueltos para un coorganizador legacy.
// Exportado para que createCoOrganizerInvite.ts otorgue exactamente este set
// al canjear un enlace, en vez de mantener su propia copia literal (drift ya
// real que existía antes de este cambio, ver ROLES_PERMISSIONS_REDESIGN.md).
export type LegacyCoOrgPermissions = Omit<
  PermissionSet,
  'viewPayments' | 'viewCatalog' | 'viewSales' | 'viewOrders' | 'prepareOrders' | 'cancelOrders'
>

const NO_ACCESS: PermissionSet = {
  addGuests: false,
  editGuests: false,
  deleteGuests: false,
  shareInviteLink: false,
  confirmPayments: false,
  scanQr: false,
  viewGuestList: false,
  postWall: false,
  moderateWall: false,
  editEvent: false,
  manageCoOrganizers: false,
  viewReports: false,
  exportLists: false,
  downloadEventInfo: false,
  manageSeating: false,
  viewLiveDashboard: false,
  manageConcessions: false,
  viewPayments: false,
  viewCatalog: false,
  viewSales: false,
  viewOrders: false,
  prepareOrders: false,
  cancelOrders: false,
}

const FULL_ACCESS: PermissionSet = Object.fromEntries(
  Object.keys(NO_ACCESS).map((key) => [key, true]),
) as PermissionSet

// Mismos valores que LEGACY_COORG_DEFAULTS (src/types/coOrganizerPermissions.ts)
// — si se cambia uno acá, cambiarlo también ahí (y en firestore.rules).
export const LEGACY_COORG_DEFAULTS: LegacyCoOrgPermissions = {
  addGuests: true,
  editGuests: true,
  deleteGuests: true,
  shareInviteLink: true,
  confirmPayments: true,
  scanQr: true,
  viewGuestList: true,
  postWall: true,
  moderateWall: true,
  editEvent: false,
  manageCoOrganizers: false,
  viewReports: true,
  exportLists: true,
  downloadEventInfo: true,
  manageSeating: true,
  viewLiveDashboard: true,
  manageConcessions: false,
}

// Mismos valores que COLLABORATOR_ROLE_PRESETS (src/types/collaboratorPermissions.ts).
const ROLE_PRESETS: Record<CollaboratorRole, PermissionSet> = {
  administrador: FULL_ACCESS,
  recepcion: { ...NO_ACCESS, viewGuestList: true, scanQr: true, postWall: true, viewPayments: true, confirmPayments: true },
  caja: {
    ...NO_ACCESS,
    postWall: true,
    viewPayments: true,
    confirmPayments: true,
    viewCatalog: true,
    viewSales: true,
    viewOrders: true,
  },
  ventas: {
    ...NO_ACCESS,
    postWall: true,
    manageConcessions: true,
    viewCatalog: true,
    viewSales: true,
    viewOrders: true,
  },
  preparacion: { ...NO_ACCESS, postWall: true, viewCatalog: true, viewOrders: true, prepareOrders: true },
  comunidad: { ...NO_ACCESS, postWall: true, moderateWall: true },
}

// Validación de input en createCollaboratorInvite.ts (role/permissionOverrides
// mandados por el cliente) sin repetir la lista a mano una quinta vez.
export const COLLABORATOR_ROLES = Object.keys(ROLE_PRESETS) as CollaboratorRole[]
export const COLLABORATOR_PERMISSION_KEYS = Object.keys(NO_ACCESS) as CollaboratorPermission[]

interface RawCollaboratorEntry {
  role?: CollaboratorRole
  permissionOverrides?: Partial<PermissionSet>
}

interface StaffRoles {
  cashier: boolean
  prep: boolean
}

// Puerto de resolveConcessionsStaffEntry (src/types/concessions.ts). Shape
// legado (string = solo el email, sin roles) se resuelve como
// solo-preparación: es el único acceso que esos encargados ya tenían antes
// de existir el rol de caja.
function resolveStaffEntry(raw: unknown): { roles: StaffRoles } | null {
  if (raw == null) return null
  if (typeof raw === 'string') return { roles: { cashier: false, prep: true } }
  const entry = raw as { roles?: Partial<StaffRoles> }
  return { roles: { cashier: !!entry.roles?.cashier, prep: !!entry.roles?.prep } }
}

function resolvePermissionSet(event: DocumentData, uid: string): PermissionSet {
  const collaborators = event.collaborators as Record<string, RawCollaboratorEntry> | undefined
  const collaboratorEntry = collaborators?.[uid]
  if (collaboratorEntry?.role) {
    const preset = ROLE_PRESETS[collaboratorEntry.role] ?? NO_ACCESS
    return { ...preset, ...collaboratorEntry.permissionOverrides }
  }

  const coOrganizersMap = event.coOrganizersMap as Record<string, unknown> | undefined
  if (coOrganizersMap && uid in coOrganizersMap) {
    const stored = (event.coOrganizerPermissions as Record<string, Partial<LegacyCoOrgPermissions>> | undefined)?.[uid]
    const merged: LegacyCoOrgPermissions = { ...LEGACY_COORG_DEFAULTS, ...stored }
    return {
      ...merged,
      // Un coorganizador legacy nunca tuvo estos permisos granulares por
      // separado — mismos combos que ya calculaba cada Callable a mano antes
      // de este cambio (canConfirmPayments/canManageConcessions).
      viewPayments: merged.confirmPayments,
      viewCatalog: merged.manageConcessions,
      viewSales: merged.manageConcessions,
      viewOrders: merged.manageConcessions || merged.confirmPayments,
      prepareOrders: merged.manageConcessions,
      cancelOrders: merged.manageConcessions || merged.confirmPayments,
    }
  }

  const staffEntry = resolveStaffEntry(
    (event.concessions as DocumentData | undefined)?.concessionsStaffMap?.[uid],
  )
  if (staffEntry) {
    return {
      ...NO_ACCESS,
      postWall: true,
      viewPayments: staffEntry.roles.cashier,
      confirmPayments: staffEntry.roles.cashier,
      viewCatalog: staffEntry.roles.cashier || staffEntry.roles.prep,
      viewSales: staffEntry.roles.cashier,
      viewOrders: staffEntry.roles.cashier || staffEntry.roles.prep,
      prepareOrders: staffEntry.roles.prep,
    }
  }

  return NO_ACCESS
}

// Único punto de verdad de autorización de colaborador en Cloud Functions —
// todo Callable que gatee una acción por rol llama a esto en vez de comparar
// ownerId/coOrganizersMap/concessionsStaffMap a mano. `opts.isAdmin` debe
// venir de `request.auth.token.admin === true` (custom claim, ver
// firestore.rules `isAdmin()`), nunca de un documento leído por el propio
// Callable — el claim ya viene verificado en el token decodificado.
export function hasPermission(
  event: DocumentData,
  uid: string,
  permission: CollaboratorPermission,
  opts?: { isAdmin?: boolean },
): boolean {
  if (opts?.isAdmin) return true
  if (event.ownerId === uid) return true
  return resolvePermissionSet(event, uid)[permission]
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
