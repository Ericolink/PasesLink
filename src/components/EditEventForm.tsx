import { useEffect, useRef, useState } from 'react'
import type { CountryCode } from 'libphonenumber-js/min'
import { updateEventDetails } from '../firebase/events'
import { CountryCodeSelect, DEFAULT_PHONE_COUNTRY } from './CountryCodeSelect'
import { resolveMaxCompanions } from '../firebase/guests'
import { useCoverPhoto } from '../hooks/useCoverPhoto'
import { useApprovedCommunityTemplates } from '../hooks/useApprovedCommunityTemplates'
import { useFormDraft } from '../hooks/useFormDraft'
import { useLiveRef } from '../hooks/useLiveRef'
import { isNetworkError } from '../utils/network'
import { EVENT_NAME_MAX, parseCapacity, parseMaxCompanions, sanitizeDecimalInput } from '../utils/validationRules'
import { GUEST_MAX_COMPANIONS } from '../utils/validation'
import { ImageCropModal } from './ImageCropModal'
import { CustomFieldsBuilder } from './CustomFieldsBuilder'
import { TimelineEditor } from './TimelineEditor'
import { FaqEditor } from './FaqEditor'
import { TransportEditor } from './TransportEditor'
import { GiftEditor } from './GiftEditor'
import { GuestTagsEditor } from './GuestTagsEditor'
import { SectionsEditor } from './SectionsEditor'
import { MenuEditor } from './MenuEditor'
import { ReminderRulesEditor } from './ReminderRulesEditor'
import { TemplatePicker } from './TemplatePicker'
import { CoverImagePicker } from './CoverImagePicker'
import { DraftRecoveryModal } from './DraftRecoveryModal'
import { ConfirmDialog } from './ConfirmDialog'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { AccessibleField, Checkbox, FieldError } from './accessibility/AccessibleField'
import { useFocusFirstInvalidField } from '../hooks/useFocusFirstInvalidField'
import { EventScheduleField } from './EventScheduleField'
import { getTemplate, SECONDARY_FONT_OPTIONS } from '../templates/registry'
import { PAYMENT_METHOD_LABELS } from '../utils/paymentMethods'
import type { CommunityTemplateSnapshot, CustomField, EntryMode, EventData, FaqEntry, GuestSegmentTag, PaymentMethod, ReminderRule, TemplateId, TimelineEntry, TransportInfo, VisibilitySection } from '../types'

interface EventEditDraftFields {
  name: string
  date: string
  startTime: string
  endTime: string
  location: string
  description: string
  dressCode: string
  templateId: TemplateId
  communityTemplateSnapshot: CommunityTemplateSnapshot | null
  accentColor: string
  secondaryFontFamily: string
  buttonVariant: 'solid' | 'outline'
  welcomeMessage: string
  mapsUrl: string
  departureReminderBufferMinutes: string
  capacity: string
  attendeeLimitEnabled: boolean
  maxCompanions: string
  customFields: CustomField[]
  requiresPayment: boolean
  paymentMethods: PaymentMethod[]
  ticketPrice: string
  currency: string
  paymentInstructions: string
  organizerContactPhone: string
  organizerContactPhoneCountry: string
  coverImage: string
  timeline: TimelineEntry[]
  faq: FaqEntry[]
  transport: TransportInfo
  rsvpDeadline: string
  remindersEnabled: boolean
  reminderRules: ReminderRule[]
  guestTags: GuestSegmentTag[]
  vipTagId: string | null
  sections: VisibilitySection[]
  sectionVisibility: EventData['sectionVisibility']
  menu: EventData['menu']
  gifts: EventData['gifts']
}

// Auditoría de escalabilidad (F19): todos los campos del formulario en un
// solo objeto de estado (en vez de 21 useState individuales) + una función
// genérica updateField para tocarlos — mismo criterio en EventCreate.tsx.
// `coverImage` queda AFUERA a propósito: lo dueña useCoverPhoto (recorte,
// subida, error), no este formulario.
type FormFields = Omit<EventEditDraftFields, 'coverImage'>

interface ChangeEntry {
  label: string
  detail: string
}

const DRAFT_SAVE_INTERVAL_MS = 5000

// Encabezado + contenido de una sección plegable — mismo lenguaje visual que
// los "details" que ya usa EventDetail.tsx (Más estadísticas, Gestión del
// evento), para no introducir un segundo patrón de disclosure en la app.
function EditSection({
  title,
  subtitle,
  defaultOpen,
  children,
}: {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details
      className="group border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
      open={defaultOpen}
    >
      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none bg-gray-50 dark:bg-gray-700/30 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
        <span>
          <span className="block text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
          {subtitle && <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</span>}
        </span>
        <span className="text-xs text-gray-400 shrink-0 ml-3">
          <span className="group-open:hidden">▾ Ver</span>
          <span className="hidden group-open:inline">▴ Ocultar</span>
        </span>
      </summary>
      <div className="p-4 space-y-3 border-t border-gray-100 dark:border-gray-700">{children}</div>
    </details>
  )
}

