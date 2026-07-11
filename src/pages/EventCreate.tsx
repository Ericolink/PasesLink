import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { createEvent } from '../firebase/events'
import { useCoverPhoto } from '../hooks/useCoverPhoto'
import { useFormDraft } from '../hooks/useFormDraft'
import { isNetworkError } from '../utils/network'
import { parseCapacity } from '../utils/validationRules'
import { ImageCropModal } from '../components/ImageCropModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DraftRecoveryModal } from '../components/DraftRecoveryModal'
import { IconCheckCircle } from '../components/Icons'
import { WizardContainer, WizardStep } from '../components/Wizard'
import { StepBasicInfo } from '../components/EventCreation/steps/StepBasicInfo'
import { StepInvitationMethod } from '../components/EventCreation/steps/StepInvitationMethod'
import { StepImageAndColors } from '../components/EventCreation/steps/StepImageAndColors'
import { StepDescriptionLocation } from '../components/EventCreation/steps/StepDescriptionLocation'
import { StepSchedule } from '../components/EventCreation/steps/StepSchedule'
import { StepRegistrationFields } from '../components/EventCreation/steps/StepRegistrationFields'
import { StepReviewTemplate } from '../components/EventCreation/steps/StepReviewTemplate'
import type { CustomField, EntryMode, PaymentMethod, TemplateId, TimelineEntry } from '../types'

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
  paymentMethods: PaymentMethod[]
  ticketPrice: string
  currency: string
  paymentInstructions: string
  organizerContactPhone: string
  coverImage: string
  timeline: TimelineEntry[]
}

const DRAFT_SAVE_INTERVAL_MS = 5000

type StepKey = 1 | 2 | 3 | 4 | 5 | 6 | 7

