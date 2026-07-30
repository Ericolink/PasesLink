import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { createEvent, updateEventDetails } from '../firebase/events'
import { buildEventInput, type EventDraftFields, type FormFields } from '../utils/eventFormFields'
import { DEFAULT_PHONE_COUNTRY } from '../components/CountryCodeSelect'
import { useCoverPhoto } from '../hooks/useCoverPhoto'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFormDraft } from '../hooks/useFormDraft'
import { useEventPreviewData } from '../hooks/useEventPreviewData'
import { InvitationPreview } from '../components/InvitationPreview'
import { isNetworkError } from '../utils/network'
import { isEventPast } from '../utils/time'
import { parseCapacity, parseMaxCompanions } from '../utils/validationRules'
import { ImageCropModal } from '../components/ImageCropModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DraftRecoveryModal } from '../components/DraftRecoveryModal'
import { AccessibleModal } from '../components/accessibility/AccessibleModal'
import { AccessibleButton } from '../components/accessibility/AccessibleButton'
import { FieldError } from '../components/accessibility/AccessibleField'
import { useFocusFirstInvalidField } from '../hooks/useFocusFirstInvalidField'
import { IconCheckCircle } from '../components/accessibility/AccessibleIcon'
import { WizardContainer, WizardStep } from '../components/Wizard'
import { StepEventType } from '../components/EventCreation/steps/StepEventType'
import { StepBasicInfo } from '../components/EventCreation/steps/StepBasicInfo'
import { StepCapacityAndPayment } from '../components/EventCreation/steps/StepCapacityAndPayment'
import { StepImageAndColors } from '../components/EventCreation/steps/StepImageAndColors'
import { StepDescriptionLocation } from '../components/EventCreation/steps/StepDescriptionLocation'
import { StepSchedule } from '../components/EventCreation/steps/StepSchedule'
import { StepRegistrationFields } from '../components/EventCreation/steps/StepRegistrationFields'
import { StepReviewTemplate } from '../components/EventCreation/steps/StepReviewTemplate'
import type { PaymentMethod } from '../types'

const DRAFT_SAVE_DEBOUNCE_MS = 5000

type StepKey = 1 | 2 | 3 | 4 | 5 | 6

// Fase 2 del rediseño del wizard: el paso mezclado que combinaba tipo de
// evento + capacidad + pago (antes StepInvitationMethod) se separó en dos —
// el tipo de evento es una decisión de forma que no necesita preview (ver
// showPreviewPanel), capacidad/pago sí. De paso se agruparon los dos pasos
// más livianos (Descripción/Programa y Capacidad/Registro) con el contenido
// que comparten tema, bajando de 7 a 6 pasos sin perder ningún campo.
const STEP_DEFS: { key: StepKey; label: string }[] = [
  { key: 1, label: 'Tipo de evento' },
  { key: 2, label: 'Información básica' },
  { key: 3, label: 'Imagen y colores' },
  { key: 4, label: 'Descripción y programa' },
  { key: 5, label: 'Acceso e invitados' },
  { key: 6, label: 'Revisión y plantilla' },
]

