import { useEffect, useState } from 'react'
import { cancelOwnConcessionOrder, subscribeToConcessionFulfillment, subscribeToConcessionOrder } from '../../../firebase/concessions'
import type { ConcessionFulfillment, ConcessionOrder } from '../../../types/concessions'
import { formatMinorUnits } from '../../../utils/concessionsMoney'
import { ConfirmDialog } from '../../ConfirmDialog'
import { IconAlertTriangle, IconCheckCircle, IconClock, IconXCircle } from '../../accessibility/AccessibleIcon'
import type { ComponentType } from 'react'

interface Props {
  eventId: string
  orderId: string
  lockToken: string | null
}

interface StatusDescription {
  label: string
  tone: 'neutral' | 'success' | 'danger'
  Icon: ComponentType<{ className?: string }>
}

// Combina paymentPhase (concessionsOrders) + fulfillmentStatus
// (concessionsFulfillment) en un único estado legible — de cara al
// invitado es un solo avance lineal (ver RFC §5), aunque técnicamente
// viven en dos documentos separados por seguridad (ver
// FOOD_BEVERAGE_ORDERING_ARCHITECTURE.md §4.3). El estado nunca depende
// solo del color (WCAG 1.4.1): siempre lleva también texto + ícono.
function describeStatus(order: ConcessionOrder, fulfillment: ConcessionFulfillment | null): StatusDescription {
  if (order.paymentPhase === 'cancelled') return { label: 'Pedido cancelado', tone: 'danger', Icon: IconXCircle }
  if (order.paymentPhase === 'rejected') return { label: 'Tu pago no fue confirmado — habla con caja', tone: 'danger', Icon: IconAlertTriangle }
  if (order.paymentPhase === 'awaiting_payment') return { label: 'Pago pendiente — acude a caja', tone: 'neutral', Icon: IconClock }
  // 'proof_submitted' solo puede verse en pedidos anteriores a este cambio
  // (ya no hay forma de llegar a esta fase desde la app) — se muestra igual
  // por si algún pedido viejo quedó ahí.
  if (order.paymentPhase === 'proof_submitted') return { label: 'Comprobante enviado — esperando confirmación', tone: 'neutral', Icon: IconClock }
  switch (fulfillment?.fulfillmentStatus) {
    case 'preparing':
      return { label: 'En preparación', tone: 'neutral', Icon: IconClock }
    case 'ready':
      return { label: '¡Listo! Pasa a recogerlo', tone: 'success', Icon: IconCheckCircle }
    case 'delivered':
      return { label: 'Entregado', tone: 'success', Icon: IconCheckCircle }
    case 'cancelled':
      return { label: 'Pedido cancelado', tone: 'danger', Icon: IconXCircle }
    default:
      return { label: 'Pago confirmado — en cola para prepararse', tone: 'success', Icon: IconCheckCircle }
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

  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    return subscribeToConcessionOrder(eventId, orderId, setOrder)
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

  const canCancel = order.paymentPhase === 'awaiting_payment' || order.paymentPhase === 'rejected'
  const status = describeStatus(order, fulfillment)

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
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-semibold text-[var(--invite-text)]">Tu pedido</p>
        <span className="text-sm font-semibold text-[var(--invite-text)]">{formatMinorUnits(order.totalMinorUnits, order.currency)}</span>
      </div>

      <ul className="text-sm text-[var(--invite-text-muted)] mb-2">
        {order.items.map((line, i) => (
          <li key={i}>{line.quantity}× {line.nameSnapshot}</li>
        ))}
      </ul>

      <p className={`flex items-center gap-1.5 text-sm font-medium ${TONE_CLASS[status.tone]}`}>
        <status.Icon className="w-4 h-4 shrink-0" />
        {status.label}
      </p>
      {order.paymentPhase === 'rejected' && order.rejectionReason && (
        <p className="text-xs text-[var(--invite-text-muted)] mt-1 italic">Motivo: {order.rejectionReason}</p>
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
