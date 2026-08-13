import type { EventData } from './index'

// Catálogo de permisos otorgables a un co-organizador. Agregar un permiso
// nuevo a futuro: sumarlo acá + a LEGACY_COORG_DEFAULTS + al chequeo
// correspondiente en firestore.rules (ver comentario cruzado ahí) — nada más
// necesita cambiar.
export interface CoOrganizerPermissions {
  addGuests: boolean
  editGuests: boolean
  deleteGuests: boolean
  shareInviteLink: boolean
  confirmPayments: boolean
  scanQr: boolean
  viewGuestList: boolean
  postWall: boolean
  moderateWall: boolean
  // Cubre nombre/fecha/portada/cupo/modo de ingreso/pagos — hoy EditEventForm
  // guarda todo eso en un único updateEventDetails() atómico, así que no hay
  // forma real de separar "editar info" de "editar configuración/portada"
  // sin partir ese formulario. Queda como un solo permiso hasta que eso pase.
  editEvent: boolean
  manageCoOrganizers: boolean
  viewReports: boolean
  exportLists: boolean
  // Reservado a futuro: hoy no existe ninguna función de "descargar
  // información del evento" que gatear.
  downloadEventInfo: boolean
  // Crear/editar mesas y asignar invitados a ellas (Seating Chart) — separado
  // de editGuests para que un coanfitrión de logística pueda mover invitados
  // de mesa sin heredar edición completa del invitado.
  manageSeating: boolean
  // Ver la pantalla "Anfitrión en Vivo" (/events/:eventId/live).
  viewLiveDashboard: boolean
  // Catálogo, configuración y staff del módulo de venta de comida/bebida
  // (ver src/types/concessions.ts) — NO incluye confirmar pagos de pedidos,
  // eso sigue gateado por `confirmPayments` (mismo nivel de confianza que ya
  // se le exige a quien confirma el pago de entrada, ver
  // FOOD_BEVERAGE_ORDERING_ARCHITECTURE.md §8.1).
  manageConcessions: boolean
}

// Defaults aplicados a: (a) un co-organizador agregado antes de que este
// campo existiera (nunca tiene coOrganizerPermissions[uid]) y (b) el preset
// inicial de un co-organizador nuevo, para que "Agregar" siga siendo un
// flujo de un solo paso. Reproduce exactamente el acceso amplio que un
// co-organizador ya tenía antes de este cambio — el único ajuste real es
// viewReports (antes bugueado: el botón ya era visible y las reglas ya
// permitían leer checkins, ver Reports.tsx).
//
// Estos mismos valores están espejados como literales en firestore.rules
// (función canDo) — si se cambia uno acá, cambiarlo también ahí.
export const LEGACY_COORG_DEFAULTS: CoOrganizerPermissions = {
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
  // false (no true como el resto de este bloque): a diferencia de los demás
  // defaults legacy, esto no reproduce ningún acceso que ya existiera antes
  // — es una feature nueva desde el día uno, así que ningún co-organizador
  // ya agregado lo hereda en silencio; el organizador lo otorga a propósito.
  manageConcessions: false,
}

export interface EventPermissions extends CoOrganizerPermissions {
  isOwner: boolean
  isCoOrg: boolean
  hasAccess: boolean
  // `postWall` (arriba, parte de CoOrganizerPermissions) solo restringe a
  // coanfitriones — el dueño y cualquier invitado sin relación con el evento
  // siempre pueden postear en el muro (ver firestore.rules: `!isCoOrganizer
  // || coOrgPerm(postWall)`). Un consumidor que mire `perms.postWall` a
  // secas se equivoca para esos dos casos (NO_ACCESS/FULL_ACCESS tienen
  // `postWall` fijo, no relevante). `canPostWall` ya resuelve esa
  // combinación una sola vez acá, para no repetirla ad-hoc en cada página.
  canPostWall: boolean
}

// Exportados (no solo de uso interno) para que
// src/types/collaboratorPermissions.ts pueda construir sus propios presets
// de rol sobre esta misma base, en vez de repetir los 17 booleanos a mano —
// evita exactamente el tipo de drift que ya existe entre este archivo,
// firestore.rules y createCoOrganizerInvite.ts.
export const NO_ACCESS: EventPermissions = {
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
  isOwner: false,
  isCoOrg: false,
  hasAccess: false,
  canPostWall: true,
}

export const FULL_ACCESS: CoOrganizerPermissions = {
  addGuests: true,
  editGuests: true,
  deleteGuests: true,
  shareInviteLink: true,
  confirmPayments: true,
  scanQr: true,
  viewGuestList: true,
  postWall: true,
  moderateWall: true,
  editEvent: true,
  manageCoOrganizers: true,
  viewReports: true,
  exportLists: true,
  downloadEventInfo: true,
  manageSeating: true,
  viewLiveDashboard: true,
  manageConcessions: true,
}

// Único punto de verdad para "¿este usuario es organizador/co-organizador de
// este evento?" — reemplaza los checks ad-hoc `perms.isOwner || perms.isCoOrg`
// repetidos en distintos componentes (ver GuestPass.tsx).
export function isOrganizerRole(perms: Pick<EventPermissions, 'isOwner' | 'isCoOrg'>): boolean {
  return perms.isOwner || perms.isCoOrg
}

// Única fuente de verdad de "qué puede hacer este usuario en este evento" —
// todo componente que necesite gatear una acción (agregar invitados, escanear,
// moderar el muro, etc.) llama a esto (vía useEventPermissions) en vez de
// comparar ownerId/coOrganizersMap a mano.
export function resolveEventPermissions(
  event: Pick<EventData, 'ownerId' | 'coOrganizersMap' | 'coOrganizerPermissions'> | null | undefined,
  uid: string | null | undefined,
): EventPermissions {
  if (!event || !uid) return NO_ACCESS

  if (uid === event.ownerId) {
    return { ...FULL_ACCESS, isOwner: true, isCoOrg: false, hasAccess: true, canPostWall: true }
  }

  const coOrgsMap = event.coOrganizersMap || {}
  if (uid in coOrgsMap) {
    const stored = event.coOrganizerPermissions?.[uid]
    const merged = { ...LEGACY_COORG_DEFAULTS, ...stored }
    return { ...merged, isOwner: false, isCoOrg: true, hasAccess: true, canPostWall: merged.postWall }
  }

  return NO_ACCESS
}
