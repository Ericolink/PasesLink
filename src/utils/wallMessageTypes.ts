import { IconMessageSquare, IconHelpCircle, IconMusic, IconLightbulb } from '../components/Icons'
import type { WallMessageType } from '../types'

export interface WallTypeConfig {
  label: string
  Icon: React.FC<{ className?: string }>
  color: string
}

// Única fuente de verdad para los 4 tipos de publicación del muro — antes
// definida por duplicado, con los mismos valores, en WallSection.tsx (widget
// embebido) y EventWall.tsx (vista completa).
export const WALL_TYPE_CONFIG: Record<WallMessageType, WallTypeConfig> = {
  comment:  { label: 'Comentario', Icon: IconMessageSquare, color: 'bg-blue-100 text-blue-700' },
  question: { label: 'Pregunta',   Icon: IconHelpCircle,    color: 'bg-yellow-100 text-yellow-700' },
  music:    { label: 'Música',     Icon: IconMusic,          color: 'bg-purple-100 text-purple-700' },
  idea:     { label: 'Idea',       Icon: IconLightbulb,      color: 'bg-green-100 text-green-700' },
}
