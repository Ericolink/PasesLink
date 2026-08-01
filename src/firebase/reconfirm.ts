// Reconfirmación de asistencia (ver WAITLIST_RECONFIRMATION_ARCHITECTURE.md,
// Fase 2). Iniciar una campaña es una Callable Function (fan-out sobre
// potencialmente cientos de invitados) — todo lo demás acá son escrituras
// de cliente de un solo documento, mismo criterio que ya usa el resto de
// guests.ts (setGuestRsvp, submitPaymentProof): el id de Firestore
// (impredecible) es la barrera real, no un token aparte.
import { doc, updateDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './config'
import type { ReminderRule } from '../types'

// El propio invitado, desde su pase — mismo criterio de confianza que
// setGuestRsvp (resolver el guestId ya es la barrera real).
export async function confirmMyAttendance(eventId: string, guestId: string): Promise<void> {
  await updateDoc(doc(db, 'events', eventId, 'guests', guestId), { reconfirmStatus: 'confirmed' })
}

// El organizador, desde ReconfirmPanel — vuelve a poner "en espera" con un
// plazo nuevo, sin pasar por la Callable (mismo motivo que "mover al
// frente" en waitlist.ts: un solo doc, de bajo riesgo, gateado por rules).
export async function giveMoreTime(eventId: string, guestId: string, newDeadline: number): Promise<void> {
  await updateDoc(doc(db, 'events', eventId, 'guests', guestId), {
    reconfirmStatus: 'requested',
    reconfirmDeadline: newDeadline,
  })
}

interface StartReconfirmCampaignInput {
  eventId: string
  deadline: number
  excludeTagIds: string[]
  reminderRules: ReminderRule[]
}

// Fan-out sobre potencialmente cientos de guests — Callable Function, no
// una escritura de cliente (ver functions/src/callable/startReconfirmCampaign.ts).
export async function startReconfirmCampaign(input: StartReconfirmCampaignInput): Promise<{ targeted: number }> {
  const callable = httpsCallable<StartReconfirmCampaignInput, { targeted: number }>(functions, 'startReconfirmCampaign')
  const result = await callable(input)
  return result.data
}
