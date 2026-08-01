import { useEffect, useRef, useState } from 'react'
import {
  cancelOwnConcessionOrder,
  subscribeToConcessionFulfillment,
  subscribeToConcessionOrder,
  submitConcessionPaymentProof,
} from '../../../firebase/concessions'
import type { ConcessionFulfillment, ConcessionOrder, ConcessionPaymentPhase } from '../../../types/concessions'
import { formatMinorUnits } from '../../../utils/concessionsMoney'
import { useConcessionPaymentProofPhoto } from '../../../hooks/useConcessionPaymentProofPhoto'
import { ConfirmDialog } from '../../ConfirmDialog'
import { Toast } from '../../Toast'

interface Props {
  eventId: string
  orderId: string
  lockToken: string | null
}

interface StatusDescription {
  label: string
  tone: 'neutral' | 'success' | 'danger'
}

// Combina paymentPhase (concessionsOrders) + fulfillmentStatus
// (concessionsFulfillment) en un único estado legible — de cara al
// invitado es un solo avance lineal (ver RFC §5), aunque técnicamente
// viven en dos documentos separados por seguridad (ver
// FOOD_BEVERAGE_ORDERING_ARCHITECTURE.md §4.3).
function describeStatus(order: ConcessionOrder, fulfillment: ConcessionFulfillment | null): StatusDescription {
  if (order.paymentPhase === 'cancelled') return { label: 'Pedido cancelado', tone: 'danger' }
  if (order.paymentPhase === 'rejected') return { label: 'Comprobante rechazado — vuelve a intentarlo', tone: 'danger' }
  if (order.paymentPhase === 'awaiting_payment') return { label: 'Pendiente de pago', tone: 'neutral' }
  if (order.paymentPhase === 'proof_submitted') return { label: 'Comprobante enviado — esperando confirmación', tone: 'neutral' }
  switch (fulfillment?.fulfillmentStatus) {
    case 'preparing':
      return { label: 'En preparación', tone: 'neutral' }
    case 'ready':
      return { label: '¡Listo! Pasa a recogerlo', tone: 'success' }
    case 'delivered':
      return { label: 'Entregado', tone: 'success' }
    case 'cancelled':
      return { label: 'Pedido cancelado', tone: 'danger' }
    default:
      return { label: 'Pago confirmado — en cola para prepararse', tone: 'neutral' }
  }
}

const TONE_CLASS: Record<StatusDescription['tone'], string> = {
  neutral: 'text-[var(--invite-accent)]',
  success: 'text-green-600 dark:text-green-400',
  danger: 'text-red-500',
}

