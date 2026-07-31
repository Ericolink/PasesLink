import type { useConcessionsCart } from '../../../hooks/useConcessionsCart'
import { formatMinorUnits } from '../../../utils/concessionsMoney'
import { QuantityStepper } from './QuantityStepper'

interface Props {
  cart: ReturnType<typeof useConcessionsCart>
  currency: string
  onBack: () => void
  onContinue: () => void
}

export function ConcessionCartView({ cart, currency, onBack, onContinue }: Props) {
  if (cart.lineList.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-[var(--invite-text-muted)] mb-3">Tu carrito está vacío.</p>
        <button onClick={onBack} className="text-sm font-medium underline underline-offset-2 text-[var(--invite-accent)]">
          Ver menú
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="space-y-3 mb-4">
        {cart.lineList.map(({ item, quantity }) => (
          <div key={item.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-[var(--invite-text)] truncate">{item.name}</p>
              <p className="text-xs text-[var(--invite-text-muted)]">
                {item.priceMinorUnits === 0 ? 'Gratis' : formatMinorUnits(item.priceMinorUnits, item.currency || currency)}
              </p>
            </div>
            <QuantityStepper
              label={item.name}
              value={quantity}
              onDecrement={() => cart.decrement(item)}
              onIncrement={() => cart.increment(item)}
              incrementDisabled={quantity >= cart.maxQuantityFor(item)}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-3 border-t text-sm" style={{ borderColor: 'var(--invite-border)' }}>
        <span className="text-[var(--invite-text-muted)]">{cart.itemCount} artículo(s)</span>
        <span className="font-semibold text-[var(--invite-text)]">{formatMinorUnits(cart.subtotalMinorUnits, currency)}</span>
      </div>

      <div className="flex flex-col gap-2 mt-4">
        <button
          onClick={onContinue}
          className="w-full text-white rounded-md px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity bg-[var(--invite-accent)]"
        >
          {cart.subtotalMinorUnits === 0 ? 'Confirmar pedido' : 'Continuar al pago'}
        </button>
        <button
          onClick={onBack}
          className="w-full border rounded-md px-4 py-3 text-sm font-medium hover:opacity-80 transition-opacity"
          style={{ borderColor: 'var(--invite-border)' }}
        >
          Seguir viendo el menú
        </button>
      </div>
    </div>
  )
}
