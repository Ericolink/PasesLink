import { useEffect, useState } from 'react'
import { updateEventDetails } from '../firebase/events'
import { resolveMaxCompanions } from '../firebase/guests'
import { useCoverPhoto } from '../hooks/useCoverPhoto'
import { useFormDraft } from '../hooks/useFormDraft'
import { useLiveRef } from '../hooks/useLiveRef'
import { isNetworkError } from '../utils/network'
import { EVENT_NAME_MAX, parseCapacity, parseMaxCompanions, sanitizeDecimalInput } from '../utils/validationRules'
import { GUEST_MAX_COMPANIONS } from '../utils/validation'
import { ImageCropModal } from './ImageCropModal'
import { CustomFieldsBuilder } from './CustomFieldsBuilder'
import { TimelineEditor } from './TimelineEditor'
import { TemplatePicker } from './TemplatePicker'
import { CoverImagePicker } from './CoverImagePicker'
import { DraftRecoveryModal } from './DraftRecoveryModal'
import { ConfirmDialog } from './ConfirmDialog'
import { Button } from './Button'
import { Checkbox } from './Checkbox'
import { FieldError } from './FieldError'
import { EventScheduleField } from './EventScheduleField'
import { getTemplate } from '../templates/registry'
import { PAYMENT_METHOD_LABELS } from '../utils/paymentMethods'
import type { CustomField, EntryMode, EventData, PaymentMethod, TemplateId, TimelineEntry } from '../types'

interface EventEditDraftFields {
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
    // Vacío = "sin override manual", usa el acento propio de la plantilla.
    accentColor: event.accentColor || '',
    welcomeMessage: event.welcomeMessage || '',
    mapsUrl: event.mapsUrl || '',
    capacity: event.capacity ? String(event.capacity) : '',
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
    timeline: event.timeline || [],
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
      maxCompanions: rest.maxCompanions ?? String(resolveMaxCompanions(event)),
      paymentMethods: rest.paymentMethods?.length ? rest.paymentMethods : ['transfer'],
      organizerContactPhone: rest.organizerContactPhone || '',
      timeline: rest.timeline || [],
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
    if ((event.welcomeMessage || '') !== trimmedWelcome) changes.push({ label: 'Mensaje de bienvenida', detail: 'Actualizado' })
    if ((event.coverImage || '') !== coverImage) {
      changes.push({ label: 'Imagen de portada', detail: coverImage ? 'Actualizada' : 'Quitada' })
    }
    if ((event.capacity || 0) !== parsedCapacity) {
      changes.push({ label: 'Límite de invitados', detail: `${event.capacity || 0} → ${parsedCapacity}` })
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
        welcomeMessage: form.welcomeMessage.trim(),
        mapsUrl: form.mapsUrl.trim() || undefined,
        entryMode,
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
      onDone()
    } catch (err) {
      if (isNetworkError(err)) {
        setSubmitError('Guardado localmente. Reintentando…')
        setNetworkRetry(true)
      } else {
        setSubmitError('No pudimos guardar los cambios. Intenta de nuevo.')
      }
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
      setSubmitError('Elegí al menos un método de cobro.')
      return
    }
    if (form.requiresPayment && !(parseFloat(form.ticketPrice) > 0)) {
      setSubmitError('Ingresá un precio mayor a 0 para el boleto.')
      return
    }
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
    <form onSubmit={handleReviewSubmit} className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4 space-y-3 animate-fade-in-up">
      <h2 className="font-medium text-gray-900 dark:text-white">Editar evento</h2>