export function MyConcessionOrderCard({ eventId, orderId, lockToken }: Props) {
  const [order, setOrder] = useState<ConcessionOrder | null | undefined>(undefined)
  const [fulfillment, setFulfillment] = useState<ConcessionFulfillment | null>(null)
  const [toast, setToast] = useState<{ message: string; tone: 'primary' | 'warning' } | null>(null)
  const lastPhase = useRef<ConcessionPaymentPhase | null>(null)

  const [note, setNote] = useState('')
  const [submittingProof, setSubmittingProof] = useState(false)
  const [proofError, setProofError] = useState('')
  const proofPhoto = useConcessionPaymentProofPhoto()
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    return subscribeToConcessionOrder(eventId, orderId, (next) => {
      if (next && lastPhase.current !== null && lastPhase.current !== next.paymentPhase) {
        if (next.paymentPhase === 'confirmed') setToast({ message: '¡Tu pago fue confirmado!', tone: 'primary' })
        else if (next.paymentPhase === 'rejected') setToast({ message: 'Tu comprobante fue rechazado — revisa el motivo.', tone: 'warning' })
      }
      lastPhase.current = next?.paymentPhase ?? null
      setOrder(next)
    })
  }, [eventId, orderId])

  useEffect(() => {
    return subscribeToConcessionFulfillment(eventId, orderId, setFulfillment)
  }, [eventId, orderId])

  if (order === undefined) {
    return <p className="text-sm text-[var(--invite-text-muted)]">Cargando…</p>
  }
  // Pedido borrado o inaccesible (no debería pasar en circunstancias
  // normales) — se omite en vez de romper el resto de "Mis pedidos".
  if (order === null) return null

  const canSubmitProof = order.paymentMethod === 'transfer' && (order.paymentPhase === 'awaiting_payment' || order.paymentPhase === 'rejected')
  const canCancel = order.paymentPhase === 'awaiting_payment' || order.paymentPhase === 'rejected'
  const status = describeStatus(order, fulfillment)

  async function handleSubmitProof() {
    if (!note.trim()) {
      setProofError('Ingresa el número de referencia de tu transferencia.')
      return
    }
    setSubmittingProof(true)
    setProofError('')
    try {
      const proofUrl = await proofPhoto.upload()
      await submitConcessionPaymentProof(eventId, orderId, { note: note.trim(), proofUrl, lockToken })
      proofPhoto.clear()
    } catch (err) {
      console.error('Error al enviar el comprobante de un pedido:', err)
      setProofError('No se pudo enviar el comprobante. Intenta de nuevo.')
    } finally {
      setSubmittingProof(false)
    }
  }

  async function handleCancel() {
    setConfirmingCancel(false)
    setCancelling(true)
    try {
      await cancelOwnConcessionOrder(eventId, orderId, lockToken)
    } catch (err) {
      console.error('Error al cancelar el propio pedido:', err)
      // El listener ya refleja el estado real del pedido si algo salió mal
      // (por ejemplo, el organizador lo confirmó un instante antes) — no
      // hace falta un mensaje de error aparte acá.
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="rounded-lg border p-3.5" style={{ borderColor: 'var(--invite-border)' }}>
      {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}

      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-semibold text-[var(--invite-text)]">Tu pedido</p>
        <span className="text-sm font-semibold text-[var(--invite-text)]">{formatMinorUnits(order.totalMinorUnits, order.currency)}</span>
      </div>

      <ul className="text-sm text-[var(--invite-text-muted)] mb-2">
        {order.items.map((line, i) => (
          <li key={i}>{line.quantity}× {line.nameSnapshot}</li>
        ))}
      </ul>

      <p className={`text-sm font-medium ${TONE_CLASS[status.tone]}`}>{status.label}</p>
      {order.paymentPhase === 'rejected' && order.rejectionReason && (
        <p className="text-xs text-[var(--invite-text-muted)] mt-1 italic">Motivo: {order.rejectionReason}</p>
      )}

      {canSubmitProof && (
        <div className="mt-3 pt-3 space-y-2 border-t" style={{ borderColor: 'var(--invite-border)' }}>
          <input type="file" accept="image/*" onChange={proofPhoto.onFileSelected} className="hidden" id={`concession-proof-${orderId}`} />
          {proofPhoto.previewUrl ? (
            <div className="relative w-24 h-24 rounded-lg overflow-hidden">
              <img src={proofPhoto.previewUrl} alt="Vista previa del comprobante" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={proofPhoto.clear}
                className="absolute top-1 right-1 min-h-8 min-w-8 inline-flex items-center justify-center bg-black/50 hover:bg-black/70 text-white text-xs rounded-md"
              >
                Quitar
              </button>
            </div>
          ) : (
            <label
              htmlFor={`concession-proof-${orderId}`}
              className="inline-flex w-24 h-24 items-center justify-center border-2 border-dashed rounded-lg text-xs text-center cursor-pointer text-[var(--invite-text-muted)]"
              style={{ borderColor: 'var(--invite-border)' }}
            >
              + Foto del comprobante
            </label>
          )}
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="Núm. de referencia de tu transferencia"
            className="w-full rounded-md border px-3 py-2 text-sm bg-[var(--invite-surface)] text-[var(--invite-text)]"
            style={{ borderColor: 'var(--invite-border)' }}
          />
          {(proofError || proofPhoto.error) && <p className="text-xs text-red-500">{proofError || proofPhoto.error}</p>}
          <button
            onClick={handleSubmitProof}
            disabled={submittingProof || proofPhoto.uploading || !proofPhoto.file}
            className="w-full text-white rounded-md px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 bg-[var(--invite-accent)]"
          >
            {submittingProof || proofPhoto.uploading ? 'Enviando…' : 'Enviar comprobante'}
          </button>
        </div>
      )}

      {canCancel && (
        <button
          onClick={() => setConfirmingCancel(true)}
          disabled={cancelling}
          className="mt-3 text-xs text-[var(--invite-text-muted)] hover:text-red-500 active:text-red-500 underline underline-offset-2 transition-colors disabled:opacity-50"
        >
          Cancelar este pedido
        </button>
      )}

      <ConfirmDialog
        open={confirmingCancel}
        title="Cancelar pedido"
        message="¿Seguro que quieres cancelar este pedido?"
        confirmLabel="Cancelar pedido"
        danger
        onConfirm={handleCancel}
        onCancel={() => setConfirmingCancel(false)}
      />
    </div>
  )
}
