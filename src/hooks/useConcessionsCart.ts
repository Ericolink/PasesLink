import { useMemo, useState } from 'react'
import type { ConcessionItem } from '../types/concessions'

export interface ConcessionCartLine {
  item: ConcessionItem
  quantity: number
}

// Carrito 100% local — NUNCA toca Firestore hasta el checkout (ver RFC §11:
// la reserva de inventario ocurre recién al crear el pedido, no acá). Esto
// es justamente lo que hace que "carrito abandonado" tenga costo cero — no
// hay nada que limpiar si el invitado cierra la invitación sin pagar.
export function useConcessionsCart() {
  const [lines, setLines] = useState<Record<string, ConcessionCartLine>>({})

  function maxQuantityFor(item: ConcessionItem): number {
    return item.stockMode === 'limited' ? Math.max(0, item.stockRemaining ?? 0) : Infinity
  }

  function setQuantity(item: ConcessionItem, quantity: number) {
    setLines((prev) => {
      const clamped = Math.max(0, Math.min(quantity, maxQuantityFor(item)))
      if (clamped === 0) {
        const next = { ...prev }
        delete next[item.id]
        return next
      }
      return { ...prev, [item.id]: { item, quantity: clamped } }
    })
  }

  function increment(item: ConcessionItem) {
    setQuantity(item, (lines[item.id]?.quantity ?? 0) + 1)
  }

  function decrement(item: ConcessionItem) {
    setQuantity(item, (lines[item.id]?.quantity ?? 0) - 1)
  }

  function clear() {
    setLines({})
  }

  const lineList = useMemo(() => Object.values(lines), [lines])
  const itemCount = useMemo(() => lineList.reduce((sum, l) => sum + l.quantity, 0), [lineList])
  const subtotalMinorUnits = useMemo(
    () => lineList.reduce((sum, l) => sum + l.item.priceMinorUnits * l.quantity, 0),
    [lineList],
  )

  return { lines, lineList, itemCount, subtotalMinorUnits, setQuantity, increment, decrement, clear, maxQuantityFor }
}
