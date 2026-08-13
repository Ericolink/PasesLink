import { useState } from 'react'
import type { FormEvent } from 'react'
import { AccessibleModal } from '../accessibility/AccessibleModal'
import { DialogFooter } from '../DialogFooter'
import { AccessibleButton } from '../accessibility/AccessibleButton'
import { AccessibleField, Checkbox, FieldError, TextField } from '../accessibility/AccessibleField'
import { AutoResizeTextarea } from '../AutoResizeTextarea'
import { ImageCropModal } from '../ImageCropModal'
import { optimizedImageUrl } from '../../utils/cloudinary'
import { sanitizeDecimalInput } from '../../utils/validationRules'
import { majorToMinorUnits } from '../../utils/concessionsMoney'
import { useConcessionItemPhoto } from '../../hooks/useConcessionItemPhoto'
import { createConcessionItem, updateConcessionItem } from '../../firebase/concessions'
import type { ConcessionItem } from '../../types/concessions'

// Categoría (drink/food/snack/...) ya no se pide en este formulario — el
// pedido explícito es que el nombre del producto ya deja claro qué es
// ("Soda italiana" no necesita además la etiqueta "Bebidas"). El campo sigue
// existiendo en el tipo/reglas porque ConcessionOrderLine.categorySnapshot y
// ConcessionFulfillmentLine.categorySnapshot dependen de él para pedidos ya
// hechos — un valor fijo alcanza, nunca se vuelve a mostrar en la interfaz.
const DEFAULT_CATEGORY = 'food'

interface Props {
  eventId: string
  currency: string
  // null = alta nueva. El sortOrder de un ítem nuevo va al final (tamaño
  // actual del catálogo) — lo resuelve el caller (ConcessionCatalogPanel),
  // que ya tiene la lista completa en memoria.
  item: ConcessionItem | null
  nextSortOrder: number
  open: boolean
  onClose: () => void
}

