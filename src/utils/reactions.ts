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

const MY_REACTION_KEY_PREFIX = 'paselink_myreaction_'

// Auditoría F2/F11: "mi reacción" (qué botón queda resaltado en
// ReactionPicker) vivía como una lectura de `reactions[miToken]` sobre el
// mapa embebido del mensaje/foto — ese mapa se dejó de escribir (ver
// interactions.ts) porque podía superar el límite de 1MB/documento con
// contenido viral. Como cada reacción ya es por-dispositivo (el token es un
// ID generado en localStorage, no una cuenta), guardar "mi reacción" ahí
// mismo es consistente con ese modelo — no hace falta leer nada de
// Firestore para saber qué reaccionó ESTE dispositivo.
export function getMyReaction(docId: string): ReactionType | null {
  const raw = localStorage.getItem(MY_REACTION_KEY_PREFIX + docId)
  return REACTIONS.some((r) => r.type === raw) ? (raw as ReactionType) : null
}

export function setMyReaction(docId: string, type: ReactionType | null): void {
  if (type) localStorage.setItem(MY_REACTION_KEY_PREFIX + docId, type)
  else localStorage.removeItem(MY_REACTION_KEY_PREFIX + docId)
}