export function EditEventForm({ event, onDone }: { event: EventData; onDone: () => void }) {
  const approvedCommunityTemplates = useApprovedCommunityTemplates()
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
  } = useCoverPhoto(event.coverImage || '')

  const [form, setForm] = useState<FormFields>({
    name: event.name,
    date: event.date,
    startTime: event.startTime || '',
    endTime: event.endTime || '',
    location: event.location,
    description: event.description || '',
    dressCode: event.dressCode || '',
    templateId: event.templateId || 'default',
    communityTemplateSnapshot: event.communityTemplateSnapshot || null,
    // Vacío = "sin override manual", usa el acento propio de la plantilla.
    accentColor: event.accentColor || '',
    secondaryFontFamily: event.themeOverrides?.secondaryFontFamily || '',
    buttonVariant: event.themeOverrides?.buttonVariant || 'solid',
    welcomeMessage: event.welcomeMessage || '',
    mapsUrl: event.mapsUrl || '',
    departureReminderBufferMinutes: event.departureReminderBufferMinutes != null ? String(event.departureReminderBufferMinutes) : '',
    capacity: event.capacity ? String(event.capacity) : '',
    attendeeLimitEnabled: event.attendeeLimitEnabled || false,
    // resolveMaxCompanions y no event.maxCompanions ?? 0: en un evento anterior
    // al campo, el valor EFECTIVO es el default legacy (9) — mostrar 0 acá haría
    // que guardar sin tocar este campo se lo quite en silencio.
    maxCompanions: String(resolveMaxCompanions(event)),
    customFields: event.customFields || [],
    requiresPayment: event.requiresPayment || false,
    paymentMethods: event.paymentMethods?.length ? event.paymentMethods : ['transfer'],
    ticketPrice: event.ticketPrice ? String(event.ticketPrice) : '',
    currency: event.currency || '$',
    paymentInstructions: event.paymentInstructions || '',
    organizerContactPhone: event.organizerContactPhone || '',
    organizerContactPhoneCountry: event.organizerContactPhoneCountry || DEFAULT_PHONE_COUNTRY,
    timeline: event.timeline || [],
    faq: event.faq || [],
    transport: event.transport || {},
    rsvpDeadline: event.rsvpDeadline || '',
    remindersEnabled: event.remindersEnabled || false,
    reminderRules: event.reminderRules || [],
    guestTags: event.guestTags || [],
    vipTagId: event.vipTagId ?? null,
    sections: event.sections || [],
    sectionVisibility: event.sectionVisibility || undefined,
    menu: event.menu || undefined,
    gifts: event.gifts || undefined,
  })

  function updateField<K extends keyof FormFields>(field: K, value: FormFields[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // No es editable: cambiar el modo de ingreso después de compartir invitaciones
  // o links de autoregistro rompería esos links (ver firestore.rules y EventJoin).
  const entryMode = event.entryMode || 'list'
  const [saving, setSaving] = useState(false)
  const [networkRetry, setNetworkRetry] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const [capacityError, setCapacityError] = useState('')
  const [maxCompanionsError, setMaxCompanionsError] = useState('')
  const [errorAttempt, setErrorAttempt] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  useFocusFirstInvalidField(formRef, errorAttempt)

  // "Modo anti-tontos": antes de guardar de verdad, se muestra un resumen de
  // qué va a cambiar y hay que confirmarlo explícitamente. `null` = sin
  // diálogo abierto. Evita guardar un cambio accidental (un campo tocado sin
  // querer, un checkbox desmarcado sin darse cuenta) con un solo tap.
  const [pendingChanges, setPendingChanges] = useState<ChangeEntry[] | null>(null)

  const draftKey = `eventDraft_${event.ownerId}_${event.id}`
  const { pendingDraft, saveDraft, clearDraft, dismissPrompt } = useFormDraft<EventEditDraftFields>(draftKey, event.updatedAt)

  function applyDraft(fields: EventEditDraftFields) {
    const { coverImage: draftCoverImage, ...rest } = fields
    // Fallbacks para campos que un borrador guardado por una versión más
    // vieja de la app puede no tener en localStorage (ver mismos fallbacks
    // en el useState inicial, arriba).
    setForm({
      ...rest,
      dressCode: rest.dressCode || '',
      attendeeLimitEnabled: rest.attendeeLimitEnabled ?? (event.attendeeLimitEnabled || false),
      maxCompanions: rest.maxCompanions ?? String(resolveMaxCompanions(event)),
      communityTemplateSnapshot: rest.communityTemplateSnapshot ?? null,
      departureReminderBufferMinutes: rest.departureReminderBufferMinutes ?? (event.departureReminderBufferMinutes != null ? String(event.departureReminderBufferMinutes) : ''),
      paymentMethods: rest.paymentMethods?.length ? rest.paymentMethods : ['transfer'],
      organizerContactPhone: rest.organizerContactPhone || '',
      organizerContactPhoneCountry: rest.organizerContactPhoneCountry || DEFAULT_PHONE_COUNTRY,
      timeline: rest.timeline || [],
      faq: rest.faq || [],
      transport: rest.transport || {},
      rsvpDeadline: rest.rsvpDeadline || '',
      remindersEnabled: rest.remindersEnabled || false,
      reminderRules: rest.reminderRules || [],
    })
    if (draftCoverImage) setCoverImage(draftCoverImage)
  }

  function togglePaymentMethod(method: PaymentMethod) {
    setForm((prev) => ({
      ...prev,
      paymentMethods: prev.paymentMethods.includes(method)
        ? prev.paymentMethods.filter((m) => m !== method)
        : [...prev.paymentMethods, method],
    }))
  }

  // Autoguardado del borrador c/5s mientras haya cambios sin guardar — protege
  // ediciones largas de un cierre accidental de pestaña o un fallo de red.
  //
  // draftFieldsRef (useLiveRef) en vez de listar los campos como dependencias
  // del efecto: con todos en el array, cada tecla en CUALQUIER campo
  // destruía y volvía a crear el setInterval — si el usuario tipeaba sin
  // pausas de 5s, el intervalo nunca llegaba a dispararse (se comportaba
  // como un debounce-tras-inactividad, no como "cada 5s" real). El intervalo
  // ahora se crea UNA sola vez (mientras no haya un borrador pendiente) y en
  // cada tick lee los valores más recientes a través del ref — mismo patrón
  // que ya usa Scanner.tsx para que el callback de cámara no se resuscriba
  // en cada cambio de estado.
  const draftFields: EventEditDraftFields = { ...form, coverImage }
  const draftFieldsRef = useLiveRef(draftFields)
  const saveDraftRef = useLiveRef(saveDraft)

  useEffect(() => {
    if (pendingDraft) return
    const id = setInterval(() => {
      saveDraftRef.current(draftFieldsRef.current)
    }, DRAFT_SAVE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [pendingDraft, draftFieldsRef, saveDraftRef])

  // Compara el estado actual del formulario contra el evento original —
  // texto corto muestra antes/después, texto largo o listas solo dicen
  // "Actualizado/a" (mostrar un párrafo entero en el diálogo sería más
  // ruido que ayuda). Nada se guarda todavía acá, solo se describe.
  function computeChanges(parsedCapacity: number, parsedMaxCompanions: number): ChangeEntry[] {
    const changes: ChangeEntry[] = []
    const trimmedName = form.name.trim()
    const trimmedLocation = form.location.trim()
    const trimmedDescription = form.description.trim()
    const trimmedDressCode = form.dressCode.trim()
    const trimmedMapsUrl = form.mapsUrl.trim()
    const trimmedWelcome = form.welcomeMessage.trim()

    if (event.name !== trimmedName) changes.push({ label: 'Nombre', detail: `"${event.name}" → "${trimmedName}"` })
    if (event.date !== form.date) changes.push({ label: 'Fecha', detail: `${event.date} → ${form.date}` })
    if ((event.startTime || '') !== form.startTime) {
      changes.push({ label: 'Hora de inicio', detail: `${event.startTime || 'sin definir'} → ${form.startTime || 'sin definir'}` })
    }
    if ((event.endTime || '') !== form.endTime) {
      changes.push({ label: 'Hora de fin', detail: `${event.endTime || 'sin definir'} → ${form.endTime || 'sin definir'}` })
    }
    if (event.location !== trimmedLocation) changes.push({ label: 'Lugar', detail: `"${event.location}" → "${trimmedLocation}"` })
    if ((event.description || '') !== trimmedDescription) changes.push({ label: 'Descripción', detail: 'Actualizada' })
    if ((event.dressCode || '') !== trimmedDressCode) {
      changes.push({ label: 'Vestimenta', detail: trimmedDressCode ? `"${trimmedDressCode}"` : 'Quitada' })
    }
    if ((event.mapsUrl || '') !== trimmedMapsUrl) {
      changes.push({ label: 'Link de Google Maps', detail: trimmedMapsUrl ? 'Actualizado' : 'Quitado' })
    }
    if ((event.templateId || 'default') !== form.templateId) {
      changes.push({ label: 'Plantilla del pase', detail: `${getTemplate(event.templateId).label} → ${getTemplate(form.templateId).label}` })
    }
    if ((event.accentColor || '') !== form.accentColor) {
      changes.push({ label: 'Color de acento', detail: form.accentColor ? 'Color personalizado' : 'Vuelve al color de la plantilla' })
    }
    if ((event.themeOverrides?.secondaryFontFamily || '') !== form.secondaryFontFamily
      || (event.themeOverrides?.buttonVariant || 'solid') !== form.buttonVariant) {
      changes.push({ label: 'Personalización del tema', detail: 'Actualizada' })
    }
    if ((event.welcomeMessage || '') !== trimmedWelcome) changes.push({ label: 'Mensaje de bienvenida', detail: 'Actualizado' })
    if ((event.coverImage || '') !== coverImage) {
      changes.push({ label: 'Imagen de portada', detail: coverImage ? 'Actualizada' : 'Quitada' })
    }
    if ((event.capacity || 0) !== parsedCapacity) {
      changes.push({ label: 'Límite de invitados', detail: `${event.capacity || 0} → ${parsedCapacity}` })
    }
    if ((event.attendeeLimitEnabled || false) !== form.attendeeLimitEnabled) {
      changes.push({ label: 'Limitar número de asistentes', detail: form.attendeeLimitEnabled ? 'Activado' : 'Desactivado' })
    }
    if (resolveMaxCompanions(event) !== parsedMaxCompanions) {
      changes.push({ label: 'Acompañantes por invitado', detail: `${resolveMaxCompanions(event)} → ${parsedMaxCompanions}` })
    }
    if (JSON.stringify(event.customFields || []) !== JSON.stringify(form.customFields)) {
      changes.push({ label: 'Campos de registro', detail: `${(event.customFields || []).length} → ${form.customFields.length} campo(s)` })
    }
    if (JSON.stringify(event.timeline || []) !== JSON.stringify(form.timeline)) {
      changes.push({ label: 'Programa del evento', detail: `${(event.timeline || []).length} → ${form.timeline.length} actividad(es)` })
    }
    if (JSON.stringify(event.faq || []) !== JSON.stringify(form.faq)) {
      changes.push({ label: 'Preguntas frecuentes', detail: `${(event.faq || []).length} → ${form.faq.length} pregunta(s)` })
    }
    if (JSON.stringify(event.transport || {}) !== JSON.stringify(form.transport)) {
      changes.push({ label: 'Transporte y estacionamiento', detail: 'Actualizado' })
    }
    if (JSON.stringify(event.guestTags || []) !== JSON.stringify(form.guestTags)) {
      changes.push({ label: 'Segmentos de invitado', detail: `${(event.guestTags || []).length} → ${form.guestTags.length} segmento(s)` })
    }
    if (JSON.stringify(event.sections || []) !== JSON.stringify(form.sections)
      || JSON.stringify(event.sectionVisibility || {}) !== JSON.stringify(form.sectionVisibility || {})) {
      changes.push({ label: 'Secciones y visibilidad', detail: 'Actualizadas' })
    }
    if (JSON.stringify(event.menu || {}) !== JSON.stringify(form.menu || {})) {
      changes.push({ label: 'Menú y restricciones alimenticias', detail: 'Actualizado' })
    }
    if (JSON.stringify(event.gifts || {}) !== JSON.stringify(form.gifts || {})) {
      changes.push({ label: 'Regalos', detail: 'Actualizado' })
    }
    if (
      (event.remindersEnabled || false) !== form.remindersEnabled
      || (event.rsvpDeadline || '') !== form.rsvpDeadline
      || JSON.stringify(event.reminderRules || []) !== JSON.stringify(form.reminderRules)
    ) {
      changes.push({ label: 'Recordatorios automáticos', detail: form.remindersEnabled ? 'Activados' : 'Desactivados' })
    }
    if ((event.requiresPayment || false) !== form.requiresPayment) {
      changes.push({ label: 'Cobro de entrada', detail: form.requiresPayment ? 'Activado' : 'Desactivado' })
    }
    if (form.requiresPayment) {
      const parsedPrice = parseFloat(form.ticketPrice) || 0
      const trimmedCurrency = form.currency.trim()
      const trimmedInstructions = form.paymentInstructions.trim()
      const trimmedContact = form.organizerContactPhone.trim()
      if (JSON.stringify(event.paymentMethods || []) !== JSON.stringify(form.paymentMethods)) {
        changes.push({ label: 'Métodos de cobro', detail: form.paymentMethods.map((m) => PAYMENT_METHOD_LABELS[m]).join(' + ') || 'Ninguno' })
      }
      if ((event.ticketPrice || 0) !== parsedPrice) {
        changes.push({ label: 'Precio por persona', detail: `${event.currency}${event.ticketPrice || 0} → ${trimmedCurrency}${parsedPrice}` })
      }
      if ((event.currency || '') !== trimmedCurrency) changes.push({ label: 'Moneda', detail: `${event.currency || '—'} → ${trimmedCurrency}` })
      if ((event.paymentInstructions || '') !== trimmedInstructions) changes.push({ label: 'Instrucciones de pago', detail: 'Actualizadas' })
      if ((event.organizerContactPhone || '') !== trimmedContact) changes.push({ label: 'WhatsApp de contacto', detail: trimmedContact ? 'Actualizado' : 'Quitado' })
    }
    return changes
  }

  async function submitEvent() {
    if (!form.name.trim() || !form.date || !form.location.trim()) return
    const { value: parsedCapacity, error: capacityValidationError } = parseCapacity(form.capacity)
    if (capacityValidationError) {
      setCapacityError(capacityValidationError)
      return
    }
    const { value: parsedMaxCompanions, error: maxCompanionsValidationError } = parseMaxCompanions(form.maxCompanions)
    if (maxCompanionsValidationError) {
      setMaxCompanionsError(maxCompanionsValidationError)
      return
    }
    setCapacityError('')
    setMaxCompanionsError('')
    setSubmitError('')
    setNetworkRetry(false)
    setSaving(true)
    try {
      await updateEventDetails(event.id, {
        name: form.name.trim(),
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        location: form.location.trim(),
        description: form.description.trim(),
        dressCode: form.dressCode.trim() || undefined,
        coverImage,
        accentColor: form.accentColor,
        templateId: form.templateId,
        communityTemplateSnapshot: form.communityTemplateSnapshot,
        themeOverrides: (form.secondaryFontFamily || form.buttonVariant !== 'solid')
          ? {
            ...(form.secondaryFontFamily ? { secondaryFontFamily: form.secondaryFontFamily } : {}),
            ...(form.buttonVariant !== 'solid' ? { buttonVariant: form.buttonVariant } : {}),
          }
          : undefined,
        welcomeMessage: form.welcomeMessage.trim(),
        mapsUrl: form.mapsUrl.trim() || undefined,
        departureReminderBufferMinutes: form.departureReminderBufferMinutes.trim()
          ? Math.max(0, Math.min(120, Number(form.departureReminderBufferMinutes) || 15))
          : undefined,
        entryMode,
        capacity: parsedCapacity,
        attendeeLimitEnabled: form.attendeeLimitEnabled,
        maxCompanions: parsedMaxCompanions,
        customFields: form.customFields,
        requiresPayment: form.requiresPayment,
        paymentMethods: form.requiresPayment ? form.paymentMethods : [],
        ticketPrice: form.requiresPayment ? parseFloat(form.ticketPrice) || 0 : 0,
        currency: form.requiresPayment ? form.currency.trim() : '',
        paymentInstructions: form.requiresPayment ? form.paymentInstructions.trim() : '',
        organizerContactPhone: form.requiresPayment ? form.organizerContactPhone.trim() : '',
        organizerContactPhoneCountry: form.requiresPayment ? form.organizerContactPhoneCountry : '',
        timeline: form.timeline,
        faq: form.faq,
        transport: form.transport,
        rsvpDeadline: form.rsvpDeadline || undefined,
        remindersEnabled: form.remindersEnabled,
        reminderRules: form.reminderRules,
        guestTags: form.guestTags,
        vipTagId: form.vipTagId,
        sections: form.sections,
        sectionVisibility: form.sectionVisibility,
        menu: form.menu,
        gifts: form.gifts,
      })
      clearDraft()
      onDone()
    } catch (err) {
      if (isNetworkError(err)) {
        setSubmitError('Guardado localmente. Reintentando…')
        setNetworkRetry(true)
      } else {
        setSubmitError('No pudimos guardar los cambios. Intenta de nuevo.')
      }
      setErrorAttempt((n) => n + 1)
    } finally {
      setSaving(false)
    }
  }

  // El submit del form ya no guarda directo: valida, arma el resumen de
  // cambios y lo muestra para confirmar. Si no hay nada distinto, no tiene
  // sentido interrumpir con un diálogo vacío — cierra el editor directo.
  function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.date || !form.location.trim()) return
    if (form.requiresPayment && form.paymentMethods.length === 0) {
      setSubmitError('Elige al menos un método de cobro.')
      setErrorAttempt((n) => n + 1)
      return
    }
    if (form.requiresPayment && !(parseFloat(form.ticketPrice) > 0)) {
      setSubmitError('Ingresa un precio mayor a 0 para el boleto.')
      setErrorAttempt((n) => n + 1)
      return
    }
    const { value: parsedCapacity, error: capacityValidationError } = parseCapacity(form.capacity)
    if (capacityValidationError) {
      setCapacityError(capacityValidationError)
      setErrorAttempt((n) => n + 1)
      return
    }
    const { value: parsedMaxCompanions, error: maxCompanionsValidationError } = parseMaxCompanions(form.maxCompanions)
    if (maxCompanionsValidationError) {
      setMaxCompanionsError(maxCompanionsValidationError)
      setErrorAttempt((n) => n + 1)
      return
    }
    setCapacityError('')
    setMaxCompanionsError('')
    const changes = computeChanges(parsedCapacity, parsedMaxCompanions)
    if (changes.length === 0) {
      onDone()
      return
    }
    setPendingChanges(changes)
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
    {coverRawImage && (
      <ImageCropModal
        imageSrc={coverRawImage}
        aspect={16 / 9}
        onCrop={onCoverCropConfirmed}
        onCancel={onCoverCropCancelled}
      />
    )}
    <ConfirmDialog
      open={!!pendingChanges}
      title="Confirmar cambios"
      message={
        <>
          <p className="mb-2">Vas a guardar estos cambios en el evento:</p>
          <ul className="space-y-1.5 max-h-56 overflow-y-auto">
            {(pendingChanges || []).map((c) => (
              <li key={c.label} className="text-gray-700 dark:text-gray-300">
                <span className="font-semibold">{c.label}:</span> <span className="text-gray-500 dark:text-gray-400">{c.detail}</span>
              </li>
            ))}
          </ul>
        </>
      }
      confirmLabel={saving ? 'Guardando…' : 'Sí, guardar cambios'}
      cancelLabel="Seguir editando"
      onConfirm={() => { setPendingChanges(null); void submitEvent() }}
      onCancel={() => setPendingChanges(null)}
    />
    <form ref={formRef} onSubmit={handleReviewSubmit} className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4 space-y-3 animate-fade-in-up">
      <h2 className="font-medium text-gray-900 dark:text-white">Editar evento</h2>

      <EditSection title="Lo esencial" defaultOpen>
        <AccessibleField label="Nombre del evento" id="edit-event-name" required>
          {(fieldProps) => (
            <input
              {...fieldProps}
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              maxLength={EVENT_NAME_MAX}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}
        </AccessibleField>

        <AccessibleField label="Lugar" id="edit-event-location" required>
          {(fieldProps) => (
            <input
              {...fieldProps}
              type="text"
              value={form.location}
              onChange={(e) => updateField('location', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}
        </AccessibleField>

        <div>
          <p className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha y hora</p>
          <EventScheduleField
            dateId="edit-event-date"
            startTimeId="edit-event-start-time"
            endTimeId="edit-event-end-time"
            date={form.date}
            onDateChange={(v) => updateField('date', v)}
            startTime={form.startTime}
            onStartTimeChange={(v) => updateField('startTime', v)}
            endTime={form.endTime}
            onEndTimeChange={(v) => updateField('endTime', v)}
          />
        </div>
      </EditSection>

      <EditSection title="Detalles" subtitle="Descripción, vestimenta y ubicación en el mapa">
        <AccessibleField label="Descripción (opcional)" id="edit-event-description">
          {(fieldProps) => (
            <textarea
              {...fieldProps}
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}
        </AccessibleField>
        <AccessibleField
          label={<>Vestimenta <span className="text-gray-400 font-normal">(opcional)</span></>}
          id="edit-event-dress-code"
        >
          {(fieldProps) => (
            <input
              {...fieldProps}
              type="text"
              value={form.dressCode}
              onChange={(e) => updateField('dressCode', e.target.value)}
              maxLength={100}
              placeholder="Ej: Formal, Casual, Todo de blanco…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}
        </AccessibleField>
        <AccessibleField
          label={<>Link de Google Maps <span className="text-gray-400 font-normal">(opcional)</span></>}
          id="edit-event-maps-url"
          helperText={'Si no pegas un link, el pase no mostrará el botón "Cómo llegar" — así evitamos llevar a tus invitados a un lugar incorrecto. Para ver el mapa integrado y el pronóstico del clima, pega el link completo de Google Maps (desde el navegador, no el link corto).'}
        >
          {(fieldProps) => (
            <input
              {...fieldProps}
              type="url"
              value={form.mapsUrl}
              onChange={(e) => updateField('mapsUrl', e.target.value)}
              placeholder="https://maps.google.com/maps?q=..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}
        </AccessibleField>
        {form.mapsUrl.trim() && (
          <AccessibleField
            label="Margen para la hora de salida recomendada (minutos)"
            id="edit-event-departure-buffer"
            helperText='Con el link de Google Maps arriba, el pase le muestra a cada invitado (bajo pedido, con su ubicación) a qué hora conviene salir. Este margen es cuánto antes del evento quiere llegar por defecto — cada invitado puede ajustarlo desde su pase.'
          >
            {(fieldProps) => (
              <input
                {...fieldProps}
                type="number"
                min={0}
                max={120}
                value={form.departureReminderBufferMinutes}
                onChange={(e) => updateField('departureReminderBufferMinutes', e.target.value)}
                placeholder="15"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            )}
          </AccessibleField>
        )}
      </EditSection>

      <EditSection title="Plantilla y estilo del pase" subtitle="Tema visual, portada, color de acento y mensaje de bienvenida">
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Plantilla del pase</p>
          <TemplatePicker
            selected={form.templateId}
            onSelect={(v) => updateField('templateId', v)}
            communityTemplates={approvedCommunityTemplates}
            selectedCommunityTemplate={form.communityTemplateSnapshot}
            onSelectCommunity={(snapshot) => updateField('communityTemplateSnapshot', snapshot)}
            previewData={{
              eventName: form.name,
              date: form.date,
              location: form.location,
              mapsUrl: form.mapsUrl,
              coverImage,
              accentColor: form.accentColor,
              themeOverrides: {
                ...(form.secondaryFontFamily ? { secondaryFontFamily: form.secondaryFontFamily } : {}),
                ...(form.buttonVariant !== 'solid' ? { buttonVariant: form.buttonVariant } : {}),
              },
              welcomeMessage: form.welcomeMessage,
            }}
          />
        </div>

        <div className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-3">
          <CoverImagePicker
            id="edit-event-cover-image"
            fileInputRef={coverFileInputRef}
            coverImage={coverImage}
            coverUploading={coverUploading}
            coverError={coverError}
            openCoverPicker={openCoverPicker}
            onCoverFileSelected={onCoverFileSelected}
            clearCover={clearCover}
            compact
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AccessibleField label="Color de acento" id="edit-event-accent-color">
              {(fieldProps) => (
                <div className="flex items-center gap-2">
                  <input
                    {...fieldProps}
                    type="color"
                    value={form.accentColor || getTemplate(form.templateId).vars.accent}
                    onChange={(e) => updateField('accentColor', e.target.value)}
                    className="h-9 w-12 border border-gray-300 rounded-lg cursor-pointer"
                  />
                  <span className="text-sm text-gray-500">{form.accentColor || `${getTemplate(form.templateId).vars.accent} (de la plantilla)`}</span>
                </div>
              )}
            </AccessibleField>
            <AccessibleField label="Mensaje de bienvenida" id="edit-event-welcome-message">
              {(fieldProps) => (
                <input
                  {...fieldProps}
                  type="text"
                  value={form.welcomeMessage}
                  onChange={(e) => updateField('welcomeMessage', e.target.value)}
                  placeholder="¡Te esperamos!"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              )}
            </AccessibleField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AccessibleField label="Tipografía secundaria" id="edit-event-secondary-font">
              {(fieldProps) => (
                <select
                  {...fieldProps}
                  value={form.secondaryFontFamily}
                  onChange={(e) => updateField('secondaryFontFamily', e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {SECONDARY_FONT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
            </AccessibleField>
            <div>
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Estilo del botón principal</span>
              <div className="flex gap-2">
                {(['solid', 'outline'] as const).map((variant) => (
                  <button
                    key={variant}
                    type="button"
                    onClick={() => updateField('buttonVariant', variant)}
                    aria-pressed={form.buttonVariant === variant}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      form.buttonVariant === variant
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {variant === 'solid' ? 'Relleno' : 'Contorno'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </EditSection>

      <EditSection title="Campos de registro" subtitle="Qué datos pides además de nombre y teléfono">
        <p className="text-xs text-gray-400 -mt-1">Nombre y teléfono siempre se piden. Agrega campos extra opcionales.</p>
        <CustomFieldsBuilder fields={form.customFields} onChange={(v) => updateField('customFields', v)} />
      </EditSection>

      <EditSection title="Programa del evento" subtitle="Orden del día visible en el pase del invitado">
        <p className="text-xs text-gray-400 -mt-1">Ej: 19:00 Recepción, 21:00 Cena…</p>
        <TimelineEditor entries={form.timeline} onChange={(v) => updateField('timeline', v)} />
      </EditSection>

      <EditSection title="Preguntas frecuentes" subtitle="Dudas comunes que ven los invitados en su pase">
        <FaqEditor entries={form.faq} onChange={(v) => updateField('faq', v)} />
      </EditSection>

      <EditSection title="Transporte y estacionamiento" subtitle="Cómo llegar, dónde estacionar e indicaciones especiales">
        <TransportEditor transport={form.transport} onChange={(v) => updateField('transport', v)} />
      </EditSection>

      <EditSection title="Regalos" subtitle="Mesa de regalos, mensaje o datos para regalo en efectivo">
        <GiftEditor gifts={form.gifts} onChange={(v) => updateField('gifts', v)} />
      </EditSection>

      <EditSection title="Segmentos de invitado" subtitle="Grupos para mostrar contenido exclusivo (ej. VIP, Familia)">
        <GuestTagsEditor
          tags={form.guestTags}
          onChange={(v) => updateField('guestTags', v)}
          vipTagId={form.vipTagId}
          onVipTagIdChange={(v) => updateField('vipTagId', v)}
        />
      </EditSection>

      <EditSection title="Menú y restricciones alimenticias" subtitle="El invitado elige su platillo al confirmar asistencia">
        <MenuEditor menu={form.menu} onChange={(v) => updateField('menu', v)} />
      </EditSection>

      <EditSection title="Secciones y visibilidad" subtitle="Contenido exclusivo por segmento (After Party, Cena VIP, Hospedaje...)">
        <SectionsEditor
          guestTags={form.guestTags}
          sections={form.sections}
          onChangeSections={(v) => updateField('sections', v)}
          sectionVisibility={form.sectionVisibility}
          onChangeSectionVisibility={(v) => updateField('sectionVisibility', v)}
        />
      </EditSection>

      <EditSection title="Recordatorios automáticos" subtitle="Email a quien no haya confirmado, cerca del cierre de RSVP">
        <ReminderRulesEditor
          enabled={form.remindersEnabled}
          deadline={form.rsvpDeadline}
          rules={form.reminderRules}
          onChangeEnabled={(v) => updateField('remindersEnabled', v)}
          onChangeDeadline={(v) => updateField('rsvpDeadline', v)}
          onChangeRules={(v) => updateField('reminderRules', v)}
        />
      </EditSection>

      <EditSection title="Modo de ingreso y cupo" subtitle={`Cupo actual: ${form.capacity || '0'} personas`}>
        <p className="text-xs text-gray-400">
          El modo de ingreso no se puede cambiar después de crear el evento, para no romper invitaciones o links de
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
        <AccessibleField
          label="Límite de invitados"
          id="edit-event-capacity"
          required
          error={capacityError || null}
          helperText={form.attendeeLimitEnabled
            ? 'Total de personas (invitados + acompañantes) — al llegar a este número, el autorregistro y las altas manuales se cierran automáticamente.'
            : 'Total de personas recomendado (invitados + acompañantes) — informativo, no bloquea nuevos registros si se supera.'}
        >
          {(fieldProps) => (
            <input
              {...fieldProps}
              type="number"
              min="1"
              value={form.capacity}
              onChange={(e) => updateField('capacity', e.target.value)}
              placeholder="Ej: 200"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}
        </AccessibleField>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <Checkbox checked={form.attendeeLimitEnabled} onChange={(e) => updateField('attendeeLimitEnabled', e.target.checked)} />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Limitar número de asistentes</span>
        </label>
        {/* No bloqueamos guardar un límite ya superado por los asistentes actuales
            (ej. bajarlo de 250 a 180 con 220 ya registrados) — el organizador puede
            necesitar frenar el registro YA. Nadie se elimina automáticamente: el
            autorregistro y las altas manuales quedan cerrados hasta que baje del
            límite por bajas/cancelaciones. Ver CAPACITY_LIMIT_ARCHITECTURE.md §3. */}
        {form.attendeeLimitEnabled && event.peopleCount > (parseInt(form.capacity) || 0) && (
          <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
            Ya hay {event.peopleCount} asistentes, por encima de este límite. No se elimina a nadie automáticamente —
            el autorregistro y las altas manuales quedan cerrados hasta que baje de {form.capacity} por cancelaciones
            o bajas que hagas tú mismo.
          </p>
        )}
        <AccessibleField
          label="Acompañantes por invitado"
          id="edit-event-max-companions"
          error={maxCompanionsError || null}
          helperText='Cuántos acompañantes puede sumar cada invitado (autoregistro o alta manual). 0 = no se permiten acompañantes. No aplica a "Familia o grupo", que tiene su propio límite de integrantes.'
        >
          {(fieldProps) => (
            <input
              {...fieldProps}
              type="number"
              min="0"
              max={GUEST_MAX_COMPANIONS}
              value={form.maxCompanions}
              onChange={(e) => updateField('maxCompanions', e.target.value)}
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}
        </AccessibleField>
      </EditSection>

      <EditSection
        title="Cobro de entrada"
        subtitle={form.requiresPayment ? `Activo — ${form.currency}${form.ticketPrice || 0} por persona` : 'Desactivado'}
        defaultOpen={event.requiresPayment}
      >
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={form.requiresPayment} onChange={(e) => updateField('requiresPayment', e.target.checked)} />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Cobrar entrada a los invitados
          </span>
        </label>
        {form.requiresPayment && (
          <>
            <fieldset className="border-0 p-0 m-0">
              <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Métodos de cobro</legend>
              <div className="flex gap-2">
                {(['transfer', 'cash'] as PaymentMethod[]).map((m) => (
                  <label
                    key={m}
                    className={`flex-1 flex items-center justify-center gap-2 border rounded-lg px-3 py-2.5 text-sm font-medium cursor-pointer transition-colors ${
                      form.paymentMethods.includes(m)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    <input type="checkbox" checked={form.paymentMethods.includes(m)} onChange={() => togglePaymentMethod(m)} className="sr-only" />
                    {PAYMENT_METHOD_LABELS[m]}
                  </label>
                ))}
              </div>
              {form.paymentMethods.length === 0 && <FieldError message="Elige al menos un método." />}
            </fieldset>
            <div className="grid grid-cols-3 gap-3">
              <AccessibleField label="Precio por persona" id="edit-event-ticket-price" className="col-span-2">
                {(fieldProps) => (
                  <input
                    {...fieldProps}
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.ticketPrice}
                    onChange={(e) => updateField('ticketPrice', sanitizeDecimalInput(e.target.value))}
                    placeholder="Ej: 5000"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                )}
              </AccessibleField>
              <AccessibleField label="Moneda" id="edit-event-currency">
                {(fieldProps) => (
                  <input
                    {...fieldProps}
                    type="text"
                    value={form.currency}
                    onChange={(e) => updateField('currency', e.target.value)}
                    placeholder="$"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                )}
              </AccessibleField>
            </div>
            {form.paymentMethods.includes('transfer') && (
              <AccessibleField label="Datos para transferencia" id="edit-event-payment-instructions">
                {(fieldProps) => (
                  <textarea
                    {...fieldProps}
                    value={form.paymentInstructions}
                    onChange={(e) => updateField('paymentInstructions', e.target.value)}
                    rows={3}
                    placeholder="Ej: Transfiere a alias fiesta.maria.mp, o por Mercado Pago: https://link.mercadopago..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                )}
              </AccessibleField>
            )}
            <AccessibleField
              label="Tu WhatsApp para pagos"
              id="edit-event-organizer-contact"
              helperText="Los invitados verán un botón para escribirte por acá: enviar comprobante, resolver dudas o pedir una devolución."
            >
              {(fieldProps) => (
                <div className="flex items-center gap-1.5">
                  <CountryCodeSelect
                    value={form.organizerContactPhoneCountry as CountryCode}
                    onChange={(v) => updateField('organizerContactPhoneCountry', v)}
                    aria-label="País del WhatsApp de contacto"
                    className="border border-gray-300 rounded-lg px-1.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <input
                    {...fieldProps}
                    type="tel"
                    value={form.organizerContactPhone}
                    onChange={(e) => updateField('organizerContactPhone', e.target.value)}
                    placeholder="Ej: 55 1234 5678"
                    className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              )}
            </AccessibleField>
          </>
        )}
      </EditSection>

      {submitError && (
        <div>
          <FieldError message={submitError} />
          {networkRetry && (
            <button type="button" onClick={() => void submitEvent()} className="mt-1 text-sm font-medium underline text-error">
              Reintentar ahora
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <AccessibleButton type="submit" size="sm" disabled={saving || coverUploading}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </AccessibleButton>
        <AccessibleButton type="button" variant="secondary" size="sm" onClick={onDone}>
          Cancelar
        </AccessibleButton>
      </div>
    </form>
    </>
  )
}
