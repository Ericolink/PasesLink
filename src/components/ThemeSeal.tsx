import { SEALS } from '../templates/seals'
import type { TemplateId } from '../types'

interface Props {
  templateId?: TemplateId
  className?: string
}

// El sello es una marca de validación secundaria, no un logotipo de la
// plantilla: solo se monta si el tema activo define uno (SEALS) y
// únicamente junto a un texto de logro real (RSVP/pago/check-in
// confirmados, mensaje fijado) — nunca en el hero, botones, divisores,
// tarjetas o el mapa. Tamaño único y fijo (ver .invite-seal en
// templates.css): a propósito no recibe una prop de escala — un sello no
// "crece" para el momento más importante. Decorativo puro: el logro
// siempre tiene también su texto ("Asistencia confirmada", etc.), por eso
// aria-hidden.
export function ThemeSeal({ templateId, className = '' }: Props) {
  const hasSeal = templateId ? SEALS[templateId] : false
  if (!hasSeal) return null
  return <span aria-hidden="true" className={`invite-seal ${className}`} />
}
