import { httpsCallable } from 'firebase/functions'
import { functions } from './config'

// Wrappers finos de las dos Cloud Functions que manejan el ciclo de vida
// completo del enlace de invitación de encargado de "Ventas del evento"
// (caja/preparación) — mismo patrón que coOrganizerInvites.ts, ver
// functions/src/callable/createConcessionsStaffInvite.ts y
// acceptConcessionsStaffInvite.ts.

export type ConcessionsStaffRole = 'cashier' | 'prep'

export type CreateConcessionsStaffInviteResult =
  | { status: 'success'; token: string; expiresAt: number }
  | { status: 'full' }

export async function createConcessionsStaffInvite(eventId: string, role: ConcessionsStaffRole): Promise<CreateConcessionsStaffInviteResult> {
  const callable = httpsCallable<{ eventId: string; role: ConcessionsStaffRole }, CreateConcessionsStaffInviteResult>(functions, 'createConcessionsStaffInvite')
  const result = await callable({ eventId, role })
  return result.data
}

export type AcceptConcessionsStaffInviteResult =
  | { status: 'success'; eventName: string; role: ConcessionsStaffRole }
  | { status: 'already_member'; eventName: string; role: ConcessionsStaffRole }
  | { status: 'expired' }
  | { status: 'used' }
  | { status: 'not_found' }

export async function acceptConcessionsStaffInvite(eventId: string, token: string): Promise<AcceptConcessionsStaffInviteResult> {
  const callable = httpsCallable<{ eventId: string; token: string }, AcceptConcessionsStaffInviteResult>(functions, 'acceptConcessionsStaffInvite')
  const result = await callable({ eventId, token })
  return result.data
}

// Enlace corto que se comparte/muestra en QR — construido acá para que
// ConcessionStaffPanel.tsx y AcceptConcessionsStaffInvite.tsx (que lo parsea
// de la URL) siempre coincidan en el mismo formato.
export function buildConcessionsStaffInviteUrl(eventId: string, token: string): string {
  return `${window.location.origin}/menu-staff/${eventId}/${token}`
}
