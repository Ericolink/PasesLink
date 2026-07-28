import type { GuestData, SectionVisibilityRule } from '../types'

// Único punto que evalúa "¿este invitado ve esta sección?" (Feature 1:
// visibilidad de secciones por tipo de invitado) — usado por GuestPass y,
// a futuro, por cualquier UI de organizador que necesite mostrar "a quién
// le llega esto". No reemplaza canDo()/coOrgPerm() de firestore.rules (esas
// gobiernan permisos de ORGANIZADOR); este es su análogo para el invitado,
// y v1 es deliberadamente solo del lado del cliente — ver Contexto del plan
// de esta feature para por qué (el documento del evento ya es legible
// completo por cualquier invitado con acceso).
//
// Cada campo presente en `rule` es una condición en AND con las demás; los
// valores dentro de un campo (ej. varios tags) están en OR entre sí. Sin
// regla o con un objeto vacío = visible para cualquier invitado.
export function isSectionVisibleToGuest(rule: SectionVisibilityRule | undefined, guest: GuestData): boolean {
  if (!rule) return true

  if (rule.tags && rule.tags.length > 0) {
    const guestTags = guest.tags || []
    if (!rule.tags.some((t) => guestTags.includes(t))) return false
  }

  if (rule.rsvpStatus && rule.rsvpStatus.length > 0) {
    if (!rule.rsvpStatus.includes(guest.rsvpStatus)) return false
  }

  if (rule.paymentStatus && rule.paymentStatus.length > 0) {
    if (!rule.paymentStatus.includes(guest.paymentStatus)) return false
  }

  if (rule.hasCompanion != null) {
    const guestHasCompanion = guest.companions.length > 0
    if (guestHasCompanion !== rule.hasCompanion) return false
  }

  return true
}
