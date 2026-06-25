import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { createEvent } from '../firebase/events'
import { useCoverPhoto } from '../hooks/useCoverPhoto'
import { useFormDraft } from '../hooks/useFormDraft'
import { optimizedImageUrl } from '../utils/cloudinary'
import { isNetworkError } from '../utils/network'
import { parseCapacity } from '../utils/validationRules'
import { ImageCropModal } from '../components/ImageCropModal'
import { CustomFieldsBuilder } from '../components/CustomFieldsBuilder'
import { TemplatePicker } from '../components/TemplatePicker'
import { DraftRecoveryModal } from '../components/DraftRecoveryModal'
import { IconCheckCircle } from '../components/Icons'
import { getTemplate } from '../templates/registry'
import type { CustomField, EntryMode, TemplateId } from '../types'

interface EventDraftFields {
  name: string
  date: string
  startTime: string
  endTime: string
  location: string
  description: string
  templateId: TemplateId
  accentColor: string
  welcomeMessage: string
  mapsUrl: string
  entryMode: EntryMode
  capacity: string
  customFields: CustomField[]
  requiresPayment: boolean
  ticketPrice: string
  currency: string
  paymentInstructions: string
  coverImage: string
}

const DRAFT_SAVE_INTERVAL_MS = 5000

export function EventCreate() {
  const { user } = useAuth()
  const navigate = useNavigate()
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
    setCoverImage,
  } = useCoverPhoto()

  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [templateId, setTemplateId] = useState<TemplateId>('default')
  // Vacío = "sin override manual", usa el acento propio de la plantilla
  // elegida. Si tuviera un valor por defecto fijo, cada evento nuevo
  // quedaría pisando el acento del tema con ese color sin que el anfitrión
  // lo haya elegido a propósito.
  const [accentColor, setAccentColor] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [mapsUrl, setMapsUrl] = useState('')
  const [entryMode, setEntryMode] = useState<EntryMode>('list')
  const [capacity, setCapacity] = useState('')
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [requiresPayment, setRequiresPayment] = useState(false)
  const [ticketPrice, setTicketPrice] = useState('')
  const [currency, setCurrency] = useState('$')
  const [paymentInstructions, setPaymentInstructions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [networkRetry, setNetworkRetry] = useState(false)
  const [createdEventId, setCreatedEventId] = useState<string | null>(null)

  const draftKey = user ? `eventDraft_${user.uid}_new` : ''
  const { pendingDraft, saveDraft, clearDraft, dismissPrompt } = useFormDraft<EventDraftFields>(draftKey)

  function applyDraft(fields: EventDraftFields) {
    setName(fields.name)
    setDate(fields.date)
    setStartTime(fields.startTime)
    setEndTime(fields.endTime)
    setLocation(fields.location)
    setDescription(fields.description)
    setTemplateId(fields.templateId)
    setAccentColor(fields.accentColor)
    setWelcomeMessage(fields.welcomeMessage)
    setMapsUrl(fields.mapsUrl)
    setEntryMode(fields.entryMode)
    setCapacity(fields.capacity)
    setCustomFields(fields.customFields)
    setRequiresPayment(fields.requiresPayment)
    setTicketPrice(fields.ticketPrice)
    setCurrency(fields.currency)
    setPaymentInstructions(fields.paymentInstructions)
    if (fields.coverImage) setCoverImage(fields.coverImage)
  }

  // Autoguardado del borrador c/5s mientras haya contenido — así un cierre
  // accidental de la pestaña o un fallo de red al crear el evento no borra
  // un formulario largo que puede tener 10+ campos.
  useEffect(() => {
    if (!draftKey || pendingDraft) return
    const id = setInterval(() => {
      const hasContent = name.trim() || date || location.trim() || description.trim()
      if (!hasContent) return
      saveDraft({
        name, date, startTime, endTime, location, description, templateId, accentColor, welcomeMessage, mapsUrl,
        entryMode, capacity, customFields, requiresPayment, ticketPrice, currency, paymentInstructions, coverImage,
      })
    }, DRAFT_SAVE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [
    draftKey, pendingDraft, name, date, startTime, endTime, location, description, templateId, accentColor, welcomeMessage, mapsUrl,
    entryMode, capacity, customFields, requiresPayment, ticketPrice, currency, paymentInstructions, coverImage,
    saveDraft,
  ])

  async function submitEvent() {
    if (!user) return
    setError('')
    setNetworkRetry(false)
    const { value: parsedCapacity, error: capacityError } = parseCapacity(capacity)
    if (capacityError) {
      setError(capacityError)
      return
    }
    setLoading(true)
    try {
      const eventId = await createEvent(user.uid, {
        name,
        date,
        startTime,
        endTime,
        location,
        description,
        coverImage,
        accentColor,
        templateId,
        welcomeMessage,
        mapsUrl: mapsUrl.trim() || undefined,
        entryMode,
        capacity: parsedCapacity,
        customFields,
        requiresPayment,
        ticketPrice: requiresPayment ? parseFloat(ticketPrice) || 0 : 0,
        currency: requiresPayment ? currency.trim() : '',
        paymentInstructions: requiresPayment ? paymentInstructions.trim() : '',
      })
      clearDraft()
      setCreatedEventId(eventId)
    } catch (err) {
      if (isNetworkError(err)) {
        setError('Guardado localmente. Reintentando…')
        setNetworkRetry(true)
      } else {
        setError('No pudimos crear el evento. Intenta de nuevo.')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void submitEvent()
  }

  return (
    <>
    {pendingDraft && (
      <DraftRecoveryModal
        savedAt={pendingDraft.savedAt}
        onContinue={() => { applyDraft(pendingDraft.fields); dismissPrompt() }}
        onStartOver={() => { clearDraft(); dismissPrompt() }}
      />
    )}
    {createdEventId && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6 text-center animate-bounce-in">
          <IconCheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">¡Evento creado!</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{name} ya está listo.</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => navigate(`/events/${createdEventId}#${entryMode === 'open' ? 'open-entry-links' : 'add-guests'}`)}
              className="bg-primary text-white rounded-md py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              Próximo paso: {entryMode === 'open' ? 'Compartir enlace de registro' : 'Agregar invitados'}
            </button>
            <button
              onClick={() => navigate(`/events/${createdEventId}`)}
              className="border border-gray-300 dark:border-gray-600 rounded-md py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Ir al evento
            </button>
          </div>
        </div>
      </div>
    )}
    {coverRawImage && (
      <ImageCropModal
        imageSrc={coverRawImage}
        onCrop={onCoverCropConfirmed}
        onCancel={onCoverCropCancelled}
      />
    )}
    <div className="max-w-2xl mx-auto px-4 py-8 animate-fade-in">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">Crear evento</h1>
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Datos del evento */}
        <div>
          <label htmlFor="event-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del evento</label>
          <input
            id="event-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mi graduación"
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="event-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha</label>
            <input
              id="event-date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="event-location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lugar</label>
            <input
              id="event-location"
              type="text"
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Salón Los Olivos"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="event-start-time" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Hora de inicio <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              id="event-start-time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="event-end-time" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Hora de fin <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              id="event-end-time"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
        <div>
          <label htmlFor="event-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción (opcional)</label>
          <textarea
            id="event-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label htmlFor="event-maps-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Link de Google Maps <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input
            id="event-maps-url"
            type="url"
            value={mapsUrl}
            onChange={(e) => setMapsUrl(e.target.value)}
            placeholder="https://maps.google.com/maps?q=..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-gray-400 mt-1">
            Si no pegás un link, el pase no mostrará el botón "Cómo llegar" — así evitamos llevar a tus invitados a un lugar incorrecto. Para ver el mapa integrado, pega el link <strong>completo</strong> de Google Maps (desde el navegador, no el link corto).
          </p>
        </div>

        {/* Plantilla visual */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Plantilla del pase</h2>
            <p className="text-xs text-gray-500 mt-0.5">Elegí la identidad visual que verán tus invitados. Podés cambiarla después.</p>
          </div>
          <TemplatePicker
            selected={templateId}
            onSelect={setTemplateId}
            previewData={{ eventName: name, date, location, mapsUrl, coverImage, accentColor, welcomeMessage }}
          />
        </div>

        {/* Personalización */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Personalización del pase</h2>

          <div>
            <label htmlFor="event-cover-image" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Imagen de portada</label>
            <input id="event-cover-image" ref={coverFileInputRef} type="file" accept="image/*" onChange={onCoverFileSelected} className="hidden" />
            {coverImage ? (
              <div className="relative rounded-lg overflow-hidden h-32 bg-gray-100">
                <img src={optimizedImageUrl(coverImage, 800)} alt="Portada" loading="lazy" className="w-full h-full object-cover" />
                <button type="button" onClick={clearCover} className="absolute top-2 right-2 bg-black/50 text-white text-xs rounded-md px-2 py-1">
                  Quitar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={openCoverPicker}
                disabled={coverUploading}
                className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg py-6 text-sm text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
              >
                {coverUploading ? 'Subiendo…' : '+ Subir imagen de portada'}
              </button>
            )}
            {coverError && <p className="text-xs text-red-500 mt-1.5">{coverError}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="event-accent-color" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color de acento</label>
              <div className="flex items-center gap-2">
                <input
                  id="event-accent-color"
                  type="color"
                  value={accentColor || getTemplate(templateId).vars.accent}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-10 w-14 border border-gray-300 rounded-md cursor-pointer"
                />
                <span className="text-sm text-gray-500">
                  {accentColor || `${getTemplate(templateId).vars.accent} (de la plantilla)`}
                </span>
              </div>
            </div>
            <div>
              <label htmlFor="event-welcome-message" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mensaje de bienvenida</label>
              <input
                id="event-welcome-message"
                type="text"
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                placeholder="¡Te esperamos!"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Campos personalizados del registro */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Campos de registro</h2>
            <p className="text-xs text-gray-500 mt-0.5">Los invitados siempre ingresan nombre y teléfono. Puedes agregar campos extra.</p>
          </div>
          <div className="flex gap-2 text-xs text-gray-400 border border-gray-100 dark:border-gray-700 rounded-md px-3 py-2 bg-gray-50 dark:bg-gray-700/30">
            <span className="font-medium text-gray-600 dark:text-gray-300">Fijos:</span> Nombre · Teléfono
          </div>
          <CustomFieldsBuilder fields={customFields} onChange={setCustomFields} />
        </div>

        {/* Modo de ingreso */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Modo de ingreso</h2>
          <p className="text-xs text-gray-500">
            Elegí con cuidado: no se puede cambiar después de crear el evento, para no romper
            invitaciones o links de autoregistro que ya hayas compartido.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              { id: 'list', label: 'Lista cerrada', desc: 'Solo invitados con QR propio' },
              { id: 'open', label: 'Ingreso libre', desc: 'Cualquiera se autoregistra y entra hasta el cupo; no se agregan invitados a mano' },
              { id: 'hybrid', label: 'Mixto', desc: 'Lista + ingreso libre combinados' },
            ] as { id: EntryMode; label: string; desc: string }[]).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setEntryMode(m.id)}
                className={`text-left border rounded-lg p-3 transition-all ${
                  entryMode === m.id
                    ? 'border-primary ring-2 ring-primary/20 bg-primary-light'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                }`}
              >
                <div className="text-sm font-semibold text-gray-900 dark:text-white">{m.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{m.desc}</div>
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="event-capacity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Límite de invitados
            </label>
            <input
              id="event-capacity"
              type="number"
              required
              min="1"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="Ej: 200"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-gray-400 mt-1">
              Total de personas permitidas (invitados + acompañantes). Si se llena el cupo, los
              invitados nuevos se agregan automáticamente a la lista de espera.
            </p>
          </div>
        </div>

        {/* Cobro de entrada */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={requiresPayment}
              onChange={(e) => setRequiresPayment(e.target.checked)}
              className="w-4 h-4 text-primary focus:ring-primary rounded"
            />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Cobrar entrada a los invitados
            </span>
          </label>
          {requiresPayment && (
            <>
              <p className="text-xs text-gray-500">
                El pago se confirma manualmente: vos marcás a cada invitado como pagado desde la
                lista o al escanear su pase en la puerta.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label htmlFor="event-ticket-price" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio por persona</label>
                  <input
                    id="event-ticket-price"
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
                  <label htmlFor="event-currency" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Moneda</label>
                  <input
                    id="event-currency"
                    type="text"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    placeholder="$"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="event-payment-instructions" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Instrucciones de pago</label>
                <textarea
                  id="event-payment-instructions"
                  value={paymentInstructions}
                  onChange={(e) => setPaymentInstructions(e.target.value)}
                  rows={3}
                  placeholder="Ej: Transferí a alias fiesta.maria.mp, o por Mercado Pago: https://link.mercadopago..."
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-gray-400 mt-1">Esto lo van a ver los invitados en su pase, junto al monto a pagar.</p>
              </div>
            </>
          )}
        </div>

        <p className="text-sm text-center text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-md px-3 py-2">
          🎉 Todas las funciones Premium (reportes, recordatorios, notificaciones) están incluidas gratis
          mientras damos a conocer el servicio.
        </p>

        {error && (
          <div className="text-sm text-red-600">
            <p>{error}</p>
            {networkRetry && (
              <button type="button" onClick={() => void submitEvent()} className="mt-1 font-medium underline">
                Reintentar ahora
              </button>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || coverUploading}
          className="w-full bg-primary text-white rounded-md py-2.5 font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 hover:-translate-y-0.5 hover:shadow-md"
        >
          {loading ? 'Creando…' : 'Crear evento'}
        </button>
      </form>
    </div>
    </>
  )
}
