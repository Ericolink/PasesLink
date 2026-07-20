import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { submitPaymentProof } from '../firebase/guests'
import type { GuestData } from '../types'

// Extraído de GuestPass.tsx (auditoría de escalabilidad, hallazgo F13):
// acción del invitado "Ya pagué / Comprobante enviado" — pasa a esperar que
// el organizador lo apruebe o lo rechace (ver submitPaymentProof en
// firebase/guests.ts). Sin límite de tiempo. `setGuest` se recibe del
// llamador porque `guest` sigue siendo estado compartido con el resto de
// GuestPassInner (RSVP, check-in), no algo que este hook deba dueñar.
export function usePaymentProof(
  eventId: string | undefined,
  guestId: string | undefined,
  setGuest: Dispatch<SetStateAction<GuestData | null>>,
) {
  const [proofNote, setProofNote] = useState('')
  const [proofFormOpen, setProofFormOpen] = useState(false)
  const [proofSubmitting, setProofSubmitting] = useState(false)
  const [proofError, setProofError] = useState<string | null>(null)

  async function handleSubmitProof() {
    if (!eventId || !guestId) return
    if (!proofNote.trim()) {
      setProofError('Ingresá el número de referencia de tu transferencia.')
      return
    }
    setProofSubmitting(true)
    setProofError(null)
    try {
      await submitPaymentProof(eventId, guestId, proofNote)
      setGuest((g) => g ? { ...g, paymentStatus: 'pending_confirmation', paymentNote: proofNote.trim() } : g)
      setProofFormOpen(false)
    } catch (err) {
      console.error('Error submitting payment proof:', err)
      setProofError('No se pudo enviar. Intenta de nuevo.')
    } finally {
      setProofSubmitting(false)
    }
  }

  return {
    proofNote,
    setProofNote,
    proofFormOpen,
    setProofFormOpen,
    proofSubmitting,
    proofError,
    handleSubmitProof,
  }
}
