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
export type CollaboratorRole = 'administrador' | 'recepcion' | 'caja' | 'ventas' | 'preparacion'

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
    'Ver la lista de invitados',
    'Escanear pases y hacer check-in',
    'Ver el estado de los pagos',
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
}

export const COLLABORATOR_ROLE_LABELS: Record<CollaboratorRole, string> = {
  administrador: 'Administrador',
  recepcion: 'Recepción',
  caja: 'Caja',
  ventas: 'Ventas',
  preparacion: 'Preparación',
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
  // que migra 1:1 a ese rol) — los roles operativos angostos (Recepción,
  // Caja, Ventas, Preparación) nunca fueron ni serán "coorganizador": no ven
  // el dashboard general de EventDetail, solo su pantalla dedicada, exacto
  // mismo criterio que ya aplica hoy concessionsStaffMap.
  isCoOrg: boolean
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

// Invitados + check-in + info mínima de pagos. Confirmar pago NO es parte
// del preset base — se otorga por evento vía permissionOverrides si el
// anfitrión lo necesita (ver ROLES_PERMISSIONS_REDESIGN.md §2.3), para no
// forzar ese acceso en eventos donde solo Caja confirma pagos.
const RECEPCION_PRESET: EventCollaboratorPermissions = {
  ...NO_ACCESS,
  viewGuestList: true,
  scanQr: true,
  postWall: true,
  viewPayments: true,
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

const COLLABORATOR_ROLE_PRESETS: Record<CollaboratorRole, EventCollaboratorPermissions> = {
  administrador: ADMINISTRADOR_PRESET,
  recepcion: RECEPCION_PRESET,
  caja: CAJA_PRESET,
  ventas: VENTAS_PRESET,
  preparacion: PREPARACION_PRESET,
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
      hasAccess: isAdminRole,
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
