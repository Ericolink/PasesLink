// Únicos placements de publicidad que existen en PaseLink (fase 1, ver
// AD_PLACEMENTS_AUDIT en la propuesta aprobada 2026-08-14). Agregar uno
// nuevo acá es la única forma de habilitarlo — Firestore (platformConfig/ads)
// y el panel de admin (AdsPanel) leen esta misma lista, así que nunca quedan
// desincronizados entre sí.
export type AdPlacement = 'landing-bottom' | 'invitation-bottom'

export const AD_PLACEMENTS: readonly AdPlacement[] = ['landing-bottom', 'invitation-bottom']

export const AD_PLACEMENT_LABELS: Record<AdPlacement, string> = {
  'landing-bottom': 'Landing (antes del pie de página)',
  'invitation-bottom': 'Invitación pública (después del muro, antes del logo)',
}
