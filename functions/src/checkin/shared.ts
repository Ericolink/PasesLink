// Helpers compartidos por checkIn.ts/checkOut.ts/confirmPaymentAndCheckIn.ts.
// Portados desde src/firebase/guests.ts (functions/src/ es standalone, no
// importa nada de src/ — mismo criterio ya usado en payments/confirmPayment.ts
// para partySizeFromRaw).
import type { DocumentData, Timestamp } from 'firebase-admin/firestore'

export type GuestPresence = 'invited' | 'inside' | 'temp_out' | 'final_out'

// Copia exacta de src/firebase/guests.ts:guestPresence — único punto que
// deriva presencia a partir de status+checkedOutAt+exitType.
export function guestPresence(guest: {
  status?: unknown
  checkedOutAt?: unknown
  exitType?: unknown
}): GuestPresence {
  if (guest.status !== 'checked_in') return 'invited'
  if (!guest.checkedOutAt) return 'inside'
  return guest.exitType === 'final' ? 'final_out' : 'temp_out'
}

// Índices de personas de ESTA invitación que ya hicieron check-in alguna vez
// (0 = invitado principal, 1..N = companions[i-1] — el mismo índice que usa
// MenuSummary/GuestEditModal para direccionar un acompañante puntual, nunca
// un id propio porque `companions` no lo tiene). `guest.presentIndices` es la
// fuente de verdad para invitados creados con este campo; los invitados
// `status: 'checked_in'` de ANTES de esta migración (partial check-in) nunca
// lo tienen — se interpretan como "toda la invitación ya había entrado
// completa" (única semántica que existía antes), no como "nadie entró", para
// no perder asistencia ya registrada. Filtra valores fuera de rango: un
// documento corrupto o manipulado no debe poder inflar el conteo de personas
// presentes más allá de partySize.
export function presentIndicesOf(guest: { presentIndices?: unknown; status?: unknown }, total: number): number[] {
  if (Array.isArray(guest.presentIndices)) {
    return guest.presentIndices.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < total)
  }
  if (guest.status === 'checked_in') return Array.from({ length: total }, (_, i) => i)
  return []
}

export type CheckInPlan =
  | { kind: 'already_complete' }
  | { kind: 'needs_selection'; pending: number[] }
  | { kind: 'apply'; newIndices: number[]; merged: number[] }

// Único punto que decide qué hace un escaneo de entrada con la invitación ya
// leída (fresca, dentro de la transacción) — compartido por checkIn.ts y
// confirmPaymentAndCheckIn.ts para no duplicar esta máquina de estados.
// `selection` ausente = "sondeo": no escribe nada, solo informa qué falta
// (o completa sola una invitación de 1 sola persona, donde no hay nada que
// elegir). `selection` presente = confirmación del encargado: se filtran acá
// mismo los índices fuera de rango o ya presentes (idempotente — un reintento
// de red con la misma selección no duplica a nadie), nunca se confía en que
// el cliente ya los haya filtrado.
export function planCheckIn(guest: { presentIndices?: unknown; status?: unknown }, total: number, selection: number[] | undefined): CheckInPlan {
  const existing = presentIndicesOf(guest, total)
  const pending = Array.from({ length: total }, (_, i) => i).filter((i) => !existing.includes(i))
  if (pending.length === 0) return { kind: 'already_complete' }

  if (selection === undefined) {
    if (total === 1) return { kind: 'apply', newIndices: [0], merged: [0] }
    return { kind: 'needs_selection', pending }
  }

  const newIndices = selection.filter((i) => Number.isInteger(i) && i >= 0 && i < total && !existing.includes(i))
  if (newIndices.length === 0) return { kind: 'needs_selection', pending }
  return { kind: 'apply', newIndices, merged: [...existing, ...newIndices].sort((a, b) => a - b) }
}

function toMillisOrNull(value: unknown): number | null {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as Timestamp).toMillis()
  }
  if (typeof value === 'number') return value
  return null
}

function normalizeCompanions(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.map((c) => ({
      name: (c as Record<string, unknown>)?.name || '',
      lastName: (c as Record<string, unknown>)?.lastName || '',
      phone: (c as Record<string, unknown>)?.phone || '',
      phoneCountry: (c as Record<string, unknown>)?.phoneCountry || '',
      menuSelection: (c as Record<string, unknown>)?.menuSelection || undefined,
    }))
  }
  if (typeof value === 'number' && value > 0) {
    return Array.from({ length: value }, () => ({}))
  }
  return []
}

// Mapea el documento crudo del invitado (ya con las escrituras de esta
// transacción aplicadas EN MEMORIA) a la misma forma que produce mapGuest()
// del lado del cliente — el objeto que viaja de vuelta por la Callable debe
// tener exactamente esos campos (con Timestamps convertidos a millis) para
// que Scanner.tsx/GuestPass.tsx puedan seguir leyendo result.guest.* sin
// cambios.
export function mapGuestForResponse(id: string, data: DocumentData): Record<string, unknown> {
  const companions = normalizeCompanions(data.companions)
  return {
    id,
    name: data.name,
    lastName: data.lastName || '',
    phone: data.phone || '',
    phoneCountry: data.phoneCountry || '',
    qrToken: data.qrToken,
    status: data.status,
    companions,
    presentIndices: presentIndicesOf(data, 1 + companions.length),
    isGroup: data.isGroup || false,
    rsvpStatus: data.rsvpStatus || 'pending',
    checkedInAt: toMillisOrNull(data.checkedInAt),
    checkedInBy: data.checkedInBy || null,
    checkedInByEmail: data.checkedInByEmail || null,
    checkedOutAt: toMillisOrNull(data.checkedOutAt),
    checkedOutByEmail: data.checkedOutByEmail || null,
    exitType: data.exitType || null,
    lockToken: data.lockToken || null,
    lockTokens: Array.isArray(data.lockTokens) ? data.lockTokens : undefined,
    customData: data.customData || undefined,
    tags: Array.isArray(data.tags) ? data.tags : undefined,
    menuSelection: data.menuSelection || undefined,
    paymentStatus: data.paymentStatus || 'unpaid',
    paymentMethod: data.paymentMethod || null,
    paymentNote: data.paymentNote || undefined,
    paidAt: typeof data.paidAt === 'number' ? data.paidAt : null,
    paidBy: data.paidBy || null,
    guestUid: data.guestUid || null,
    guestPhotoURL: data.guestPhotoURL || null,
    createdAt: toMillisOrNull(data.createdAt) || 0,
  }
}

// Bucket de EventData.checkinsByHour ("20:00" = 20:00-20:59) — a diferencia
// del cliente (que usaba la hora local del dispositivo porque
// serverTimestamp() es un sentinel no legible dentro de la transacción),
// acá `new Date()` YA es la hora real del servidor.
export function checkinHourLabel(): string {
  return `${new Date().getHours().toString().padStart(2, '0')}:00`
}
