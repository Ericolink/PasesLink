import type { FeedbackCategory } from '../types'
import { IconBan, IconBug, IconHelpCircle, IconLightbulb, IconMessageSquare, IconSparkles, IconStar } from './Icons'

// Único mapeo categoría → ícono, compartido por el formulario público
// (Feedback.tsx) y el panel de administración (AdminFeedbackTable/Detail) —
// evita mantener el mismo Record duplicado en ambos lugares.
const CATEGORY_ICONS: Record<FeedbackCategory, React.FC<{ className?: string }>> = {
  suggestion: IconLightbulb,
  bug: IconBug,
  comment: IconMessageSquare,
  question: IconHelpCircle,
  inappropriate: IconBan,
  feature_request: IconStar,
  other: IconSparkles,
}

export function FeedbackCategoryIcon({ category, className = 'w-5 h-5' }: { category: FeedbackCategory; className?: string }) {
  const Icon = CATEGORY_ICONS[category]
  return <Icon className={className} />
}
