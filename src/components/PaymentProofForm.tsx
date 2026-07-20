import type { GuestData } from '../types'
import type { usePaymentProof } from '../hooks/usePaymentProof'
import { canSubmitPaymentProof } from '../firebase/guests'

interface Props {
  guest: GuestData
  proof: ReturnType<typeof usePaymentProof>
}

// Extraído de GuestPass.tsx junto con usePaymentProof (auditoría de
// escalabilidad, hallazgo F13). Independiente del botón de WhatsApp que
// sigue en GuestPass.tsx: este marca el estado en la app, WhatsApp sigue
// siendo el canal para mandar la imagen real del comprobante.
export function PaymentProofForm({ guest, proof }: Props) {
  const { proofNote, setProofNote, proofFormOpen, setProofFormOpen, proofSubmitting, proofError, handleSubmitProof } = proof

  if (!canSubmitPaymentProof(guest)) return null

  return (
    <div className="mt-3">
      {!proofFormOpen ? (
        <button
          onClick={() => setProofFormOpen(true)}
          className="w-full border rounded-md px-4 py-3 text-sm font-semibold hover:opacity-80 transition-opacity text-[var(--invite-accent)]"
          style={{ borderColor: 'var(--invite-accent)' }}
        >
          Ya pagué / Comprobante enviado
        </button>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-[var(--invite-text-muted)]">
            Número de referencia de tu transferencia *
          </label>
          <input
            type="text"
            required
            value={proofNote}
            onChange={(e) => setProofNote(e.target.value)}
            maxLength={300}
            placeholder="Ej: op. 123456789"
            className="w-full rounded-md border px-3 py-2 text-sm bg-[var(--invite-surface)] text-[var(--invite-text)]"
            style={{ borderColor: 'var(--invite-border)' }}
          />
          <p className="text-xs text-[var(--invite-text-muted)]">
            Lo va a ver el organizador para poder cotejarlo con su resumen bancario.
          </p>
          {proofError && <p className="text-xs text-red-600">{proofError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSubmitProof}
              disabled={proofSubmitting || !proofNote.trim()}
              className="flex-1 text-white rounded-md px-4 py-3 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 bg-[var(--invite-accent)]"
            >
              {proofSubmitting ? 'Enviando…' : 'Confirmar'}
            </button>
            <button
              onClick={() => setProofFormOpen(false)}
              disabled={proofSubmitting}
              className="border rounded-md px-4 py-3 text-sm font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
              style={{ borderColor: 'var(--invite-border)' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
