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
import { TimelineEditor } from '../components/TimelineEditor'
import { TemplatePicker } from '../components/TemplatePicker'
import { DraftRecoveryModal } from '../components/DraftRecoveryModal'
import { EventScheduleField } from '../components/EventScheduleField'
import { IconCheckCircle } from '../components/Icons'
import { WizardContainer, WizardStep } from '../components/Wizard'
import { EntryModeSelector } from '../components/EventCreation/EntryModeSelector'
import { getTemplate } from '../templates/registry'
import type { CustomField, EntryMode, TemplateId, TimelineEntry } from '../types'

interface EventDraftFields {
  name: string
  date: string
  startTime: string
  endTime: string
  location: string
  description: string
  dressCode: string
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
  timeline: TimelineEntry[]
}

const DRAFT_SAVE_INTERVAL_MS = 5000
const STEP_LABELS = ['Lo esencial', '¿Cómo entran?', 'Personalización']
const TOTAL_STEPS = 3

function capacityHint(cap: string): string {
  const n = parseInt(cap)
  if (!n || n <= 0) return ''
  if (n <= 20) return 'Grupo íntimo'
  if (n <= 100) return 'Grupo mediano'
  if (n <= 500) return 'Evento grande'
  return 'Evento masivo'
}

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

  // — Campos del formulario —
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [dressCode, setDressCode] = useState('')
  const [templateId, setTemplateId] = useState<TemplateId>('default')
  const [accentColor, setAccentColor] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [mapsUrl, setMapsUrl] = useState('')
  const [entryMode, setEntryMode] = useState<EntryMode>('list')
  const [capacity, setCapacity] = useState('100')
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [requiresPayment, setRequiresPayment] = useState(false)
  const [ticketPrice, setTicketPrice] = useState('')
  const [currency, setCurrency] = useState('$')
  const [paymentInstructions, setPaymentInstructions] = useState('')
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])

  // — Estado del wizard —
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [networkRetry, setNetworkRetry] = useState(false)
  const [createdEventId, setCreatedEventId] = useState<string | null>(null)

  // — Draft —
  const draftKey = user ? `eventDraft_${user.uid}_new` : ''
  const { pendingDraft, saveDraft, clearDraft, dismissPrompt } = useFormDraft<EventDraftFields>(draftKey)

  function applyDraft(fields: EventDraftFields) {
    setName(fields.name)
    setDate(fields.date)
    setStartTime(fields.startTime)
    setEndTime(fields.endTime)
    setLocation(fields.location)
    setDescription(fields.description)
    setDressCode(fields.dressCode || '')
    setTemplateId(fields.templateId)
    setAccentColor(fields.accentColor)
    setWelcomeMessage(fields.welcomeMessage)
    setMapsUrl(fields.mapsUrl)
    setEntryMode(fields.entryMode)
    setCapacity(fields.capacity || '100')
    setCustomFields(fields.customFields)
    setRequiresPayment(fields.requiresPayment)
    setTicketPrice(fields.ticketPrice)
    setCurrency(fields.currency)
    setPaymentInstructions(fields.paymentInstructions)
    setTimeline(fields.timeline || [])
    if (fields.coverImage) setCoverImage(fields.coverImage)
  }

  useEffect(() => {
    if (!draftKey || pendingDraft) return
    const id = setInterval(() => {
      const hasContent = name.trim() || date || location.trim() || description.trim()
      if (!hasContent) return
      saveDraft({
        name, date, startTime, endTime, location, description, dressCode, templateId, accentColor,
        welcomeMessage, mapsUrl, entryMode, capacity, customFields, requiresPayment,
        ticketPrice, currency, paymentInstructions, coverImage, timeline,
      })
    }, DRAFT_SAVE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [
    draftKey, pendingDraft, name, date, startTime, endTime, location, description, dressCode, templateId,
    accentColor, welcomeMessage, mapsUrl, entryMode, capacity, customFields, requiresPayment,
    ticketPrice, currency, paymentInstructions, coverImage, timeline, saveDraft,
  ])

  // — Validación por paso —
  function canProceedStep(s: number): boolean {
    if (s === 1) return !!(name.trim() && date && location.trim())
    if (s === 2) {
      const { error: capErr } = parseCapacity(capacity)
      return capErr === null
    }
    return true
  }

  const canProceed = canProceedStep(step)

  function handleNext() {
    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      void submitEvent()
    }
  }

  function handlePrevious() {
    setStep((s) => Math.max(1, s - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

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
        dressCode: dressCode.trim() || undefined,
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
        timeline,
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

  function adjustCapacity(delta: number) {
    const current = parseInt(capacity) || 0
    const next = Math.max(1, current + delta)
    setCapacity(String(next))
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

      {/* Modal de éxito */}
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

      <WizardContainer
        currentStep={step}
        totalSteps={TOTAL_STEPS}
        stepLabels={STEP_LABELS}
        onNext={handleNext}
        onPrevious={handlePrevious}
        canProceed={canProceed}
        isSubmitting={loading}
      >
        {/* ── PASO 1: Lo esencial ── */}
        <WizardStep number={1} currentStep={step}>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Solo toma 30 segundos. Puedes personalizar el diseño en el paso 3.
          </p>

          <div className="space-y-5">
            <div>
              <label htmlFor="event-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nombre del evento *
              </label>
              <input
                id="event-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mi graduación, Boda de Ana y Luis…"
                autoFocus
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="event-location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Lugar *
              </label>
              <input
                id="event-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Salón Los Olivos"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <p className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Fecha y hora *
              </p>
              <EventScheduleField
                date={date}
                onDateChange={setDate}
                startTime={startTime}
                onStartTimeChange={setStartTime}
                endTime={endTime}
                onEndTimeChange={setEndTime}
              />
            </div>
          </div>
        </WizardStep>

        {/* ── PASO 2: ¿Cómo entran? ── */}
        <WizardStep number={2} currentStep={step}>
          <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2.5 mb-6">
            ⚠️ Elige con cuidado — esto no se puede cambiar después de crear el evento.
          </p>

          <EntryModeSelector value={entryMode} onChange={setEntryMode} />

          {/* Capacidad */}
          <div className="mt-6 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Límite de invitados *
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => adjustCapacity(-10)}
                className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-lg font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors select-none"
                aria-label="Reducir 10"
              >
                −
              </button>
              <input
                type="number"
                min="1"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-center font-semibold text-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => adjustCapacity(10)}
                className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-lg font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors select-none"
                aria-label="Aumentar 10"
              >
                +
              </button>
            </div>
            {capacityHint(capacity) && (
              <p className="text-xs text-gray-400 mt-2 text-center">
                {capacityHint(capacity)} · {capacity} personas
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Si el cupo se llena, los nuevos invitados se agregan a lista de espera.
            </p>
          </div>
        </WizardStep>

        {/* ── PASO 3: Personalización ── */}
        <WizardStep number={3} currentStep={step}>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Todo es opcional — puedes editarlo en cualquier momento desde el evento.
          </p>

          <div className="space-y-5">
            {/* Plantilla visual */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  Plantilla del pase
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Identidad visual que verán tus invitados. Puedes cambiarla después.
                </p>
              </div>
              <TemplatePicker
                selected={templateId}
                onSelect={setTemplateId}
                previewData={{ eventName: name, date, location, mapsUrl, coverImage, accentColor, welcomeMessage }}
              />
            </div>

            {/* Personalización */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                Imagen y colores
              </h2>

              {/* Portada */}
              <div>
                <label htmlFor="event-cover-image" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Imagen de portada
                </label>
                <input
                  id="event-cover-image"
                  ref={coverFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onCoverFileSelected}
                  className="hidden"
                />
                {coverImage ? (
                  <div className="relative rounded-lg overflow-hidden h-32 bg-gray-100">
                    <img
                      src={optimizedImageUrl(coverImage, 800)}
                      alt="Portada"
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={clearCover}
                      className="absolute top-2 right-2 bg-black/50 text-white text-xs rounded-md px-2 py-1"
                    >
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

              {/* Color + bienvenida */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="event-accent-color" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Color de acento
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="event-accent-color"
                      type="color"
                      value={accentColor || getTemplate(templateId).vars.accent}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="h-10 w-14 border border-gray-300 rounded-md cursor-pointer"
                    />
                    <span className="text-xs text-gray-500">
                      {accentColor || `De la plantilla`}
                    </span>
                  </div>
                </div>
                <div>
                  <label htmlFor="event-welcome-message" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Mensaje de bienvenida
                  </label>
                  <input
                    id="event-welcome-message"
                    type="text"
                    value={welcomeMessage}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                    placeholder="¡Te esperamos!"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* Detalles adicionales (collapsible) */}
            <details className="group border border-gray-200 dark:border-gray-700 rounded-xl">
              <summary className="cursor-pointer select-none px-4 py-3.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-2 transition-colors list-none">
                <span className="group-open:hidden">＋</span>
                <span className="hidden group-open:inline">−</span>
                Descripción y mapa (opcional)
              </summary>
              <div className="px-4 pb-4 pt-1 space-y-4">
                <div>
                  <label htmlFor="event-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Descripción
                  </label>
                  <textarea
                    id="event-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Cuéntales a tus invitados más detalles sobre el evento…"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label htmlFor="event-dress-code" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Vestimenta (opcional)
                  </label>
                  <input
                    id="event-dress-code"
                    type="text"
                    value={dressCode}
                    onChange={(e) => setDressCode(e.target.value)}
                    maxLength={100}
                    placeholder="Ej: Formal, Casual, Todo de blanco…"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label htmlFor="event-maps-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Link de Google Maps
                  </label>
                  <input
                    id="event-maps-url"
                    type="url"
                    value={mapsUrl}
                    onChange={(e) => setMapsUrl(e.target.value)}
                    placeholder="https://maps.google.com/maps?q=..."
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Pega el link completo de Google Maps (desde el navegador, no el link corto).
                  </p>
                </div>
              </div>
            </details>

            {/* Programa del evento (timeline) */}
            <details className="group border border-gray-200 dark:border-gray-700 rounded-xl">
              <summary className="cursor-pointer select-none px-4 py-3.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-2 transition-colors list-none">
                <span className="group-open:hidden">＋</span>
                <span className="hidden group-open:inline">−</span>
                Programa del evento (opcional)
              </summary>
              <div className="px-4 pb-4 pt-1 space-y-2">
                <p className="text-xs text-gray-500 mb-3">
                  Muestra a tus invitados el orden del día en su pase. Ej: 19:00 Recepción, 20:30 Cena, 22:00 DJ…
                </p>
                <TimelineEditor entries={timeline} onChange={setTimeline} />
              </div>
            </details>

            {/* Campos personalizados */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  Campos de registro
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Los invitados siempre ingresan nombre y teléfono. Puedes agregar campos extra.
                </p>
              </div>
              <div className="flex gap-2 text-xs text-gray-400 border border-gray-100 dark:border-gray-700 rounded-md px-3 py-2 bg-gray-50 dark:bg-gray-700/30">
                <span className="font-medium text-gray-600 dark:text-gray-300">Fijos:</span> Nombre · Teléfono
              </div>
              <CustomFieldsBuilder fields={customFields} onChange={setCustomFields} />
            </div>

            {/* Cobro de entrada */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
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
                    El pago se confirma manualmente: marcás a cada invitado como pagado desde la lista o al escanear su pase.
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label htmlFor="event-ticket-price" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Precio por persona
                      </label>
                      <input
                        id="event-ticket-price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={ticketPrice}
                        onChange={(e) => setTicketPrice(e.target.value)}
                        placeholder="Ej: 5000"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label htmlFor="event-currency" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Moneda
                      </label>
                      <input
                        id="event-currency"
                        type="text"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        placeholder="$"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="event-payment-instructions" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Instrucciones de pago
                    </label>
                    <textarea
                      id="event-payment-instructions"
                      value={paymentInstructions}
                      onChange={(e) => setPaymentInstructions(e.target.value)}
                      rows={3}
                      placeholder="Ej: Transferí a alias fiesta.maria.mp, o por Mercado Pago: https://..."
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Los invitados verán esto en su pase junto al monto a pagar.
                    </p>
                  </div>
                </>
              )}
            </div>

            <p className="text-sm text-center text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-md px-3 py-2">
              🎉 Todas las funciones Premium (reportes, recordatorios, notificaciones) están incluidas gratis mientras damos a conocer el servicio.
            </p>

            {error && (
              <div className="text-sm text-red-600 dark:text-red-400">
                <p>{error}</p>
                {networkRetry && (
                  <button
                    type="button"
                    onClick={() => void submitEvent()}
                    className="mt-1 font-medium underline"
                  >
                    Reintentar ahora
                  </button>
                )}
              </div>
            )}
          </div>
        </WizardStep>
      </WizardContainer>
    </>
  )
}
