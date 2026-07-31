import { useEffect, useState } from 'react'
import {
  cancelConcessionOrder,
  confirmConcessionOrderPayment,
  rejectConcessionOrderPayment,
  subscribeToConcessionOrdersPendingPayment,
} from '../../firebase/concessions'
import type { ConcessionOrder } from '../../types/concessions'
import { CONCESSION_PAYMENT_PHASE_LABELS } from '../../types/concessions'
import { formatMinorUnits } from '../../utils/concessionsMoney'
import { PAYMENT_METHOD_LABELS } from '../../utils/paymentMethods'
import { AccessibleButton } from '../accessibility/AccessibleButton'
import { AccessibleField } from '../accessibility/AccessibleField'
import { AccessibleModal } from '../accessibility/AccessibleModal'
import { DialogFooter } from '../DialogFooter'
import { ConfirmDialog } from '../ConfirmDialog'
import { LoadingInline } from '../LoadingInline'
import { IconInbox } from '../accessibility/AccessibleIcon'

interface Props {
  eventId: string
}

// Bandeja de pedidos pendientes de pago (awaiting_payment/proof_submitted) —
// subscribeToConcessionOrdersPendingPayment ya viene ordenada por antigüedad
// (los que necesitan atención primero, ver src/firebase/concessions.ts).
// Requiere confirmPayments O manageConcessions (ver ConcessionsManager) —
// nunca el Menu Manager, que no tiene ningún permiso sobre esta colección.
export function ConcessionOrdersPanel({ eventId }: Props) {
  const [orders, setOrders] = useState<ConcessionOrder[] | null>(null)
  const [rejectingOrder, setRejectingOrder] = useState<ConcessionOrder | null>(null)
  const [cancellingOrder, setCancellingOrder] = useState<ConcessionOrder | null>(null)
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    return subscribeToConcessionOrdersPendingPayment(eventId, setOrders, () => setActionError('No se pudieron cargar los pedidos.'))
  }, [eventId])

  async function handleConfirm(order: ConcessionOrder) {
    setActionError('')
    setBusyOrderId(order.id)
    try {
      await confirmConcessionOrderPayment(eventId, order.id)
    } catch {
      setActionError('No se pudo confirmar el pago. Intenta de nuevo.')
    } finally {
      setBusyOrderId(null)
    }
  }

  async function handleCancel() {
    if (!cancellingOrder) return
    setActionError('')
    setBusyOrderId(cancellingOrder.id)
    try {
      await cancelConcessionOrder(eventId, cancellingOrder.id, 'organizer_cancelled')
    } catch {
      setActionError('No se pudo cancelar el pedido. Intenta de nuevo.')
    } finally {
      setBusyOrderId(null)
      setCancellingOrder(null)
    }
  }

  if (orders === null) return <LoadingInline label="Cargando pedidos…" />

  return (
    <div>
      {actionError && <p className="text-sm text-red-500 mb-3">{actionError}</p>}

      {orders.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <IconInbox className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">No hay pedidos pendientes de pago.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3.5 bg-white dark:bg-gray-800">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white text-sm">{order.guestNameSnapshot}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{CONCESSION_PAYMENT_PHASE_LABELS[order.paymentPhase]}</p>
                </div>
                <p className="font-semibold text-gray-900 dark:text-white text-sm shrink-0">
                  {formatMinorUnits(order.totalMinorUnits, order.currency)}
                </p>
              </div>

              <ul className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                {order.items.map((line, i) => (
                  <li key={i}>{line.quantity}× {line.nameSnapshot}</li>
                ))}
              </ul>

              {order.paymentMethod && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Método: {PAYMENT_METHOD_LABELS[order.paymentMethod]}
                </p>
              )}
              {order.paymentNote && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Referencia: {order.paymentNote}</p>
              )}
              {order.paymentProofUrl && (
                <a
                  href={order.paymentProofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Ver comprobante
                </a>
              )}

              <div className="flex gap-2 mt-3">
                <AccessibleButton size="sm" loading={busyOrderId === order.id} onClick={() => handleConfirm(order)} className="flex-1">
                  Confirmar pago
                </AccessibleButton>
                {order.paymentPhase === 'proof_submitted' && (
                  <AccessibleButton size="sm" variant="danger-outline" onClick={() => setRejectingOrder(order)} className="flex-1">
                    Rechazar
                  </AccessibleButton>
                )}
                <AccessibleButton size="sm" variant="text" className="text-gray-400 hover:text-red-500" onClick={() => setCancellingOrder(order)}>
                  Cancelar
                </AccessibleButton>
              </div>
            </div>
          ))}
        </div>
      )}

      <RejectOrderModal
        eventId={eventId}
        order={rejectingOrder}
        onClose={() => setRejectingOrder(null)}
      />

      <ConfirmDialog
        open={!!cancellingOrder}
        title="Cancelar pedido"
        message={`¿Cancelar el pedido de ${cancellingOrder?.guestNameSnapshot}? Esto libera el stock reservado.`}
        confirmLabel="Cancelar pedido"
        danger
        onConfirm={handleCancel}
        onCancel={() => setCancellingOrder(null)}
      />
    </div>
  )
}

// Modal chico para el motivo de rechazo — rejectConcessionOrderPayment
// exige un string no vacío (src/firebase/concessions.ts), así que a
// diferencia de "Confirmar"/"Cancelar" no alcanza con un botón directo.
function RejectOrderModal({ eventId, order, onClose }: { eventId: string; order: ConcessionOrder | null; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!order) return null

  async function handleSubmit() {
    if (!order) return
    if (!reason.trim()) {
      setError('Contale al invitado por qué se rechazó el comprobante.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await rejectConcessionOrderPayment(eventId, order.id, reason.trim())
      setReason('')
      onClose()
    } catch {
      setError('No se pudo rechazar el comprobante. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AccessibleModal open={!!order} onClose={onClose} label="Rechazar comprobante" maxWidth="sm:max-w-sm">
      <div className="p-6 pb-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Rechazar comprobante</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          {order.guestNameSnapshot} podrá volver a subir un comprobante después de leer este motivo.
        </p>
        <AccessibleField label="Motivo" id="reject-order-reason" required error={error}>
          {(fieldProps) => (
            <textarea
              {...fieldProps}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="No coincide el monto depositado"
              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white dark:focus:bg-gray-800 transition-colors"
            />
          )}
        </AccessibleField>
      </div>
      <DialogFooter>
        <AccessibleButton variant="secondary" onClick={onClose} className="flex-1">Cancelar</AccessibleButton>
        <AccessibleButton variant="danger" loading={saving} onClick={handleSubmit} className="flex-1">Rechazar</AccessibleButton>
      </DialogFooter>
    </AccessibleModal>
  )
}
