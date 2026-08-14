import type { EventData } from './index'
import {
  FULL_ACCESS,
  LEGACY_COORG_DEFAULTS,
  NO_ACCESS,
  type CoOrganizerPermissions,
} from './coOrganizerPermissions'
import { resolveConcessionsStaffEntry } from './concessions'

// Fase 1 de ROLES_PERMISSIONS_REDESIGN.md: modelo de datos unificado de
// colaboradores + resolución de permisos, con fallback a los tres sistemas
// legacy (coOrganizersMap+coOrganizerPermissions, concessionsStaffMap). No
// cambia ningún comportamiento todavía: ningún flujo de la app escribe a
// `event.collaborators` hasta la Fase 2, así que resolveCollaboratorPermissions
// siempre resuelve hoy por una de las ramas legacy, con el mismo resultado que
// ya calculaba cada página por separado (ver comentarios de cada rama abajo).
// 'comunidad' (Fase 5 de ROLES_PERMISSIONS_REDESIGN.md): aislado de
// 'administrador' porque `moderateWall` ya existía como permiso suelto — no
// se implementó en la v1 del rediseño por decisión explícita del usuario
// (sin evidencia de necesidad todavía), se agregó después bajo el mismo
// criterio ya documentado ahí: "extensión trivial a futuro" si aparece un
// caso real de alguien que solo debe moderar el muro.
export type CollaboratorRole = 'administrador' | 'recepcion' | 'caja' | 'ventas' | 'preparacion' | 'comunidad'

// Lista corta y concreta de lo que puede hacer cada rol — usada en la
// pantalla de aceptación de invitación (AcceptCollaboratorInvite.tsx) para
// que quien acepta sepa exactamente qué acceso recibe antes de confirmar
// (pedido explícito de ROLES_PERMISSIONS_REDESIGN.md §24 — ninguna de las
// dos pantallas legacy de invitación lo hacía con este nivel de detalle).
export const COLLABORATOR_ROLE_DESCRIPTIONS: Record<CollaboratorRole, string[]> = {
  administrador: [
    'Gestionar invitados: agregar, editar y eliminar',
    'Escanear pases y hacer check-in',
    'Confirmar pagos',
    'Ver reportes y estadísticas del evento',
    'Administrar el catálogo y las ventas',
    'Moderar el muro del evento',
    'Invitar y gestionar otros colaboradores',
  ],
  recepcion: [
    'Ver los datos del evento (sin poder modificarlos)',
    'Ver la lista de invitados',
    'Escanear pases y hacer check-in',
    'Marcar invitados como pagados o no pagados',
  ],
  caja: [
    'Ver y confirmar pagos de ventas',
    'Ver el catálogo de productos',
    'Ver el historial de ventas y los pedidos',
  ],
  ventas: [
    'Crear y editar productos del catálogo',
    'Ver el historial de ventas',
    'Ver los pedidos',
  ],
  preparacion: [
    'Ver los pedidos por preparar',
    'Marcar pedidos como entregados',
    'Ver el catálogo de productos',
  ],
  comunidad: [
    'Moderar el muro del evento',
    'Eliminar o fijar comentarios',
  ],
}

export const COLLABORATOR_ROLE_LABELS: Record<CollaboratorRole, string> = {
  administrador: 'Administrador',
  recepcion: 'Recepción',
  caja: 'Caja',
  ventas: 'Ventas',
  preparacion: 'Preparación',
  comunidad: 'Comunidad',
}

// Permisos que hoy no existen como booleano propio de CoOrganizerPermissions
// porque nunca hizo falta distinguirlos de uno más amplio (confirmPayments,
// manageConcessions) — Caja/Ventas/Preparación sí necesitan esa granularidad
// para respetar mínimo privilegio (ver matriz en ROLES_PERMISSIONS_REDESIGN.md §2.4).
export interface EventCollaboratorPermissions extends CoOrganizerPermissions {
  viewPayments: boolean
  viewCatalog: boolean
  viewSales: boolean
  viewOrders: boolean
  prepareOrders: boolean
  cancelOrders: boolean
}