      <EditSection title="Lo esencial" defaultOpen>
        <div>
          <label htmlFor="edit-event-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del evento</label>
          <input
            id="edit-event-name"
            type="text"
            required
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            maxLength={EVENT_NAME_MAX}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor="edit-event-location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lugar</label>
          <input id="edit-event-location" type="text" required value={form.location} onChange={(e) => updateField('location', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

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
        <div>
          <label htmlFor="edit-event-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción (opcional)</label>
          <textarea id="edit-event-description" value={form.description} onChange={(e) => updateField('description', e.target.value)} rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div>
          <label htmlFor="edit-event-dress-code" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Vestimenta <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input id="edit-event-dress-code" type="text" value={form.dressCode} onChange={(e) => updateField('dressCode', e.target.value)}
            maxLength={100} placeholder="Ej: Formal, Casual, Todo de blanco…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div>
          <label htmlFor="edit-event-maps-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Link de Google Maps <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input id="edit-event-maps-url" type="url" value={form.mapsUrl} onChange={(e) => updateField('mapsUrl', e.target.value)}
            placeholder="https://maps.google.com/maps?q=..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          <p className="text-xs text-gray-500 mt-1">
            Si no pegás un link, el pase no mostrará el botón "Cómo llegar" — así evitamos llevar a tus invitados a un lugar incorrecto. Para ver el mapa integrado, pega el link <strong>completo</strong> de Google Maps (desde el navegador, no el link corto).
          </p>
        </div>
      </EditSection>

      <EditSection title="Plantilla y estilo del pase" subtitle="Tema visual, portada, color de acento y mensaje de bienvenida">
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Plantilla del pase</p>
          <TemplatePicker
            selected={form.templateId}
            onSelect={(v) => updateField('templateId', v)}
            previewData={{ eventName: form.name, date: form.date, location: form.location, mapsUrl: form.mapsUrl, coverImage, accentColor: form.accentColor, welcomeMessage: form.welcomeMessage }}
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
            <div>
              <label htmlFor="edit-event-accent-color" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color de acento</label>
              <div className="flex items-center gap-2">
                <input id="edit-event-accent-color" type="color" value={form.accentColor || getTemplate(form.templateId).vars.accent} onChange={(e) => updateField('accentColor', e.target.value)}
                  className="h-9 w-12 border border-gray-300 rounded-lg cursor-pointer" />
                <span className="text-sm text-gray-500">{form.accentColor || `${getTemplate(form.templateId).vars.accent} (de la plantilla)`}</span>
              </div>
            </div>
            <div>
              <label htmlFor="edit-event-welcome-message" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mensaje de bienvenida</label>
              <input id="edit-event-welcome-message" type="text" value={form.welcomeMessage} onChange={(e) => updateField('welcomeMessage', e.target.value)}
                placeholder="¡Te esperamos!" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
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
        <div>
          <label htmlFor="edit-event-capacity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Límite de invitados</label>
          <input id="edit-event-capacity" type="number" required min="1" value={form.capacity} onChange={(e) => updateField('capacity', e.target.value)}
            placeholder="Ej: 200" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          <p className="text-xs text-gray-400 mt-1">
            Total de personas recomendado (invitados + acompañantes) — informativo, no bloquea nuevos registros si
            se supera.
          </p>
          <FieldError message={capacityError} />
        </div>
        <div>
          <label htmlFor="edit-event-max-companions" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Acompañantes por invitado</label>
          <input id="edit-event-max-companions" type="number" min="0" max={GUEST_MAX_COMPANIONS} value={form.maxCompanions} onChange={(e) => updateField('maxCompanions', e.target.value)}
            className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          <p className="text-xs text-gray-400 mt-1">
            Cuántos acompañantes puede sumar cada invitado (autoregistro o alta manual). 0 = no se permiten
            acompañantes. No aplica a "Familia o grupo", que tiene su propio límite de integrantes.
          </p>
          <FieldError message={maxCompanionsError} />
        </div>
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
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Métodos de cobro</label>
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
              {form.paymentMethods.length === 0 && <FieldError message="Elegí al menos un método." />}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label htmlFor="edit-event-ticket-price" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio por persona</label>
                <input
                  id="edit-event-ticket-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.ticketPrice}
                  onChange={(e) => updateField('ticketPrice', sanitizeDecimalInput(e.target.value))}
                  placeholder="Ej: 5000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label htmlFor="edit-event-currency" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Moneda</label>
                <input
                  id="edit-event-currency"
                  type="text"
                  value={form.currency}
                  onChange={(e) => updateField('currency', e.target.value)}
                  placeholder="$"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            {form.paymentMethods.includes('transfer') && (
              <div>
                <label htmlFor="edit-event-payment-instructions" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Datos para transferencia</label>
                <textarea
                  id="edit-event-payment-instructions"
                  value={form.paymentInstructions}
                  onChange={(e) => updateField('paymentInstructions', e.target.value)}
                  rows={3}
                  placeholder="Ej: Transferí a alias fiesta.maria.mp, o por Mercado Pago: https://link.mercadopago..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}
            <div>
              <label htmlFor="edit-event-organizer-contact" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tu WhatsApp para pagos</label>
              <input
                id="edit-event-organizer-contact"
                type="tel"
                value={form.organizerContactPhone}
                onChange={(e) => updateField('organizerContactPhone', e.target.value)}
                placeholder="Ej: +52 55 1234 5678"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-gray-400 mt-1">
                Los invitados verán un botón para escribirte por acá: enviar comprobante, resolver dudas o pedir una devolución.
              </p>
            </div>
          </>
        )}
      </EditSection>

      {submitError && (
        <div className="text-sm text-red-600">
          <p>{submitError}</p>
          {networkRetry && (
            <button type="button" onClick={() => void submitEvent()} className="mt-1 font-medium underline">
              Reintentar ahora
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={saving || coverUploading}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
    </>
  )
}
