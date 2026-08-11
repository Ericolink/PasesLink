import type { GuestData } from '../types'
import { presentIndicesOf } from '../firebase/guests'

export type CheckInPerson = { index: number; label: string }

export type PendingCheckInSelection = {
  qrToken: string
  guestName: string
  // Ya ingresaron en un escaneo anterior de esta misma invitación — se
  // muestran tildados y deshabilitados, no forman parte de la selección que
  // se manda al servidor (reenviarlos no rompe nada, ver planCheckIn en
  // functions/src/checkin/shared.ts, pero no tiene sentido ofrecer
  // destildarlos desde acá).
  alreadyIn: CheckInPerson[]
  // Personas que todavía no entraron — todas empiezan tildadas: "Confirmar"
  // sin tocar nada equivale a "Sí, vienen todos". Destildar antes de
  // confirmar es "No, faltan personas" con selección exacta de quién sí.
  pending: CheckInPerson[]
}

// Etiqueta de una persona dentro de una invitación (0 = invitado principal,
// 1..N = companions[i-1], mismo índice que usa el servidor — ver planCheckIn
// en functions/src/checkin/shared.ts). Los acompañantes de un grupo/familia
// (GuestAddForm.tsx: isGroup) no tienen nombre propio, así que caen al
// fallback numerado. Usado tanto por CheckInSelectionModal.tsx como por
// buildPendingSelection acá abajo — vive en su propio archivo (no en el
// componente) porque `react-refresh/only-export-components` no permite
// exportar funciones sueltas desde un archivo que también exporta un
// componente de React.
export function personLabel(guest: GuestData, index: number): string {
  if (index === 0) {
    if (guest.isGroup) return guest.name
    return `${guest.name} ${guest.lastName || ''}`.trim() || 'Invitado principal'
  }
  const companion = guest.companions[index - 1]
  const full = `${companion?.name || ''} ${companion?.lastName || ''}`.trim()
  return full || `${guest.isGroup ? 'Integrante' : 'Acompañante'} ${index + 1}`
}

export function buildPendingSelection(qrToken: string, guest: GuestData, pendingIndices: number[]): PendingCheckInSelection {
  const present = new Set(presentIndicesOf(guest))
  const total = 1 + guest.companions.length
  const alreadyIn = Array.from({ length: total }, (_, i) => i)
    .filter((i) => present.has(i))
    .map((index) => ({ index, label: personLabel(guest, index) }))
  const pending = pendingIndices.map((index) => ({ index, label: personLabel(guest, index) }))
  return {
    qrToken,
    guestName: guest.isGroup ? guest.name : `${guest.name} ${guest.lastName || ''}`.trim(),
    alreadyIn,
    pending,
  }
}
