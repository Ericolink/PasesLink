import { useState } from 'react'

// "Mis pedidos" es deliberadamente por DISPOSITIVO, no una query a Firestore
// (ver FOOD_BEVERAGE_ORDERING_ARCHITECTURE.md §12 caso 11): el invitado no
// tiene cuenta obligatoria, así que no hay ningún filtro server-side seguro
// para "dame los pedidos de este invitado" sin exponer los de cualquier
// otro. El orderId ya lo devuelve createConcessionOrder en el momento — acá
// solo se recuerda entre visitas a la misma invitación desde el mismo
// navegador. Mismo prefijo `paselink_<algo>_<eventId>_<algo2>` que el resto
// del repo (ver `paselink_lock_${eventId}_${qrToken}` en GuestPass.tsx).
function storageKeyFor(eventId: string, guestId: string): string {
  return `paselink_concessions_orders_${eventId}_${guestId}`
}

function readOrderIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function useMyConcessionOrderIds(eventId: string, guestId: string) {
  const storageKey = storageKeyFor(eventId, guestId)
  // Lazy initializer: se lee una sola vez por montaje — GuestPass ya fuerza
  // un remount completo (`key={qrToken}`) si cambia de invitación, así que
  // eventId/guestId nunca cambian bajo el mismo montaje de este hook.
  const [orderIds, setOrderIds] = useState<string[]>(() => readOrderIds(storageKey))

  function addOrderId(orderId: string) {
    setOrderIds((prev) => {
      const next = [orderId, ...prev.filter((id) => id !== orderId)]
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // Safari privado, cuota llena, etc. — el pedido ya existe en
        // Firestore igual, solo se pierde el atajo de "mis pedidos" en este
        // dispositivo (degradación aceptable, no un error de negocio).
      }
      return next
    })
  }

  return { orderIds, addOrderId }
}