// Documento futuro de event.collaborators[uid] (ver §2.1 del rediseño) — el
// tipo ya existe para que el resto del código pueda referenciarlo, aunque
// ningún flujo lo escriba todavía.
export interface CollaboratorEntry {
  email: string
  role: CollaboratorRole
  permissionOverrides?: Partial<EventCollaboratorPermissions>
  invitedBy: string
  invitedAt: number
}

export interface CollaboratorPermissions extends EventCollaboratorPermissions {
  isOwner: boolean
  // true solo para el rol 'administrador' (y para el coorganizador legacy,
  // que migra 1:1 a ese rol) — a diferencia de hasAccess (abajo), esto NO se
  // amplía a Recepción: sigue significando específicamente "es un
  // colaborador de nivel administrador", usado p.ej. en GuestPass.tsx para
  // distinguir la vista de organizador.
  isCoOrg: boolean
  // Puede ver el dashboard de EventDetail (aunque sea de solo lectura) en
  // vez de ser redirigido a una pantalla dedicada. true para 'administrador'
  // y para 'recepcion' (pedido explícito: ve los datos del evento sin
  // modificarlos, con Escanear/pagos habilitados según su preset — cada
  // acción puntual de edición sigue gateada por su propio permiso, editEvent/
  // manageCoOrganizers/addGuests son false para Recepción). Caja/Ventas/
  // Preparación/Comunidad siguen en false: van directo a su pantalla
  // dedicada (ver EventDetail.tsx).
  hasAccess: boolean
  canPostWall: boolean
}

const NO_COLLABORATOR_ACCESS: CollaboratorPermissions = {
  ...NO_ACCESS,
  viewPayments: false,
  viewCatalog: false,
  viewSales: false,
  viewOrders: false,
  prepareOrders: false,
  cancelOrders: false,
}

const ADMINISTRADOR_PRESET: EventCollaboratorPermissions = {
  ...FULL_ACCESS,
  viewPayments: true,
  viewCatalog: true,
  viewSales: true,
  viewOrders: true,
  prepareOrders: true,
  cancelOrders: true,
}

// Invitados + check-in + pagos de entrada — pedido explícito del usuario
// (2026-08-13): "dejarlo ver los datos del evento sin modificarlos, solo
// permitir escanear, marcar invitados como pagados o no pagados". A
// diferencia de la v1 de este diseño, confirmPayments SÍ es parte del
// preset base (antes era opcional vía permissionOverrides) — el anfitrión
// puede seguir angostándolo con `permissionOverrides: { confirmPayments: false }`
// si un evento puntual solo quiere que Caja confirme pagos.
const RECEPCION_PRESET: EventCollaboratorPermissions = {
  ...NO_ACCESS,
  viewGuestList: true,
  scanQr: true,
  postWall: true,
  viewPayments: true,
  confirmPayments: true,
  viewCatalog: false,
  viewSales: false,
  viewOrders: false,
  prepareOrders: false,
  cancelOrders: false,
}

const CAJA_PRESET: EventCollaboratorPermissions = {
  ...NO_ACCESS,
  postWall: true,
  viewPayments: true,
  confirmPayments: true,
  viewCatalog: true,
  viewSales: true,
  viewOrders: true,
  prepareOrders: false,
  cancelOrders: false,
}

const VENTAS_PRESET: EventCollaboratorPermissions = {
  ...NO_ACCESS,
  postWall: true,
  manageConcessions: true,
  viewCatalog: true,
  viewSales: true,
  viewOrders: true,
  viewPayments: false,
  confirmPayments: false,
  prepareOrders: false,
  cancelOrders: false,
}

// Deliberadamente sin viewPayments/confirmPayments: el preparador no necesita
// saber si el pedido fue pagado, esa validación es responsabilidad exclusiva
// de Caja (pedido explícito del rediseño).
const PREPARACION_PRESET: EventCollaboratorPermissions = {
  ...NO_ACCESS,
  postWall: true,
  viewCatalog: true,
  viewOrders: true,
  prepareOrders: true,
  viewPayments: false,
  confirmPayments: false,
  viewSales: false,
  cancelOrders: false,
}

