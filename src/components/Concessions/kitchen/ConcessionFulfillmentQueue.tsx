import { useEffect, useState } from 'react'
import { advanceConcessionFulfillment, revertConcessionFulfillment, subscribeToConcessionFulfillmentQueue } from '../../../firebase/concessions'
import type { ConcessionFulfillment, FulfillmentStatus } from '../../../types/concessions'
import { FULFILLMENT_STATUS_LABELS } from '../../../types/concessions'
import { AccessibleButton } from '../../accessibility/AccessibleButton'
import { LoadingInline } from '../../LoadingInline'
import { IconInbox } from '../../accessibility/AccessibleIcon'

interface Props {
  eventId: string
}

const NEXT_ACTION_LABEL: Partial<Record<FulfillmentStatus, string>> = {
  queued: 'Empezar a preparar',
  preparing: 'Marcar listo',
  ready: 'Marcar entregado',
}

// Cola del Menu Manager — SIN dinero, SIN comprobante (ver
// FOOD_BEVERAGE_ORDERING_ARCHITECTURE.md §4.3): esta pantalla solo lee/
// escribe `concessionsFulfillment`, nunca `concessionsOrders`. Ordenada por
// antigüedad (subscribeToConcessionFulfillmentQueue ya trae solo
// queued/preparing/ready — un pedido sin pagar ('not_ready') ni siquiera es
// legible acá, ver firestore.rules).
export function ConcessionFulfillmentQueue({ eventId }: Props) {
  const [orders, setOrders] = useState<ConcessionFulfillment[] | null>(null)
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    return subscribeToConcessionFulfillmentQueue(eventId, setOrders, () => setActionError('No se pudieron cargar los pedidos.'))
  }, [eventId])

  async function handleAdvance(order: ConcessionFulfillment) {
    setActionError('')
    setBusyOrderId(order.id)
    try {
      await advanceConcessionFulfillment(eventId, order.id)
    } catch (err) {
      console.error('Error al avanzar un pedido en la cola de cocina:', err)
      setActionError('No se pudo actualizar el pedido. Intenta de nuevo.')
    } finally {
      setBusyOrderId(null)
    }
  }

  async function handleRevert(order: ConcessionFulfillment) {
    setActionError('')
    setBusyOrderId(order.id)
    try {
      await revertConcessionFulfillment(eventId, order.id)
    } catch (err) {
      console.error('Error al deshacer un paso en la cola de cocina:', err)
      setActionError('No se pudo deshacer el paso. Intenta de nuevo.')
    } finally {
      setBusyOrderId(null)
    }
  }

  if (orders === null) return <LoadingInline label="Cargando pedidos…" />

  if (orders.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <IconInbox className="w-8 h-8 mx-auto mb-2" />
        <p className="text-sm">No hay pedidos pendientes de preparar.</p>
      </div>
    )
  }

  return (
    <div>
      {actionError && <p className="text-sm text-red-500 mb-3">{actionError}</p>}
      <div className="space-y-3">
        {orders.map((order) => (
          <div key={order.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3.5 bg-white dark:bg-gray-800">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div>
                <p className="font-medium text-gray-900 dark:text-white text-sm">Pedido #{order.orderNumber}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{order.guestNameSnapshot}</p>
              </div>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">
                {FULFILLMENT_STATUS_LABELS[order.fulfillmentStatus]}
              </span>
            </div>
            <ul className="text-sm text-gray-700 dark:text-gray-300 mb-3">
              {order.lines.map((line, i) => (
                <li key={i}>{line.quantity}× {line.nameSnapshot}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <AccessibleButton size="sm" loading={busyOrderId === order.id} onClick={() => handleAdvance(order)} className="flex-1">
                {NEXT_ACTION_LABEL[order.fulfillmentStatus] || 'Avanzar'}
              </AccessibleButton>
              {order.fulfillmentStatus !== 'queued' && (
                <AccessibleButton size="sm" variant="text" className="text-gray-400 hover:text-gray-600" onClick={() => handleRevert(order)}>
                  Deshacer
                </AccessibleButton>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
