import { useEffect, useState } from 'react'
import type { EventData, GuestData } from '../../../types'
import type { ConcessionItem } from '../../../types/concessions'
import { subscribeToConcessionsCatalog } from '../../../firebase/concessions'
import { useMyConcessionOrderIds } from '../../../hooks/useMyConcessionOrderIds'
import { IconShoppingCart } from '../../accessibility/AccessibleIcon'
import { EventInfoSection } from '../EventInfoSection'
import { GuestConcessionsModal } from '../../Concessions/guest/GuestConcessionsModal'

interface Props {
  event: EventData
  guest: GuestData
  eventId: string
  lockToken: string | null
}

// Namespace 'concessions' en código, título "Menú" de cara al invitado — ver
// FOOD_BEVERAGE_ORDERING_ARCHITECTURE.md §1 (no confundir con MenuSection.tsx,
// que es la selección de plato del RSVP, un concepto distinto). A diferencia
// del resto de las secciones de este panel, no es puramente de lectura: abre
// un flujo interactivo completo (catálogo + carrito + checkout + "mis
// pedidos"), montado como modal aparte — el patrón ya usado en GuestPass
// para "Editar mis datos" (GuestEditModal), solo que acá el botón que lo
// abre vive DENTRO del acordeón en vez de en la tarjeta principal.
export function ConcessionsSection({ event, guest, eventId, lockToken }: Props) {
  const [items, setItems] = useState<ConcessionItem[] | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const { orderIds, addOrderId } = useMyConcessionOrderIds(eventId, guest.id)
  const enabled = !!event.concessions?.enabled

  useEffect(() => {
    if (!enabled) return
    return subscribeToConcessionsCatalog(eventId, setItems)
  }, [eventId, enabled])

  if (!enabled) return null
  // Evita el parpadeo de "sección vacía" mientras llega el primer snapshot.
  if (items === null) return null

  const activeItems = items.filter((i) => i.status !== 'archived')
  const hasOrders = orderIds.length > 0
  if (activeItems.length === 0 && !hasOrders) return null

  const summary = hasOrders
    ? 'Sigue el estado de tu pedido'
    : `${activeItems.length} producto${activeItems.length === 1 ? '' : 's'} disponible${activeItems.length === 1 ? '' : 's'}`

  return (
    <>
      <EventInfoSection id="concessions" icon={<IconShoppingCart className="w-4 h-4" />} title="Menú" summary={summary}>
        <button
          onClick={() => setModalOpen(true)}
          className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium bg-[var(--invite-accent-soft)] text-[var(--invite-accent-dark)] hover:opacity-90 transition-opacity"
        >
          {hasOrders ? 'Ver mis pedidos' : 'Ver menú'}
        </button>
      </EventInfoSection>
      {modalOpen && (
        <GuestConcessionsModal
          eventId={eventId}
          event={event}
          guest={guest}
          items={activeItems}
          lockToken={lockToken}
          orderIds={orderIds}
          onNewOrder={addOrderId}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}
