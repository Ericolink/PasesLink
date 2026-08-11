import { httpsCallable } from 'firebase/functions'
import { functions } from './config'

// Wrappers finos de las dos Cloud Functions que manejan el ciclo de vida
// completo del enlace de invitación de coorganizador (crear/canjear) — ver
// functions/src/callable/createCoOrganizerInvite.ts y
// acceptCoOrganizerInvite.ts. Sin validación de forma del lado del cliente:
// ambas llamadas no llevan datos de usuario que valga la pena chequear antes
// del viaje de red (a diferencia de un formulario con texto libre).

export type CreateCoOrganizerInviteResult =
  | { status: 'success'; token: string; expiresAt: number }
  | { status: 'full' }

export async function createCoOrganizerInvite(eventId: string): Promise<CreateCoOrganizerInviteResult> {
  const callable = httpsCallable<{ eventId: string }, CreateCoOrganizerInviteResult>(functions, 'createCoOrganizerInvite')
  const result = await callable({ eventId })
  return result.data
}

export type AcceptCoOrganizerInviteResult =
  | { status: 'success'; eventName: string }
  | { status: 'already_member'; eventName: string }
  | { status: 'expired' }
  | { status: 'used' }
  | { status: 'not_found' }
  | { status: 'full' }

export async function acceptCoOrganizerInvite(eventId: string, token: string): Promise<AcceptCoOrganizerInviteResult> {
  const callable = httpsCallable<{ eventId: string; token: string }, AcceptCoOrganizerInviteResult>(functions, 'acceptCoOrganizerInvite')
  const result = await callable({ eventId, token })
  return result.data
}

// Enlace corto que se comparte/muestra en QR — construido acá para que
// CoOrganizerPanel.tsx y AcceptCoOrganizerInvite.tsx (que lo parsea de la
// URL) siempre coincidan en el mismo formato.
export function buildCoOrganizerInviteUrl(eventId: string, token: string): string {
  return `${window.location.origin}/co/${eventId}/${token}`
}
