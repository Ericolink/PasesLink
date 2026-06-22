import { ORNAMENTS } from '../templates/ornaments'
import type { TemplateId } from '../types'

interface Props {
  templateId?: TemplateId
  className?: string
}

export function ThemeOrnament({ templateId, className = 'w-16 h-6 mx-auto text-[var(--invite-accent)]' }: Props) {
  const Ornament = templateId ? ORNAMENTS[templateId] : undefined
  if (!Ornament) return null
  return <Ornament className={className} />
}