export function EventCreate() {
  useDocumentTitle('Crear evento')
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
    secondaryFontFamily: '',
    buttonVariant: 'solid',
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
    organizerContactPhoneCountry: DEFAULT_PHONE_COUNTRY,
    timeline: [],
  })

  function updateField<K extends keyof FormFields>(field: K, value: FormFields[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // — Estado del wizard —
  const [step, setStep] = useState<StepKey>(1)
  // Si no es null, el organizador saltó acá desde el resumen final (paso 6)
  // para editar una sola sección — al confirmar, vuelve directo a ese paso.
  const [returnStep, setReturnStep] = useState<StepKey | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorAttempt, setErrorAttempt] = useState(0)
  const errorRef = useRef<HTMLDivElement>(null)
  useFocusFirstInvalidField(errorRef, errorAttempt)
  const [networkRetry, setNetworkRetry] = useState(false)
  const [createdEventId, setCreatedEventId] = useState<string | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  // Fase 3 del rediseño del wizard: el evento se crea en Firestore apenas se
  // completa el paso 2 (Información básica), no recién al final — ver
  // persistProgress(). Separado de `createdEventId` (que sigue gatillando
  // solo el modal de éxito del último paso): este id existe desde antes, en
  // silencio, mientras el organizador sigue completando el resto.
  const [draftEventId, setDraftEventId] = useState<string | null>(null)
  const [lastPersistedAt, setLastPersistedAt] = useState<number | null>(null)

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
      organizerContactPhoneCountry: rest.organizerContactPhoneCountry || DEFAULT_PHONE_COUNTRY,
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
    // Una vez que el evento ya existe en Firestore (draftEventId), esa es la
    // fuente de verdad — seguir guardando en localStorage sería un segundo
    // borrador redundante compitiendo con el primero.
    if (!draftKey || pendingDraft || draftEventId) return
    const id = setTimeout(() => {
      const hasContent = form.name.trim() || form.date || form.location.trim() || form.description.trim()
      if (!hasContent) return
      saveDraft({ ...form, coverImage })
    }, DRAFT_SAVE_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [draftKey, pendingDraft, draftEventId, form, coverImage, saveDraft])

  // — Validación por paso —
  function canProceedStep(s: StepKey): boolean {
    if (s === 2) return !!(form.name.trim() && form.date && !isEventPast(form.date) && form.location.trim())
    if (s === 5) {
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
  const stepPosition = STEP_DEFS.findIndex((s) => s.key === step) + 1

  // Preview en vivo (Fase 1 del rediseño del wizard): visible del paso 2 al
  // 5. El paso 1 (tipo de evento) todavía no tiene nada que mostrar con
  // confianza y el paso 6 (revisión) ya trae su propio preview completo
  // dentro de TemplatePicker — duplicarlo ahí sería mostrar la misma
  // invitación dos veces en pantalla.
  const previewData = useEventPreviewData({
    name: form.name,
    date: form.date,
    location: form.location,
    mapsUrl: form.mapsUrl,
    coverImage,
    accentColor: form.accentColor,
    secondaryFontFamily: form.secondaryFontFamily,
    buttonVariant: form.buttonVariant,
    welcomeMessage: form.welcomeMessage,
    description: form.description,
    dressCode: form.dressCode,
    timeline: form.timeline,
  })
  const showPreviewPanel = step >= 2 && step <= 5

  function goToStepForEdit(key: StepKey) {
    setReturnStep(6)
    setStep(key)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Async desde la Fase 3: a partir del paso 2 (Información básica ya
  // válida), cada "Siguiente" persiste el progreso en Firestore antes de
  // avanzar (ver persistProgress) — si falla, no avanza, igual que hoy pasa
  // solo en el último paso.
  async function handleNext() {
    if (returnStep) {
      // El evento ya existe (solo se puede llegar acá saltando desde la
      // revisión final) — "Confirmar cambios" también persiste, para que el
      // label de guardado refleje la edición antes de volver al resumen.
      const id = await persistProgress()
      if (!id) return
      setStep(returnStep)
      setReturnStep(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const idx = STEP_DEFS.findIndex((s) => s.key === step)
    const isLastStep = idx === STEP_DEFS.length - 1
    if (step >= 2) {
      const id = await persistProgress()
      if (!id) return
      if (isLastStep) {
        setCreatedEventId(id)
        return
      }
    }
    if (!isLastStep) {
      setStep(STEP_DEFS[idx + 1].key)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  function handlePrevious() {
    if (returnStep) {
      setStep(returnStep)
      setReturnStep(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const idx = STEP_DEFS.findIndex((s) => s.key === step)
    setStep(STEP_DEFS[Math.max(0, idx - 1)].key)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Fase 3: crea el evento la primera vez que se llama (justo al salir del
  // paso 2), y lo actualiza incrementalmente las veces siguientes — misma
  // función de update que ya usa EditEventForm.tsx para eventos existentes.
  // Devuelve el id (existente o recién creado) o null si falló, para que
  // handleNext sepa si puede avanzar de paso.
  async function persistProgress(): Promise<string | null> {
    if (!user) return null
    setError('')
    setNetworkRetry(false)
    const { value: parsedCapacity, error: capacityError } = parseCapacity(form.capacity)
    if (capacityError) {
      setError(capacityError)
      setErrorAttempt((n) => n + 1)
      return null
    }
    const { value: parsedMaxCompanions, error: maxCompanionsError } = parseMaxCompanions(form.maxCompanions)
    if (maxCompanionsError) {
      setError(maxCompanionsError)
      setErrorAttempt((n) => n + 1)
      return null
    }
    setLoading(true)
    try {
      const input = buildEventInput(form, coverImage, parsedCapacity, parsedMaxCompanions)
      let eventId = draftEventId
      if (eventId) {
        await updateEventDetails(eventId, input)
      } else {
        eventId = await createEvent(user.uid, input)
        setDraftEventId(eventId)
        clearDraft()
      }
      setLastPersistedAt(Date.now())
      return eventId
    } catch (err) {
      if (isNetworkError(err)) {
        setError('Guardado localmente. Reintentando…')
        setNetworkRetry(true)
      } else {
        setError('No pudimos guardar los cambios. Intenta de nuevo.')
      }
      setErrorAttempt((n) => n + 1)
      return null
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

      {/* AccessibleModal de éxito — sin onClose real (no hay forma de "cancelar" un
          evento ya creado): el backdrop/Escape no hacen nada, las dos únicas
          salidas son los botones. */}
      <AccessibleModal open={!!createdEventId} onClose={() => {}} label="Invitación publicada" variant="dialog" maxWidth="max-w-sm">
        <div className="p-6 text-center">
          <IconCheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">¡Invitación publicada!</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{form.name} ya está listo.</p>
          <div className="flex flex-col gap-2">
            <AccessibleButton onClick={() => navigate(`/events/${createdEventId}#${form.entryMode === 'open' ? 'open-entry-links' : 'add-guests'}`)}>
              Próximo paso: {form.entryMode === 'open' ? 'Compartir enlace de registro' : 'Agregar invitados'}
            </AccessibleButton>
            <AccessibleButton variant="secondary" onClick={() => navigate(`/events/${createdEventId}`)}>
              Ir al evento
            </AccessibleButton>
          </div>
        </div>
      </AccessibleModal>

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
        message={
          draftEventId
            ? 'Ya guardamos tu evento con lo que llevás armado. Podés seguir completándolo cuando quieras desde tu panel.'
            : 'Tu evento todavía no se creó. Lo que ya escribiste queda guardado y te lo ofrecemos la próxima vez que entres acá.'
        }
        confirmLabel="Salir"
        cancelLabel="Seguir editando"
        onConfirm={() => navigate('/dashboard')}
        onCancel={() => setShowCancelConfirm(false)}
      />

      <WizardContainer
        currentStep={stepPosition}
        totalSteps={STEP_DEFS.length}
        stepLabels={STEP_DEFS.map((s) => s.label)}
        onNext={() => { void handleNext() }}
        onPrevious={handlePrevious}
        onCancel={() => setShowCancelConfirm(true)}
        canProceed={canProceed}
        isSubmitting={loading}
        nextLabel={returnStep ? 'Confirmar cambios →' : undefined}
        savedLabel={
          draftEventId && lastPersistedAt
            ? `Guardado en la nube · ${new Date(lastPersistedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`
            : lastSavedAt
            ? `Guardado ${new Date(lastSavedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`
            : undefined
        }
        preview={showPreviewPanel ? <InvitationPreview templateId={form.templateId} {...previewData} /> : undefined}
      >
        {returnStep && (
          <p className="text-sm text-primary bg-primary/10 rounded-lg px-3 py-2.5 mb-5">
            Estás editando desde la revisión final — al confirmar, volvés directo ahí.
          </p>
        )}

        {/* A partir de la Fase 3, persistProgress puede fallar en cualquier
            transición de paso (no solo en la revisión final) — este bloque
            vive fuera de los WizardStep para mostrarse sin importar en qué
            paso estaba el organizador cuando falló el guardado. */}
        {error && (
          <div ref={errorRef} className="mb-5">
            <FieldError message={error} />
            {networkRetry && (
              <button
                type="button"
                onClick={() => void handleNext()}
                className="mt-1 text-sm font-medium underline text-error"
              >
                Reintentar ahora
              </button>
            )}
          </div>
        )}

        <WizardStep number={1} currentStep={step}>
          <StepEventType entryMode={form.entryMode} onEntryModeChange={(v) => updateField('entryMode', v)} />
        </WizardStep>

        <WizardStep number={2} currentStep={step}>
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
            secondaryFontFamily={form.secondaryFontFamily}
            onSecondaryFontFamilyChange={(v) => updateField('secondaryFontFamily', v)}
            buttonVariant={form.buttonVariant}
            onButtonVariantChange={(v) => updateField('buttonVariant', v)}
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
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mt-8 mb-1">
            Programa del evento
          </h2>
          <StepSchedule timeline={form.timeline} onChange={(v) => updateField('timeline', v)} />
        </WizardStep>

        <WizardStep number={5} currentStep={step}>
          <StepCapacityAndPayment
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
            organizerContactPhoneCountry={form.organizerContactPhoneCountry}
            onOrganizerContactPhoneCountryChange={(v) => updateField('organizerContactPhoneCountry', v)}
          />
          {form.entryMode !== 'list' && (
            <>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mt-8 mb-1">
                Campos de registro
              </h2>
              <StepRegistrationFields customFields={form.customFields} onChange={(v) => updateField('customFields', v)} />
            </>
          )}
        </WizardStep>

        <WizardStep number={6} currentStep={step}>
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
            secondaryFontFamily={form.secondaryFontFamily}
            buttonVariant={form.buttonVariant}
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
        </WizardStep>
      </WizardContainer>
    </>
  )
}