const ALL_STEP_DEFS: { key: StepKey; label: string }[] = [
  { key: 1, label: 'Información básica' },
  { key: 2, label: 'Método de invitación' },
  { key: 3, label: 'Imagen y colores' },
  { key: 4, label: 'Descripción y ubicación' },
  { key: 5, label: 'Programa del evento' },
  { key: 6, label: 'Campos de registro' },
  { key: 7, label: 'Revisión y plantilla' },
]

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
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(['transfer'])
  const [ticketPrice, setTicketPrice] = useState('')
  const [currency, setCurrency] = useState('$')
  const [paymentInstructions, setPaymentInstructions] = useState('')
  const [organizerContactPhone, setOrganizerContactPhone] = useState('')
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])

  // — Estado del wizard —
  const [step, setStep] = useState<StepKey>(1)
  // Si no es null, el organizador saltó acá desde el resumen final (paso 7)
  // para editar una sola sección — al confirmar, vuelve directo a ese paso.
  const [returnStep, setReturnStep] = useState<StepKey | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [networkRetry, setNetworkRetry] = useState(false)
  const [createdEventId, setCreatedEventId] = useState<string | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  // El paso "Campos de registro" no aplica a eventos por lista (no hay
  // formulario de auto-registro para invitados con QR asignado).
  const visibleSteps = useMemo(
    () => ALL_STEP_DEFS.filter((s) => s.key !== 6 || entryMode !== 'list'),
    [entryMode],
  )

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
    setPaymentMethods(fields.paymentMethods?.length ? fields.paymentMethods : ['transfer'])
    setTicketPrice(fields.ticketPrice)
    setCurrency(fields.currency)
    setPaymentInstructions(fields.paymentInstructions)
    setOrganizerContactPhone(fields.organizerContactPhone || '')
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
        welcomeMessage, mapsUrl, entryMode, capacity, customFields, requiresPayment, paymentMethods,
        ticketPrice, currency, paymentInstructions, organizerContactPhone, coverImage, timeline,
      })
    }, DRAFT_SAVE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [
    draftKey, pendingDraft, name, date, startTime, endTime, location, description, dressCode, templateId,
    accentColor, welcomeMessage, mapsUrl, entryMode, capacity, customFields, requiresPayment, paymentMethods,
    ticketPrice, currency, paymentInstructions, organizerContactPhone, coverImage, timeline, saveDraft,
  ])

  // — Validación por paso —
  function canProceedStep(s: StepKey): boolean {
    if (s === 1) return !!(name.trim() && date && location.trim())
    if (s === 2) {
      const { error: capErr } = parseCapacity(capacity)
      if (capErr) return false
      if (requiresPayment) return paymentMethods.length > 0
      return true
    }
    return true
  }

  function togglePaymentMethod(method: PaymentMethod) {
    setPaymentMethods((methods) =>
      methods.includes(method) ? methods.filter((m) => m !== method) : [...methods, method],
    )
  }

  const canProceed = canProceedStep(step)
  const stepPosition = visibleSteps.findIndex((s) => s.key === step) + 1

  function goToStepForEdit(key: StepKey) {
    setReturnStep(7)
    setStep(key)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleNext() {
    if (returnStep) {
      setStep(returnStep)
      setReturnStep(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const idx = visibleSteps.findIndex((s) => s.key === step)
    if (idx < visibleSteps.length - 1) {
      setStep(visibleSteps[idx + 1].key)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      void submitEvent()
    }
  }

  function handlePrevious() {
    if (returnStep) {
      setStep(returnStep)
      setReturnStep(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const idx = visibleSteps.findIndex((s) => s.key === step)
    setStep(visibleSteps[Math.max(0, idx - 1)].key)
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
        paymentMethods: requiresPayment ? paymentMethods : [],
        ticketPrice: requiresPayment ? parseFloat(ticketPrice) || 0 : 0,
        currency: requiresPayment ? currency.trim() : '',
        paymentInstructions: requiresPayment ? paymentInstructions.trim() : '',
        organizerContactPhone: requiresPayment ? organizerContactPhone.trim() : '',
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
          aspect={16 / 9}
          onCrop={onCoverCropConfirmed}
          onCancel={onCoverCropCancelled}
        />
      )}

      <ConfirmDialog
        open={showCancelConfirm}
        danger
        title="¿Salir sin terminar?"
        message="Tu evento todavía no se creó. Lo que ya escribiste queda guardado y te lo ofrecemos la próxima vez que entres acá."
        confirmLabel="Salir"
        cancelLabel="Seguir editando"
        onConfirm={() => navigate('/dashboard')}
        onCancel={() => setShowCancelConfirm(false)}
      />

      <WizardContainer
        currentStep={stepPosition}
        totalSteps={visibleSteps.length}
        stepLabels={visibleSteps.map((s) => s.label)}
        onNext={handleNext}
        onPrevious={handlePrevious}
        onCancel={() => setShowCancelConfirm(true)}
        canProceed={canProceed}
        isSubmitting={loading}
        nextLabel={returnStep ? 'Confirmar cambios →' : undefined}
      >
        {returnStep && (
          <p className="text-sm text-primary bg-primary/10 rounded-lg px-3 py-2.5 mb-5">
            Estás editando desde la revisión final — al confirmar, volvés directo ahí.
          </p>
        )}

        <WizardStep number={1} currentStep={step}>
          <StepBasicInfo
            name={name}
            onNameChange={setName}
            location={location}
            onLocationChange={setLocation}
            date={date}
            onDateChange={setDate}
            startTime={startTime}
            onStartTimeChange={setStartTime}
            endTime={endTime}
            onEndTimeChange={setEndTime}
          />
        </WizardStep>

        <WizardStep number={2} currentStep={step}>
          <StepInvitationMethod
            entryMode={entryMode}
            onEntryModeChange={setEntryMode}
            capacity={capacity}
            onCapacityChange={setCapacity}
            requiresPayment={requiresPayment}
            onRequiresPaymentChange={setRequiresPayment}
            paymentMethods={paymentMethods}
            onTogglePaymentMethod={togglePaymentMethod}
            ticketPrice={ticketPrice}
            onTicketPriceChange={setTicketPrice}
            currency={currency}
            onCurrencyChange={setCurrency}
            paymentInstructions={paymentInstructions}
            onPaymentInstructionsChange={setPaymentInstructions}
            organizerContactPhone={organizerContactPhone}
            onOrganizerContactPhoneChange={setOrganizerContactPhone}
          />
        </WizardStep>

        <WizardStep number={3} currentStep={step}>
          <StepImageAndColors
            coverFileInputRef={coverFileInputRef}
            coverImage={coverImage}
            coverUploading={coverUploading}
            coverError={coverError}
            openCoverPicker={openCoverPicker}
            onCoverFileSelected={onCoverFileSelected}
            clearCover={clearCover}
            accentColor={accentColor}
            onAccentColorChange={setAccentColor}
            templateId={templateId}
          />
        </WizardStep>

        <WizardStep number={4} currentStep={step}>
          <StepDescriptionLocation
            description={description}
            onDescriptionChange={setDescription}
            dressCode={dressCode}
            onDressCodeChange={setDressCode}
            mapsUrl={mapsUrl}
            onMapsUrlChange={setMapsUrl}
            welcomeMessage={welcomeMessage}
            onWelcomeMessageChange={setWelcomeMessage}
          />
        </WizardStep>

        <WizardStep number={5} currentStep={step}>
          <StepSchedule timeline={timeline} onChange={setTimeline} />
        </WizardStep>

        <WizardStep number={6} currentStep={step}>
          <StepRegistrationFields customFields={customFields} onChange={setCustomFields} />
        </WizardStep>

        <WizardStep number={7} currentStep={step}>
          <StepReviewTemplate
            name={name}
            date={date}
            location={location}
            entryMode={entryMode}
            requiresPayment={requiresPayment}
            paymentMethods={paymentMethods}
            ticketPrice={ticketPrice}
            currency={currency}
            coverImage={coverImage}
            accentColor={accentColor}
            description={description}
            dressCode={dressCode}
            mapsUrl={mapsUrl}
            welcomeMessage={welcomeMessage}
            timeline={timeline}
            customFields={customFields}
            showRegistrationFieldsRow={entryMode !== 'list'}
            templateId={templateId}
            onSelectTemplate={setTemplateId}
            onEditStep={(key) => goToStepForEdit(key as StepKey)}
          />
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 mt-4">
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
        </WizardStep>
      </WizardContainer>
    </>
  )
}
