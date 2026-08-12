import type { useConcessionsCart } from '../../../hooks/useConcessionsCart'
import type { ConcessionItem } from '../../../types/concessions'
import { formatMinorUnits } from '../../../utils/concessionsMoney'
import { optimizedImageUrl } from '../../../utils/cloudinary'
import { IconUtensils } from '../../accessibility/AccessibleIcon'
import { QuantityStepper } from './QuantityStepper'

interface Props {
  items: ConcessionItem[]
  cart: ReturnType<typeof useConcessionsCart>
  currency: string
}

// Catálogo tal como lo ve el invitado — sin buscador ni filtros avanzados a
// propósito ("no quiero convertir PaseLink en una tienda", pedido explícito
// del usuario): un evento típico tiene decenas de productos, no cientos.
export function ConcessionMenuBrowser({ items, cart, currency }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-[var(--invite-text-muted)] text-center py-6">Todavía no hay productos disponibles.</p>
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const quantity = cart.lines[item.id]?.quantity ?? 0
        const outOfStock = item.status === 'outOfStock' || (item.stockMode === 'limited' && (item.stockRemaining ?? 0) <= 0)
        const maxQuantity = cart.maxQuantityFor(item)
        const lowStock = item.stockMode === 'limited' && !outOfStock && (item.stockRemaining ?? 0) <= 5

        return (
          <div key={item.id} className="flex gap-3 pb-3 border-b last:border-b-0 last:pb-0" style={{ borderColor: 'var(--invite-border)' }}>
            <div className="invite-icon-badge w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-[var(--invite-accent-soft)] flex items-center justify-center">
              {item.imageUrl ? (
                <img src={optimizedImageUrl(item.imageUrl, 150)} alt="" loading="lazy" crossOrigin="anonymous" className="w-full h-full object-cover" />
              ) : (
                <IconUtensils className="w-6 h-6 text-[var(--invite-accent)]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--invite-text)]">{item.name}</p>
              {item.description && <p className="text-xs text-[var(--invite-text-muted)] line-clamp-2">{item.description}</p>}
              <div className="flex items-center justify-between mt-1.5 gap-2">
                <span className="text-sm font-semibold text-[var(--invite-text)]">
                  {item.priceMinorUnits === 0 ? 'Gratis' : formatMinorUnits(item.priceMinorUnits, item.currency || currency)}
                </span>
                {outOfStock ? (
                  <span className="text-xs font-medium text-[var(--invite-text-muted)]">Agotado</span>
                ) : (
                  <QuantityStepper
                    label={item.name}
                    value={quantity}
                    onDecrement={() => cart.decrement(item)}
                    onIncrement={() => cart.increment(item)}
                    incrementDisabled={quantity >= maxQuantity}
                  />
                )}
              </div>
              {lowStock && <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">Quedan {item.stockRemaining}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
