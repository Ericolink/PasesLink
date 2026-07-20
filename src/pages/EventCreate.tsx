import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { createEvent } from '../firebase/events'
import { useCoverPhoto } from '../hooks/useCoverPhoto'
import { useFormDraft } from '../hooks/useFormDraft'
import { isNetworkError } from '../utils/network'
import { isEventPast } from '../utils/time'
import { parseCapacity, parseMaxCompanions } from '../utils/validationRules'
import { ImageCropModal } from '../components/ImageCropModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DraftRecoveryModal } from '../components/DraftRecoveryModal'
import { Modal } from '../components/Modal'
import { Button } from '../components/Button'
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
  maxCompanions: string
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

// Auditoría de escalabilidad (F19): todos los campos del formulario en un
// solo objeto de estado (en vez de 22 useState individuales) + una función
// genérica updateField para tocarlos — mismo criterio en EditEventForm.tsx.
// `coverImage` queda AFUERA a propósito: lo dueña useCoverPhoto (recorte,
// subida, error), no este formulario.
type FormFields = Omit<EventDraftFields, 'coverImage'>

const DRAFT_SAVE_DEBOUNCE_MS = 5000

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
  const [form, setForm] = useState<FormFields>({
    name: '',
    date: '',
    startTime: '',
    endTime: '',
    location: '',
    description: '',
    dressCode: '',
    templateId: 'default',
    accentColor: '',
    welcomeMessage: '',
    mapsUrl: '',
    entryMode: 'list',
    capacity: '100',
    maxCompanions: '0',
    customFields: [],
    requiresPayment: false,
    paymentMethods: ['transfer'],
    ticketPrice: '',
    currency: '$',
    paymentInstructions: '',
    organizerContactPhone: '',
    timeline: [],
  })

  function updateField<K extends keyof FormFields>(field: K, value: FormFields[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

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
    () => ALL_STEP_DEFS.filter((s) => s.key !== 6 || form.entryMode !== 'list'),
    [form.entryMode],
  )

  // — Draft —
  const draftKey = user ? `eventDraft_${user.uid}_new` : ''
  const { pendingDraft, saveDraft, clearDraft, dismissPrompt, lastSavedAt } = useFormDraft<EventDraftFields>(draftKey)

  function applyDraft(fields: EventDraftFields) {
    const { coverImage: draftCoverImage, ...rest } = fields
    // Fallbacks para campos que un borrador guardado por una versión más
    // vieja de la app puede no tener en localStorage.
    setForm({
      ...rest,
      dressCode: rest.dressCode || '',
      capacity: rest.capacity || '100',
      maxCompanions: rest.maxCompanions ?? '0',
      paymentMethods: rest.paymentMethods?.length ? rest.paymentMethods : ['transfer'],
      organizerContactPhone: rest.organizerContactPhone || '',
      timeline: rest.timeline || [],
    })
    if (draftCoverImage) setCoverImage(draftCoverImage)
  }

  // Debounce explícito (antes un setInterval que, al tener todos estos campos
  // en las deps, se recreaba en cada tecla — terminaba comportándose como un
  // debounce por accidente, nunca como un guardado realmente periódico
  // mientras el usuario tipeaba sin pausar). setTimeout deja esa intención
  // clara: guarda DRAFT_SAVE_DEBOUNCE_MS después del último cambio, no cada
  // tanto tiempo fijo. Con los campos consolidados en `form` (auditoría
  // F19), el array de dependencias se reduce a la referencia del objeto en
  // vez de listar cada campo por separado — mismo comportamiento (`form`
  // cambia de referencia en cada updateField), menos ruido.
  useEffect(() => {
    if (!draftKey || pendingDraft) return
    const id = setTimeout(() => {
      const hasContent = form.name.trim() || form.date || form.location.trim() || form.description.trim()
      if (!hasContent) return
      saveDraft({ ...form, coverImage })
    }, DRAFT_SAVE_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [draftKey, pendingDraft, form, coverImage, saveDraft])

  // — Validación por paso —
  function canProceedStep(s: StepKey): boolean {
    if (s === 1) return !!(form.name.trim() && form.date && !isEventPast(form.date) && form.location.trim())
    if (s === 2) {
      const { error: capErr } = parseCapacity(form.capacity)
      if (capErr) return false
      const { error: companionsErr } = parseMaxCompanions(form.maxCompanions)
      if (companionsErr) return false
      if (form.requiresPayment) return form.paymentMethods.length > 0 && parseFloat(form.ticketPrice) > 0
      return true
    }
    return true
  }

  function togglePaymentMethod(method: PaymentMethod) {
    setForm((prev) => ({
      ...prev,
      paymentMethods: prev.paymentMethods.includes(method)
        ? prev.paymentMethods.filter((m) => m !== method)
        : [...prev.paymentMethods, method],
    }))
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
    const { value: parsedCapacity, error: capacityError } = parseCapacity(form.capacity)
    if (capacityError) {
      setError(capacityError)
      return
    }
    const { value: parsedMaxCompanions, error: maxCompanionsError } = parseMaxCompanions(form.maxCompanions)
    if (maxCompanionsError) {
      setError(maxCompanionsError)
      return
    }
    setLoading(true)
    try {
      const eventId = await createEvent(user.uid, {
        name: form.name,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        location: form.location,
        description: form.description,
        dressCode: form.dressCode.trim() || undefined,
        coverImage,
        accentColor: form.accentColor,
        templateId: form.templateId,
        welcomeMessage: form.welcomeMessage,
        mapsUrl: form.mapsUrl.trim() || undefined,
        entryMode: form.entryMode,
        capacity: parsedCapacity,
        maxCompanions: parsedMaxCompanions,
        customFields: form.customFields,
        requiresPayment: form.requiresPayment,
        paymentMethods: form.requiresPayment ? form.paymentMethods : [],
        ticketPrice: form.requiresPayment ? parseFloat(form.ticketPrice) || 0 : 0,
        currency: form.requiresPayment ? form.currency.trim() : '',
        paymentInstructions: form.requiresPayment ? form.paymentInstructions.trim() : '',
        organizerContactPhone: form.requiresPayment ? form.organizerContactPhone.trim() : '',
        timeline: form.timeline,
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

      {/* Modal de éxito — sin onClose real (no hay forma de "cancelar" un
          evento ya creado): el backdrop/Escape no hacen nada, las dos únicas
          salidas son los botones. */}
      <Modal open={!!createdEventId} onClose={() => {}} label="Evento creado" variant="dialog" maxWidth="max-w-sm">
        <div className="p-6 text-center">
          <IconCheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">¡Evento creado!</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{form.name} ya está listo.</p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => navigate(`/events/${createdEventId}#${form.entryMode === 'open' ? 'open-entry-links' : 'add-guests'}`)}>
              Próximo paso: {form.entryMode === 'open' ? 'Compartir enlace de registro' : 'Agregar invitados'}
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/events/${createdEventId}`)}>
              Ir al evento
            </Button>
          </div>
        </div>
      </Modal>

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
        savedLabel={lastSavedAt ? `Guardado ${new Date(lastSavedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}` : undefined}
      >
        {returnStep && (
          <p className="text-sm text-primary bg-primary/10 rounded-lg px-3 py-2.5 mb-5">
            Estás editando desde la revisión final — al confirmar, volvés directo ahí.
          </p>
        )}

        <WizardStep number={1} currentStep={step}>
          <StepBasicInfo
            name={form.name}
            onNameChange={(v) => updateField('name', v)}
            location={form.location}
            onLocationChange={(v) => updateField('location', v)}
            date={form.date}
            onDateChange={(v) => updateField('date', v)}
            dateMin={new Date().toISOString().slice(0, 10)}
            startTime={form.startTime}
            onStartTimeChange={(v) => updateField('startTime', v)}
            endTime={form.endTime}
            onEndTimeChange={(v) => updateField('endTime', v)}
          />
          {form.date && isEventPast(form.date) && (
            <p className="text-xs text-red-500 mt-1">La fecha ya pasó — elegí una fecha de hoy en adelante.</p>
          )}
        </WizardStep>

        <WizardStep number={2} currentStep={step}>
          <StepInvitationMethod
            entryMode={form.entryMode}
            onEntryModeChange={(v) => updateField('entryMode', v)}
            capacity={form.capacity}
            onCapacityChange={(v) => updateField('capacity', v)}
            maxCompanions={form.maxCompanions}
            onMaxCompanionsChange={(v) => updateField('maxCompanions', v)}
            requiresPayment={form.requiresPayment}
            onRequiresPaymentChange={(v) => updateField('requiresPayment', v)}
            paymentMethods={form.paymentMethods}
            onTogglePaymentMethod={togglePaymentMethod}
            ticketPrice={form.ticketPrice}
            onTicketPriceChange={(v) => updateField('ticketPrice', v)}
            currency={form.currency}
            onCurrencyChange={(v) => updateField('currency', v)}
            paymentInstructions={form.paymentInstructions}
            onPaymentInstructionsChange={(v) => updateField('paymentInstructions', v)}
            organizerContactPhone={form.organizerContactPhone}
            onOrganizerContactPhoneChange={(v) => updateField('organizerContactPhone', v)}
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
            accentColor={form.accentColor}
            onAccentColorChange={(v) => updateField('accentColor', v)}
            templateId={form.templateId}
          />
        </WizardStep>

        <WizardStep number={4} currentStep={step}>
          <StepDescriptionLocation
            description={form.description}
            onDescriptionChange={(v) => updateField('description', v)}
            dressCode={form.dressCode}
            onDressCodeChange={(v) => updateField('dressCode', v)}
            mapsUrl={form.mapsUrl}
            onMapsUrlChange={(v) => updateField('mapsUrl', v)}
            welcomeMessage={form.welcomeMessage}
            onWelcomeMessageChange={(v) => updateField('welcomeMessage', v)}
          />
        </WizardStep>

        <WizardStep number={5} currentStep={step}>
          <StepSchedule timeline={form.timeline} onChange={(v) => updateField('timeline', v)} />
        </WizardStep>

        <WizardStep number={6} currentStep={step}>
          <StepRegistrationFields customFields={form.customFields} onChange={(v) => updateField('customFields', v)} />
        </WizardStep>

        <WizardStep number={7} currentStep={step}>
          <StepReviewTemplate
            name={form.name}
            date={form.date}
            location={form.location}
            entryMode={form.entryMode}
            requiresPayment={form.requiresPayment}
            paymentMethods={form.paymentMethods}
            ticketPrice={form.ticketPrice}
            currency={form.currency}
            coverImage={coverImage}
            accentColor={form.accentColor}
            description={form.description}
            dressCode={form.dressCode}
            mapsUrl={form.mapsUrl}
            welcomeMessage={form.welcomeMessage}
            timeline={form.timeline}
            customFields={form.customFields}
            showRegistrationFieldsRow={form.entryMode !== 'list'}
            templateId={form.templateId}
            onSelectTemplate={(v) => updateField('templateId', v)}
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
