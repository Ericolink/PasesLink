import type { ReactionType } from '../types'

// Único lugar que enumera los tipos de reacción disponibles — agregar una
// reacción nueva es sumar un entry acá (y al ReactionType de src/types) y
// nada más: el picker, los contadores y el "más usadas" ya iteran sobre
// esta lista sin asumir cuántas ni cuáles hay.
export const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: 'like', emoji: '👍', label: 'Me gusta' },
  { type: 'love', emoji: '❤️', label: 'Me encanta' },
  { type: 'haha', emoji: '😂', label: 'Me divierte' },
  { type: 'wow', emoji: '😮', label: 'Me sorprende' },
  { type: 'sad', emoji: '😢', label: 'Me entristece' },
  { type: 'angry', emoji: '😠', label: 'Me molesta' },
]

export const REACTION_BY_TYPE = new Map(REACTIONS.map((r) => [r.type, r]))