// Alta/edición de un producto del catálogo — un solo modal para ambos casos
// (mismo criterio que SeatingTableEditor/CoOrganizerPermissionsEditor: menos
// componentes que sincronizar). La foto es opcional: un producto sin foto
// simplemente no muestra imagen en la tarjeta del invitado.
export function ConcessionItemFormModal({ eventId, currency, item, nextSortOrder, open, onClose }: Props) {
  const isEditing = !!item
  const [name, setName] = useState(item?.name || '')
  const [description, setDescription] = useState(item?.description || '')
  const [isFree, setIsFree] = useState(item ? item.priceMinorUnits === 0 : false)
  const [priceInput, setPriceInput] = useState(item && item.priceMinorUnits > 0 ? String(item.priceMinorUnits / 100) : '')
  const [unlimited, setUnlimited] = useState(item ? item.stockMode === 'unlimited' : true)
  const [stockInitial, setStockInitial] = useState(item?.stockInitial != null ? String(item.stockInitial) : '')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const {
    fileInputRef, imageUrl, rawImage, uploading, error: photoError,
    openPicker, onFileSelected, onCropConfirmed, onCropCancelled,
    clearImage,
  } = useConcessionItemPhoto(item?.imageUrl || '')

  if (!open) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError('')

    const trimmedName = name.trim()
    if (!trimmedName) {
      setFormError('Ponle un nombre al producto.')
      return
    }
    const priceMinorUnits = isFree ? 0 : majorToMinorUnits(Number(priceInput) || 0)
    if (!isFree && priceMinorUnits <= 0) {
      setFormError('Ponle un precio mayor a 0, o marca el producto como gratis.')
      return
    }
    const stockInitialNumber = Number(stockInitial) || 0
    if (!unlimited && stockInitialNumber <= 0) {
      setFormError('Indica cuántas unidades hay disponibles.')
      return
    }

    setSaving(true)
    try {
      const input = {
        name: trimmedName,
        description: description.trim() || undefined,
        category: item?.category || DEFAULT_CATEGORY,
        imageUrl: imageUrl || undefined,
        priceMinorUnits,
        currency,
        stockMode: (unlimited ? 'unlimited' : 'limited') as 'unlimited' | 'limited',
        stockInitial: unlimited ? undefined : stockInitialNumber,
      }
      if (item) {
        await updateConcessionItem(eventId, item.id, input)
      } else {
        await createConcessionItem(eventId, { ...input, sortOrder: nextSortOrder })
      }
      onClose()
    } catch (err) {
      console.error('Error al guardar un producto del catálogo:', err)
      setFormError('No pudimos guardar el producto. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <AccessibleModal open={open} onClose={onClose} label={isEditing ? 'Editar producto' : 'Nuevo producto'} maxWidth="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
          <div className="overflow-y-auto p-6 pb-2 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {isEditing ? 'Editar producto' : 'Nuevo producto'}
            </h2>

            <div>
              <label htmlFor="concession-item-photo" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Fotografía
              </label>
              <input id="concession-item-photo" ref={fileInputRef} type="file" accept="image/*" onChange={onFileSelected} className="hidden" />
              {imageUrl ? (
                <div className="relative rounded-lg overflow-hidden bg-gray-100 h-28 w-28">
                  <img src={optimizedImageUrl(imageUrl, 300)} alt="" loading="lazy" crossOrigin="anonymous" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={clearImage}
                    className="absolute top-1 right-1 min-h-8 min-w-8 inline-flex items-center justify-center bg-black/50 hover:bg-black/70 text-white text-xs font-medium rounded-md transition-colors"
                  >
                    Quitar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={openPicker}
                  disabled={uploading}
                  className="h-28 w-28 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                >
                  {uploading ? 'Subiendo…' : '+ Foto'}
                </button>
              )}
              <FieldError message={photoError} />
            </div>

            <TextField label="Nombre" id="concession-item-name" required value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Soda italiana" />

            <AccessibleField label="Descripción" id="concession-item-description">
              {(fieldProps) => (
                <AutoResizeTextarea
                  {...fieldProps}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  minHeight={60}
                  maxHeight={160}
                  maxLength={500}
                  placeholder="Sabor a elegir en barra"
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white dark:focus:bg-gray-800 transition-colors"
                />
              )}
            </AccessibleField>

            <div>
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <Checkbox checked={isFree} onChange={(e) => setIsFree(e.target.checked)} />
                <span className="text-sm text-gray-700 dark:text-gray-300">Este producto es gratis</span>
              </label>
              {!isFree && (
                <TextField
                  label={`Precio (${currency})`}
                  id="concession-item-price"
                  inputMode="decimal"
                  value={priceInput}
                  onChange={(e) => setPriceInput(sanitizeDecimalInput(e.target.value))}
                  placeholder="35.00"
                />
              )}
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <Checkbox checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
                <span className="text-sm text-gray-700 dark:text-gray-300">Cantidad ilimitada</span>
              </label>
            </div>
            {!unlimited && (
              <TextField
                label="Unidades disponibles"
                id="concession-item-stock"
                inputMode="numeric"
                value={stockInitial}
                onChange={(e) => setStockInitial(e.target.value.replace(/\D/g, ''))}
                placeholder="50"
              />
            )}

            <FieldError message={formError} />
          </div>
          <DialogFooter>
            <AccessibleButton type="button" variant="secondary" onClick={onClose} className="flex-1">
              Cancelar
            </AccessibleButton>
            <AccessibleButton type="submit" loading={saving || uploading} className="flex-1">
              {saving ? 'Guardando…' : 'Guardar'}
            </AccessibleButton>
          </DialogFooter>
        </form>
      </AccessibleModal>
      {rawImage && <ImageCropModal imageSrc={rawImage} aspect={1} onCrop={onCropConfirmed} onCancel={onCropCancelled} />}
    </>
  )
}
