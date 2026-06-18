import { useState } from 'react'
import { updateEventDetails } from '../firebase/events'
import { useCoverPhoto } from '../hooks/useCoverPhoto'
import { optimizedImageUrl } from '../utils/cloudinary'
import { ImageCropModal } from './ImageCropModal'
import { CustomFieldsBuilder } from './CustomFieldsBuilder'
import type { CustomField, EntryMode, EventData } from '../types'

export function EditEventForm({ event, onDone }: { event: EventData; onDone: () => void }) {
  const {
    fileInputRef: coverFileInputRef,
    coverImage,
    rawImage: coverRawImage,
    uploading: coverUploading,
    error: coverError,
    openPicker: openCoverPicker,
    onFileSelected: onCoverFileSelected,
    onCropConfirmed: onCoverCropConfirmed,
    onCropCancelled: onCoverCropCancelled,
    clearCover,
  } = useCoverPhoto(event.coverImage || '')

  const [name, setName] = useState(event.name)
  const [date, setDate] = useState(event.date)
  const [location, setLocation] = useState(event.location)
  const [description, setDescription] = useState(event.description || '')
  const [accentColor, setAccentColor] = useState(event.accentColor || '#2563eb')
  const [welcomeMessage, setWelcomeMessage] = useState(event.welcomeMessage || '')
  const [mapsUrl, setMapsUrl] = useState(event.mapsUrl || '')
  // No es editable: cambiar el modo de ingreso después de compartir invitaciones
  // o links de autoregistro rompería esos links (ver firestore.rules y EventJoin).
  const entryMode = event.entryMode || 'list'
  const [capacity, setCapacity] = useState(event.capacity ? String(event.capacity) : '')
  const [customFields, setCustomFields] = useState<CustomField[]>(event.customFields || [])
  const [requiresPayment, setRequiresPayment] = useState(event.requiresPayment || false)
  const [ticketPrice, setTicketPrice] = useState(event.ticketPrice ? String(event.ticketPrice) : '')
  const [currency, setCurrency] = useState(event.currency || '$')
  const [paymentInstructions, setPaymentInstructions] = useState(event.paymentInstructions || '')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !date || !location.trim()) return
    setSaving(true)
    try {
      await updateEventDetails(event.id, {
        name: name.trim(),
        date,
        location: location.trim(),
        description: description.trim(),
        coverImage,
        accentColor,
        welcomeMessage: welcomeMessage.trim(),
        mapsUrl: mapsUrl.trim() || undefined,
        entryMode,
        capacity: capacity ? parseInt(capacity, 10) : undefined,
        customFields,
        requiresPayment,
        ticketPrice: requiresPayment ? parseFloat(ticketPrice) || 0 : 0,
        currency: requiresPayment ? currency.trim() : '',
        paymentInstructions: requiresPayment ? paymentInstructions.trim() : '',
      })
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    {coverRawImage && (
      <ImageCropModal
        imageSrc={coverRawImage}
        onCrop={onCoverCropConfirmed}
        onCancel={onCoverCropCancelled}
      />
    )}
    <form onSubmit={handleSubmit} className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4 space-y-3 animate-fade-in-up">
      <h2 className="font-medium text-gray-900 dark:text-white">Editar evento</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del evento</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha</label>
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lugar</label>
          <input type="text" required value={location} onChange={(e) => setLocation(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción (opcional)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Link de Google Maps <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <input type="url" value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)}
          placeholder="https://maps.google.com/maps?q=..."
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        <p className="text-xs text-gray-400 mt-1">
          Para ver el mapa integrado, pega el link <strong>completo</strong> de Google Maps (desde el navegador, no el link corto). El botón "Cómo llegar" funciona con cualquier link.
        </p>
      </div>

      {/* Personalización */}
      <div className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Personalización del pase</p>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Imagen de portada</label>
          <input ref={coverFileInputRef} type="file" accept="image/*" onChange={onCoverFileSelected} className="hidden" />
          {coverImage ? (
            <div className="relative rounded-lg overflow-hidden h-28 bg-gray-100">
              <img src={optimizedImageUrl(coverImage, 800)} alt="Portada" loading="lazy" className="w-full h-full object-cover" />
              <button type="button" onClick={clearCover} className="absolute top-2 right-2 bg-black/50 text-white text-xs rounded-md px-2 py-1">
                Quitar
              </button>
            </div>
          ) : (
            <button type="button" onClick={openCoverPicker} disabled={coverUploading}
              className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg py-4 text-sm text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50">
              {coverUploading ? 'Subiendo...' : '+ Subir imagen de portada'}
            </button>
          )}
          {coverError && <p className="text-xs text-red-500 mt-1.5">{coverError}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color de acento</label>
            <div className="flex items-center gap-2">
              <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)}
                className="h-9 w-12 border border-gray-300 rounded-md cursor-pointer" />
              <span className="text-sm text-gray-500">{accentColor}</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mensaje de bienvenida</label>
            <input type="text" value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder="¡Te esperamos!" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>
      </div>

      {/* Campos de registro */}
      <div className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Campos de registro</p>
          <p className="text-xs text-gray-400 mt-0.5">Nombre y teléfono siempre se piden. Agrega campos extra opcionales.</p>
        </div>
        <CustomFieldsBuilder fields={customFields} onChange={setCustomFields} />
      </div>

      {/* Modo de ingreso (fijo, no se puede cambiar después de crear el evento) */}
      <div className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Modo de ingreso</p>
        <p className="text-xs text-gray-400">
          No se puede cambiar después de crear el evento, para no romper invitaciones o links de
          autoregistro que ya hayas compartido.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {([
            { id: 'list', label: 'Lista cerrada', desc: 'Solo invitados con QR propio' },
            { id: 'open', label: 'Ingreso libre', desc: 'Cualquiera entra hasta el cupo' },
            { id: 'hybrid', label: 'Mixto', desc: 'Lista + ingreso libre combinados' },
          ] as { id: EntryMode; label: string; desc: string }[]).map((m) => (
            <div key={m.id}
              className={`text-left border rounded-lg p-3 text-sm ${
                entryMode === m.id ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'border-gray-200 dark:border-gray-600 opacity-50'
              }`}>
              <div className="font-semibold text-gray-900 dark:text-white">{m.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{m.desc}</div>
            </div>
          ))}
        </div>
        {entryMode !== 'list' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cupo máximo de personas</label>
            <input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)}
              placeholder="Ej: 200" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        )}
      </div>

      {/* Cobro de entrada */}
      <div className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={requiresPayment}
            onChange={(e) => setRequiresPayment(e.target.checked)}
            className="w-4 h-4 text-primary focus:ring-primary rounded"
          />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Cobrar entrada a los invitados
          </span>
        </label>
        {requiresPayment && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio por persona</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={ticketPrice}
                  onChange={(e) => setTicketPrice(e.target.value)}
                  placeholder="Ej: 5000"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Moneda</label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  placeholder="$"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Instrucciones de pago</label>
              <textarea
                value={paymentInstructions}
                onChange={(e) => setPaymentInstructions(e.target.value)}
                rows={3}
                placeholder="Ej: Transferí a alias fiesta.maria.mp, o por Mercado Pago: https://link.mercadopago..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving || coverUploading}
          className="bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button type="button" onClick={onDone}
          className="border border-gray-300 rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
      </div>
    </form>
    </>
  )
}