// Únicamente moderateWall — sin acceso a nada más del evento (invitados,
// pagos, catálogo, reportes, colaboradores).
const COMUNIDAD_PRESET: EventCollaboratorPermissions = {
  ...NO_ACCESS,
  postWall: true,
  moderateWall: true,
  viewPayments: false,
  viewCatalog: false,
  viewSales: false,
  viewOrders: false,
  prepareOrders: false,
  cancelOrders: false,
}

const COLLABORATOR_ROLE_PRESETS: Record<CollaboratorRole, EventCollaboratorPermissions> = {
  administrador: ADMINISTRADOR_PRESET,
  recepcion: RECEPCION_PRESET,
  caja: CAJA_PRESET,
  ventas: VENTAS_PRESET,
  preparacion: PREPARACION_PRESET,
  comunidad: COMUNIDAD_PRESET,
}

// Única fuente de verdad de "qué puede hacer este usuario en este evento",
// generalización de resolveEventPermissions (coOrganizerPermissions.ts) que
// además entiende el staff de ventas (concessionsStaffMap) y el futuro mapa
// unificado (event.collaborators). Orden de resolución: dueño → mapa nuevo
// (si existe una entrada) → coorganizador legacy → staff de ventas legacy →
// sin acceso.
export function resolveCollaboratorPermissions(
  event:
    | Pick<EventData, 'ownerId' | 'coOrganizersMap' | 'coOrganizerPermissions' | 'collaborators' | 'concessions'>
    | null
    | undefined,
  uid: string | null | undefined,
): CollaboratorPermissions {
  if (!event || !uid) return NO_COLLABORATOR_ACCESS

  if (uid === event.ownerId) {
    return { ...ADMINISTRADOR_PRESET, isOwner: true, isCoOrg: false, hasAccess: true, canPostWall: true }
  }

  const collaboratorEntry = event.collaborators?.[uid]
  if (collaboratorEntry) {
    const preset = COLLABORATOR_ROLE_PRESETS[collaboratorEntry.role]
    const merged = { ...preset, ...collaboratorEntry.permissionOverrides }
    const isAdminRole = collaboratorEntry.role === 'administrador'
    return {
      ...merged,
      isOwner: false,
      isCoOrg: isAdminRole,
      // Recepción también ve el dashboard (de solo lectura) en vez de ser
      // redirigida — ver el comentario de `hasAccess` en CollaboratorPermissions.
      hasAccess: isAdminRole || collaboratorEntry.role === 'recepcion',
      canPostWall: merged.postWall,
    }
  }

  const coOrgsMap = event.coOrganizersMap || {}
  if (uid in coOrgsMap) {
    const stored = event.coOrganizerPermissions?.[uid]
    const merged = { ...LEGACY_COORG_DEFAULTS, ...stored }
    return {
      ...merged,
      // Un coorganizador legacy nunca tuvo estos permisos granulares por
      // separado — se derivan de los mismos combos que ya calculaba cada
      // página a mano (ver EventDetail.tsx/ConcessionsManager.tsx antes de
      // este cambio: manageConcessions || confirmPayments para ver pedidos).
      viewPayments: merged.confirmPayments,
      viewCatalog: merged.manageConcessions,
      viewSales: merged.manageConcessions,
      viewOrders: merged.manageConcessions || merged.confirmPayments,
      prepareOrders: merged.manageConcessions,
      cancelOrders: merged.manageConcessions || merged.confirmPayments,
      isOwner: false,
      isCoOrg: true,
      hasAccess: true,
      canPostWall: merged.postWall,
    }
  }

  const staffEntry = resolveConcessionsStaffEntry(event.concessions?.concessionsStaffMap?.[uid])
  if (staffEntry) {
    return {
      ...NO_COLLABORATOR_ACCESS,
      postWall: true,
      viewPayments: staffEntry.roles.cashier,
      confirmPayments: staffEntry.roles.cashier,
      viewCatalog: staffEntry.roles.cashier || staffEntry.roles.prep,
      viewSales: staffEntry.roles.cashier,
      viewOrders: staffEntry.roles.cashier || staffEntry.roles.prep,
      prepareOrders: staffEntry.roles.prep,
      canPostWall: true,
    }
  }

  return NO_COLLABORATOR_ACCESS
}
