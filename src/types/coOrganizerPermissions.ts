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

const NO_ACCESS: EventPermissions = {
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
  isOwner: false,
  isCoOrg: false,
  hasAccess: false,
  canPostWall: true,
}

const FULL_ACCESS: CoOrganizerPermissions = {
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
