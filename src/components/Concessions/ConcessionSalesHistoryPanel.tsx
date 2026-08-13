import { useEffect, useState } from 'react'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { deleteConcessionOrder, getConcessionsSalesHistoryPage, getConcessionsSalesSummary } from '../../firebase/concessions'
import type { ConcessionOrder, FulfillmentStatus } from '../../types/concessions'
import { FULFILLMENT_STATUS_LABELS } from '../../types/concessions'
import { formatMinorUnits } from '../../utils/concessionsMoney'
import { formatDateTimeMedium } from '../../utils/time'
import { AccessibleButton } from '../accessibility/AccessibleButton'
import { ConfirmDialog } from '../ConfirmDialog'
import { LoadingInline } from '../LoadingInline'
import { IconInbox, IconTrash } from '../accessibility/AccessibleIcon'

interface Props {
  eventId: string
}

// Historial de ventas — solo pedidos `paymentPhase == 'confirmed'` (pagados
// de verdad; cancelados/rechazados/abandonados nunca aparecen acá, ver §20
// del rediseño "Ventas del evento"). Carga por página con "Cargar más" en
// vez de un listener: es historial, no cambia en tiempo real de una forma
// que valga la pena suscribirse.
export function ConcessionSalesHistoryPanel({ eventId }: Props) {
  const [summary, setSummary] = useState<{ totalMinorUnits: number; orderCount: number } | null>(null)
  const [orders, setOrders] = useState<ConcessionOrder[]>([])
  const [fulfillmentByOrderId, setFulfillmentByOrderId] = useState<Record<string, FulfillmentStatus>>({})
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [deletingOrder, setDeletingOrder] = useState<ConcessionOrder | null>(null)
  const [deleting, setDeleting] = useState(false)
  const currency = orders[0]?.currency

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([getConcessionsSalesSummary(eventId), getConcessionsSalesHistoryPage(eventId)])
      .then(([summaryResult, page]) => {
        if (cancelled) return
        setSummary(summaryResult)
        setOrders(page.orders)
        setFulfillmentByOrderId(page.fulfillmentByOrderId)
        setCursor(page.cursor)
        setHasMore(!!page.cursor)
      })
      .catch((err) => {
        console.error('Error al cargar el historial de ventas:', err)
        if (!cancelled) setError('No se pudo cargar el historial de ventas.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [eventId])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleLoadMore() {
    setLoadingMore(true)
    try {
      const page = await getConcessionsSalesHistoryPage(eventId, cursor)
      setOrders((prev) => [...prev, ...page.orders])
      setFulfillmentByOrderId((prev) => ({ ...prev, ...page.fulfillmentByOrderId }))
      setCursor(page.cursor)
      setHasMore(!!page.cursor)
    } catch (err) {
      console.error('Error al cargar más ventas del historial:', err)
      setError('No se pudo cargar más historial. Intenta de nuevo.')
    } finally {
      setLoadingMore(false)
    }
  }

  // Borrado PERMANENTE (deleteConcessionOrder revierte stock/soldCount del
  // catálogo) — pensado para limpiar pedidos de prueba, no para uso diario:
  // por eso pide confirmación explícita y no tiene "deshacer". Tras borrar,
  // se refresca el total agregado (una sola lectura server-side) en vez de
  // recalcularlo a mano en el cliente.
  async function handleDelete() {
    if (!deletingOrder) return
    const orderId = deletingOrder.id
    setDeleting(true)
    setError('')
    try {
      await deleteConcessionOrder(eventId, orderId)
      setOrders((prev) => prev.filter((o) => o.id !== orderId))
      setFulfillmentByOrderId((prev) => {
        const next = { ...prev }
        delete next[orderId]
        return next
      })
      const freshSummary = await getConcessionsSalesSummary(eventId)
      setSummary(freshSummary)
    } catch (err) {
      console.error('Error al borrar un pedido del historial:', err)
      setError('No se pudo borrar el pedido. Intenta de nuevo.')
    } finally {
      setDeleting(false)
      setDeletingOrder(null)
    }
  }

  if (loading) return <LoadingInline label="Cargando historial…" />

  const itemCount = orders.reduce((sum, o) => sum + o.itemCount, 0)

  return (
    <div>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {summary && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4 bg-white dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Ventas realizadas</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatMinorUnits(summary.totalMinorUnits, currency || '$')}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {summary.orderCount} pedido{summary.orderCount === 1 ? '' : 's'} confirmado{summary.orderCount === 1 ? '' : 's'}
            {orders.length > 0 && ` · ${itemCount} producto${itemCount === 1 ? '' : 's'} en esta página`}
          </p>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <IconInbox className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">Todavía no hay ventas confirmadas.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3.5 bg-white dark:bg-gray-800">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white text-sm">{order.guestNameSnapshot}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{order.paidAt ? formatDateTimeMedium(order.paidAt) : ''}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">
                    {formatMinorUnits(order.totalMinorUnits, order.currency)}
                  </p>
                  <AccessibleButton
                    iconOnly
                    size="sm"
                    variant="text"
                    aria-label={`Borrar pedido de ${order.guestNameSnapshot}`}
                    className="text-gray-400 hover:text-red-500"
                    onClick={() => setDeletingOrder(order)}
                  >
                    <IconTrash className="w-4 h-4" />
                  </AccessibleButton>
                </div>
              </div>
              <ul className="text-sm text-gray-600 dark:text-gray-300 mb-1.5">
                {order.items.map((line, i) => (
                  <li key={i}>
                    {line.quantity}× {line.nameSnapshot} — {formatMinorUnits(line.unitPriceMinorUnitsSnapshot, order.currency)} c/u
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-400">
                Entrega: {FULFILLMENT_STATUS_LABELS[fulfillmentByOrderId[order.id] || 'not_ready']}
              </p>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <AccessibleButton variant="secondary" size="sm" loading={loadingMore} onClick={handleLoadMore} className="w-full mt-3">
          Cargar más
        </AccessibleButton>
      )}

      <ConfirmDialog
        open={!!deletingOrder}
        title="Borrar pedido"
        message={`¿Borrar el pedido de ${deletingOrder?.guestNameSnapshot} por ${deletingOrder ? formatMinorUnits(deletingOrder.totalMinorUnits, deletingOrder.currency) : ''}? Esta acción no se puede deshacer — desaparece del historial y el catálogo recupera el stock/conteo de ventas de ese pedido.`}
        confirmLabel={deleting ? 'Borrando…' : 'Borrar pedido'}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeletingOrder(null)}
      />
    </div>
  )
}
