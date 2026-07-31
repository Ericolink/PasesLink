import { useEffect, useState } from 'react'
import { subscribeToConcessionsCatalog, archiveConcessionItem, setConcessionItemAvailability } from '../../firebase/concessions'
import type { ConcessionItem } from '../../types/concessions'
import { CONCESSIONS_CATEGORY_LABELS } from '../../types/concessions'
import { formatMinorUnits } from '../../utils/concessionsMoney'
import { optimizedImageUrl } from '../../utils/cloudinary'
import { AccessibleButton } from '../accessibility/AccessibleButton'
import { ConfirmDialog } from '../ConfirmDialog'
import { LoadingInline } from '../LoadingInline'
import { IconEdit, IconInbox, IconTrash, IconUtensils } from '../accessibility/AccessibleIcon'
import { ConcessionItemFormModal } from './ConcessionItemFormModal'

interface Props {
  eventId: string
  currency: string
}

// Catálogo del organizador: alta/edición/archivado + "marcar agotado" a
// mano. El Menu Manager tiene su PROPIA vista de solo-agotado (Fase 3, ruta
// /events/:eventId/kitchen) — este panel es exclusivo de quien administra el
// módulo (manageConcessions), nunca se comparte con ese rol.
export function ConcessionCatalogPanel({ eventId, currency }: Props) {
  const [items, setItems] = useState<ConcessionItem[] | null>(null)
  const [editingItem, setEditingItem] = useState<ConcessionItem | 'new' | null>(null)
  const [archivingItem, setArchivingItem] = useState<ConcessionItem | null>(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    return subscribeToConcessionsCatalog(eventId, setItems, () => setActionError('No se pudo cargar el catálogo.'))
  }, [eventId])

  async function handleToggleOutOfStock(item: ConcessionItem) {
    setActionError('')
    try {
      await setConcessionItemAvailability(eventId, item.id, item.status === 'active' ? 'outOfStock' : 'active')
    } catch (err) {
      console.error('Error al actualizar disponibilidad de un producto:', err)
      setActionError('No se pudo actualizar la disponibilidad. Intenta de nuevo.')
    }
  }

  async function handleArchive() {
    if (!archivingItem) return
    setActionError('')
    try {
      await archiveConcessionItem(eventId, archivingItem.id)
    } catch (err) {
      console.error('Error al eliminar un producto del catálogo:', err)
      setActionError('No se pudo eliminar el producto. Intenta de nuevo.')
    } finally {
      setArchivingItem(null)
    }
  }

  if (items === null) return <LoadingInline label="Cargando catálogo…" />

  const visibleItems = items.filter((i) => i.status !== 'archived')

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {visibleItems.length === 0 ? 'Todavía no agregaste ningún producto.' : `${visibleItems.length} producto(s)`}
        </p>
        <AccessibleButton size="sm" onClick={() => setEditingItem('new')}>
          + Agregar producto
        </AccessibleButton>
      </div>

      {actionError && <p className="text-sm text-red-500 mb-3">{actionError}</p>}

      {visibleItems.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <IconInbox className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">Agregá tu primer producto para que los invitados puedan verlo en su invitación.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visibleItems.map((item) => (
            <div key={item.id} className="flex gap-3 border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800">
              <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0 flex items-center justify-center">
                {item.imageUrl ? (
                  <img src={optimizedImageUrl(item.imageUrl, 150)} alt="" loading="lazy" crossOrigin="anonymous" className="w-full h-full object-cover" />
                ) : (
                  <IconUtensils className="w-6 h-6 text-gray-300 dark:text-gray-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{item.name}</p>
                  <div className="flex gap-1 shrink-0">
                    <AccessibleButton iconOnly size="sm" variant="text" aria-label={`Editar ${item.name}`} onClick={() => setEditingItem(item)}>
                      <IconEdit className="w-4 h-4" />
                    </AccessibleButton>
                    <AccessibleButton iconOnly size="sm" variant="text" aria-label={`Eliminar ${item.name}`} className="text-gray-400 hover:text-red-500" onClick={() => setArchivingItem(item)}>
                      <IconTrash className="w-4 h-4" />
                    </AccessibleButton>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{CONCESSIONS_CATEGORY_LABELS[item.category]}</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                  {item.priceMinorUnits === 0 ? 'Gratis' : formatMinorUnits(item.priceMinorUnits, item.currency || currency)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {item.stockMode === 'limited' ? `${item.stockRemaining ?? 0} disponibles` : 'Sin límite de stock'}
                </p>
                <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.status === 'outOfStock'}
                    onChange={() => handleToggleOutOfStock(item)}
                    className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary focus:ring-offset-0"
                  />
                  <span className="text-xs text-gray-600 dark:text-gray-300">Marcar agotado</span>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingItem && (
        <ConcessionItemFormModal
          eventId={eventId}
          currency={currency}
          item={editingItem === 'new' ? null : editingItem}
          nextSortOrder={items.length}
          open
          onClose={() => setEditingItem(null)}
        />
      )}

      <ConfirmDialog
        open={!!archivingItem}
        title="Eliminar producto"
        message={`¿Eliminar "${archivingItem?.name}" del catálogo? Los pedidos ya realizados con este producto no se ven afectados.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={handleArchive}
        onCancel={() => setArchivingItem(null)}
      />
    </div>
  )
}
