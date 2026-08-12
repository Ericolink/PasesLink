import { useEffect, useState } from 'react'
import type { EventData, GuestData, PaymentMethod } from '../../types'
import type { ConcessionItem } from '../../types/concessions'
import { ConcessionCheckoutError, createConcessionOrder, subscribeToConcessionsCatalog } from '../../firebase/concessions'
import { useConcessionsCart } from '../../hooks/useConcessionsCart'
import { useMyConcessionOrderIds } from '../../hooks/useMyConcessionOrderIds'
import { formatMinorUnits } from '../../utils/concessionsMoney'
import { AccessibleModal } from '../accessibility/AccessibleModal'
import { IconShoppingCart, IconX } from '../accessibility/AccessibleIcon'
import { ConcessionMenuBrowser } from '../Concessions/guest/ConcessionMenuBrowser'
import { ConcessionCartView } from '../Concessions/guest/ConcessionCartView'
import { ConcessionCheckoutView } from '../Concessions/guest/ConcessionCheckoutView'
import { MyConcessionOrderCard } from '../Concessions/guest/MyConcessionOrderCard'

interface Props {
  event: EventData
  guest: GuestData
  eventId: string
  lockToken: string | null
}

type CheckoutView = 'cart' | 'checkout' | 'orders'

// Menú de Fiesta Improvisada — catálogo visible en la página (no detrás de
// un botón de acordeón, ver ConcessionsSection.tsx para el equivalente de
// las demás plantillas). Reutiliza el sistema de concesiones al 100%:
// mismo listener (subscribeToConcessionsCatalog), mismo carrito
// (useConcessionsCart), mismo componente de catálogo (ConcessionMenuBrowser,
// ahora inline en vez de dentro de un modal), y para carrito/checkout las
// mismas vistas de leaf components que GuestConcessionsModal — nunca se
// toca ese componente ni la Cloud Function createConcessionOrder. Lo único
// "nuevo" es el cableado de qué vista mostrar cuándo.
export function InvitationMenu({ event, guest, eventId, lockToken }: Props) {
  const [items, setItems] = useState<ConcessionItem[] | null>(null)
  const [checkoutView, setCheckoutView] = useState<CheckoutView | null>(null)
  const [placing, setPlacing] = useState(false)
  const [placeError, setPlaceError] = useState('')
  const cart = useConcessionsCart()
  const { orderIds, addOrderId } = useMyConcessionOrderIds(eventId, guest.id)
  const enabled = !!event.concessions?.enabled

  useEffect(() => {
    if (!enabled) return
    return subscribeToConcessionsCatalog(eventId, setItems)
  }, [eventId, enabled])

  if (!enabled || items === null) return null

  const activeItems = items.filter((i) => i.status !== 'archived')
  const hasOrders = orderIds.length > 0
  if (activeItems.length === 0 && !hasOrders) return null

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
      addOrderId(orderId)
      cart.clear()
      setCheckoutView('orders')
    } catch (err) {
      setPlaceError(err instanceof ConcessionCheckoutError ? err.message : 'No se pudo completar el pedido. Intenta de nuevo.')
    } finally {
      setPlacing(false)
    }
  }

  function handleContinueFromCart() {
    if (cart.subtotalMinorUnits === 0) {
      void placeOrder(null)
    } else {
      setPlaceError('')
      setCheckoutView('checkout')
    }
  }

  return (
    <section
      className="invite-card border bg-[var(--invite-surface)] text-[var(--invite-text)] [font-family:var(--invite-font)] [border-radius:var(--invite-radius)] p-4 text-left"
      style={{ boxShadow: 'var(--invite-shadow)', borderColor: 'var(--invite-border)' }}
    >
      <div className="flex items-center gap-3 mb-4">
        <span className="invite-icon-badge shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-[var(--invite-accent-soft)] text-[var(--invite-accent)]">
          <IconShoppingCart className="w-4 h-4" />
        </span>
        <h2 className="text-base font-semibold text-[var(--invite-text)]">{storeName}</h2>
        {hasOrders && (
          <button
            type="button"
            onClick={() => setCheckoutView('orders')}
            className="ml-auto text-xs font-medium underline underline-offset-2 text-[var(--invite-text-muted)]"
          >
            Mi pedido
          </button>
        )}
      </div>

      {activeItems.length > 0 && <ConcessionMenuBrowser items={activeItems} cart={cart} currency={currency} />}

      {cart.itemCount > 0 && (
        <button
          onClick={() => setCheckoutView('cart')}
          className="w-full mt-4 text-white rounded-md px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity bg-[var(--invite-accent)]"
        >
          Ver carrito ({cart.itemCount}) — {formatMinorUnits(cart.subtotalMinorUnits, currency)}
        </button>
      )}

      {checkoutView && (
        <AccessibleModal
          open
          onClose={() => setCheckoutView(null)}
          label={storeName}
          surfaceClassName="bg-[var(--invite-surface)]"
          className="flex flex-col min-h-0"
          maxWidth="sm:max-w-md"
        >
          <div className="flex items-center justify-between gap-2 px-6 pt-5 pb-3 shrink-0 border-b" style={{ borderColor: 'var(--invite-border)' }}>
            <h2 className="text-base font-semibold text-[var(--invite-text)] truncate">{storeName}</h2>
            <button
              onClick={() => setCheckoutView(null)}
              aria-label="Cerrar"
              className="min-w-9 min-h-9 -mr-2 inline-flex items-center justify-center text-[var(--invite-text-muted)] hover:text-[var(--invite-text)]"
            >
              <IconX className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-y-auto px-6 py-4 flex-1">
            {checkoutView === 'cart' && (
              <ConcessionCartView cart={cart} currency={currency} onBack={() => setCheckoutView(null)} onContinue={handleContinueFromCart} />
            )}
            {checkoutView === 'checkout' && (
              <ConcessionCheckoutView
                paymentMethods={paymentMethods}
                bankInstructions={bankInstructions}
                pickupInstructions={concessions?.pickupInstructions}
                totalLabel={formatMinorUnits(cart.subtotalMinorUnits, currency)}
                submitting={placing}
                error={placeError}
                onSubmit={placeOrder}
                onBack={() => setCheckoutView('cart')}
              />
            )}
            {checkoutView === 'orders' && (
              <div className="space-y-3">
                {orderIds.map((id) => (
                  <MyConcessionOrderCard key={id} eventId={eventId} orderId={id} lockToken={lockToken} />
                ))}
                <button
                  onClick={() => setCheckoutView(null)}
                  className="w-full border rounded-md px-4 py-3 text-sm font-medium hover:opacity-80 transition-opacity"
                  style={{ borderColor: 'var(--invite-border)' }}
                >
                  Seguir viendo el menú
                </button>
              </div>
            )}
          </div>
        </AccessibleModal>
      )}
    </section>
  )
}
