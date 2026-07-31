import { useState } from 'react'
import type { EventData, GuestData, PaymentMethod } from '../../../types'
import type { ConcessionItem } from '../../../types/concessions'
import { ConcessionCheckoutError, createConcessionOrder } from '../../../firebase/concessions'
import { useConcessionsCart } from '../../../hooks/useConcessionsCart'
import { formatMinorUnits } from '../../../utils/concessionsMoney'
import { AccessibleModal } from '../../accessibility/AccessibleModal'
import { IconX } from '../../accessibility/AccessibleIcon'
import { ConcessionMenuBrowser } from './ConcessionMenuBrowser'
import { ConcessionCartView } from './ConcessionCartView'
import { ConcessionCheckoutView } from './ConcessionCheckoutView'
import { MyConcessionOrderCard } from './MyConcessionOrderCard'

type View = 'menu' | 'cart' | 'checkout' | 'orders'

interface Props {
  eventId: string
  event: EventData
  guest: GuestData
  items: ConcessionItem[]
  lockToken: string | null
  orderIds: string[]
  onNewOrder: (orderId: string) => void
  onClose: () => void
}

// Orquestador de todo el flujo de compra del invitado — carrito local
// (nunca toca Firestore hasta el checkout, ver useConcessionsCart) +
// checkout + "Mis pedidos". Vive fuera del acordeón (portal de
// AccessibleModal a document.body), montado/desmontado por ConcessionsSection.
export function GuestConcessionsModal({ eventId, event, guest, items, lockToken, orderIds, onNewOrder, onClose }: Props) {
  const cart = useConcessionsCart()
  const [view, setView] = useState<View>(orderIds.length > 0 ? 'orders' : 'menu')
  const [placing, setPlacing] = useState(false)
  const [placeError, setPlaceError] = useState('')

  const concessions = event.concessions
  const storeName = concessions?.storeName?.trim() || 'Menú'
  const currency = concessions?.currency || event.currency
  const paymentMethods: PaymentMethod[] = concessions?.paymentMethods?.length ? concessions.paymentMethods : ['transfer']
  const bankInstructions = concessions?.useEventPaymentInstructions
    ? event.paymentInstructions
    : concessions?.paymentInstructions || ''

  async function placeOrder(paymentMethod: PaymentMethod | null) {
    setPlacing(true)
    setPlaceError('')
    try {
      const orderId = await createConcessionOrder(eventId, {
        guestId: guest.id,
        guestNameSnapshot: [guest.name, guest.lastName].filter(Boolean).join(' '),
        lockToken,
        currency,
        paymentMethod,
        lines: cart.lineList.map(({ item, quantity }) => ({ itemId: item.id, quantity })),
      })
      onNewOrder(orderId)
      cart.clear()
      setView('orders')
    } catch (err) {
      setPlaceError(err instanceof ConcessionCheckoutError ? err.message : 'No se pudo completar el pedido. Intenta de nuevo.')
    } finally {
      setPlacing(false)
    }
  }

  function handleContinueFromCart() {
    if (cart.subtotalMinorUnits === 0) {
      placeOrder(null)
    } else {
      setPlaceError('')
      setView('checkout')
    }
  }

  return (
    <AccessibleModal
      open
      onClose={onClose}
      label={storeName}
      surfaceClassName="bg-[var(--invite-surface)]"
      className="flex flex-col min-h-0"
      maxWidth="sm:max-w-md"
    >
      <div className="flex items-center justify-between gap-2 px-6 pt-5 pb-3 shrink-0 border-b" style={{ borderColor: 'var(--invite-border)' }}>
        <h2 className="text-base font-semibold text-[var(--invite-text)] truncate">{storeName}</h2>
        <div className="flex items-center gap-3 shrink-0">
          {view !== 'orders' && orderIds.length > 0 && (
            <button onClick={() => setView('orders')} className="text-xs font-medium underline underline-offset-2 text-[var(--invite-text-muted)]">
              Mis pedidos
            </button>
          )}
          {view === 'orders' && (
            <button onClick={() => setView('menu')} className="text-xs font-medium underline underline-offset-2 text-[var(--invite-text-muted)]">
              Ver menú
            </button>
          )}
          <button onClick={onClose} aria-label="Cerrar" className="min-w-9 min-h-9 -mr-2 inline-flex items-center justify-center text-[var(--invite-text-muted)] hover:text-[var(--invite-text)]">
            <IconX className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto px-6 py-4 flex-1">
        {view === 'menu' && <ConcessionMenuBrowser items={items} cart={cart} currency={currency} />}
        {view === 'cart' && <ConcessionCartView cart={cart} currency={currency} onBack={() => setView('menu')} onContinue={handleContinueFromCart} />}
        {view === 'checkout' && (
          <ConcessionCheckoutView
            paymentMethods={paymentMethods}
            bankInstructions={bankInstructions}
            pickupInstructions={concessions?.pickupInstructions}
            totalLabel={formatMinorUnits(cart.subtotalMinorUnits, currency)}
            submitting={placing}
            error={placeError}
            onSubmit={placeOrder}
            onBack={() => setView('cart')}
          />
        )}
        {view === 'orders' && (
          <div className="space-y-3">
            {orderIds.map((id) => (
              <MyConcessionOrderCard key={id} eventId={eventId} orderId={id} lockToken={lockToken} />
            ))}
            <button
              onClick={() => setView('menu')}
              className="w-full border rounded-md px-4 py-3 text-sm font-medium hover:opacity-80 transition-opacity"
              style={{ borderColor: 'var(--invite-border)' }}
            >
              + Hacer otro pedido
            </button>
          </div>
        )}
      </div>

      {view === 'menu' && cart.itemCount > 0 && (
        <div className="shrink-0 border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" style={{ borderColor: 'var(--invite-border)' }}>
          <button
            onClick={() => setView('cart')}
            className="w-full text-white rounded-md px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity bg-[var(--invite-accent)]"
          >
            Ver carrito ({cart.itemCount}) — {formatMinorUnits(cart.subtotalMinorUnits, currency)}
          </button>
        </div>
      )}
    </AccessibleModal>
  )
}
