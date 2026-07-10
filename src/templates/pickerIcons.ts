import type { ComponentType } from 'react'
import type { TemplateId } from '../types'
import { IconTicket, IconHeart, IconCactus, IconGraduationCap, IconCrown, IconCake, IconParty } from '../components/Icons'

interface IconProps {
  className?: string
}

// Identificador visual de cada plantilla en TemplatePicker — mismo patrón
// que ORNAMENTS en ornaments.map.ts: un Record aparte de registry.ts, así
// registry.ts sigue siendo solo tokens de tema (color/tipografía/forma).
// Agregar una plantilla nueva = un ícono más acá (nuevo en Icons.tsx o uno
// ya existente que calce), sin tocar TemplatePicker ni TemplateIconButton.
export const PICKER_ICONS: Record<TemplateId, ComponentType<IconProps>> = {
  default: IconTicket,
  wedding: IconHeart,
  cowboy: IconCactus,
  graduation: IconGraduationCap,
  formal: IconCrown,
  kids: IconCake,
  houseparty: IconParty,
}
