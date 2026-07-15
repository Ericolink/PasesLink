import { useEffect, useState } from 'react'
import { updateEventDetails } from '../firebase/events'
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

  const [name, setName] = useState(event.name)
  const [date, setDate] = useState(event.date)
  const [startTime, setStartTime] = useState(event.startTime || '')
  const [endTime, setEndTime] = useState(event.endTime || '')
  const [location, setLocation] = useState(event.location)
  const [description, setDescription] = useState(event.description || '')
  const [dressCode, setDressCode] = useState(event.dressCode || '')
  const [templateId, setTemplateId] = useState<TemplateId>(event.templateId || 'default')
  // Vacío = "sin override manual", usa el acento propio de la plantilla.
  const [accentColor, setAccentColor] = useState(event.accentColor || '')
  const [welcomeMessage, setWelcomeMessage] = useState(event.welcomeMessage || '')
  const [mapsUrl, setMapsUrl] = useState(event.mapsUrl || '')
  // No es editable: cambiar el modo de ingreso después de compartir invitaciones
  // o links de autoregistro rompería esos links (ver firestore.rules y EventJoin).
  const entryMode = event.entryMode || 'list'
  const [capacity, setCapacity] = useState(event.capacity ? String(event.capacity) : '')
  const [maxCompanions, setMaxCompanions] = useState(String(event.maxCompanions ?? 0))
  const [customFields, setCustomFields] = useState<CustomField[]>(event.customFields || [])
  const [requiresPayment, setRequiresPayment] = useState(event.requiresPayment || false)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(event.paymentMethods?.length ? event.paymentMethods : ['transfer'])
  const [ticketPrice, setTicketPrice] = useState(event.ticketPrice ? String(event.ticketPrice) : '')
  const [currency, setCurrency] = useState(event.currency || '$')
  const [paymentInstructions, setPaymentInstructions] = useState(event.paymentInstructions || '')
  const [organizerContactPhone, setOrganizerContactPhone] = useState(event.organizerContactPhone || '')
  const [timeline, setTimeline] = useState<TimelineEntry[]>(event.timeline || [])
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
    setCapacity(fields.capacity)
    setMaxCompanions(fields.maxCompanions ?? String(event.maxCompanions ?? 0))
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

  function togglePaymentMethod(method: PaymentMethod) {
    setPaymentMethods((methods) =>
      methods.includes(method) ? methods.filter((m) => m !== method) : [...methods, method],
    )
  }

  // Autoguardado del borrador c/5s mientras haya cambios sin guardar — protege
  // ediciones largas de un cierre accidental de pestaña o un fallo de red.
  //
  // draftFieldsRef (useLiveRef) en vez de listar los 22 campos como
  // dependencias del efecto: con los 22 en el array, cada tecla en
  // CUALQUIER campo destruía y volvía a crear el setInterval — si el
  // usuario tipeaba sin pausas de 5s, el intervalo nunca llegaba a
  // dispararse (se comportaba como un debounce-tras-inactividad, no como
  // "cada 5s" real). El intervalo ahora se crea UNA sola vez (mientras no
  // haya un borrador pendiente) y en cada tick lee los valores más
  // recientes a través del ref — mismo patrón que ya usa Scanner.tsx para
  // que el callback de cámara no se resuscriba en cada cambio de estado.
  const draftFields: EventEditDraftFields = {
    name, date, startTime, endTime, location, description, dressCode, templateId, accentColor, welcomeMessage, mapsUrl,
    capacity, maxCompanions, customFields, requiresPayment, paymentMethods, ticketPrice, currency, paymentInstructions, organizerContactPhone, coverImage, timeline,
  }
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
    const trimmedName = name.trim()
    const trimmedLocation = location.trim()
    const trimmedDescription = description.trim()
    const trimmedDressCode = dressCode.trim()
    const trimmedMapsUrl = mapsUrl.trim()
    const trimmedWelcome = welcomeMessage.trim()

    if (event.name !== trimmedName) changes.push({ label: 'Nombre', detail: `"${event.name}" → "${trimmedName}"` })
    if (event.date !== date) changes.push({ label: 'Fecha', detail: `${event.date} → ${date}` })
    if ((event.startTime || '') !== startTime) {
      changes.push({ label: 'Hora de inicio', detail: `${event.startTime || 'sin definir'} → ${startTime || 'sin definir'}` })
    }
    if ((event.endTime || '') !== endTime) {
      changes.push({ label: 'Hora de fin', detail: `${event.endTime || 'sin definir'} → ${endTime || 'sin definir'}` })
    }
    if (event.location !== trimmedLocation) changes.push({ label: 'Lugar', detail: `"${event.location}" → "${trimmedLocation}"` })
    if ((event.description || '') !== trimmedDescription) changes.push({ label: 'Descripción', detail: 'Actualizada' })
    if ((event.dressCode || '') !== trimmedDressCode) {
      changes.push({ label: 'Vestimenta', detail: trimmedDressCode ? `"${trimmedDressCode}"` : 'Quitada' })
    }
    if ((event.mapsUrl || '') !== trimmedMapsUrl) {
      changes.push({ label: 'Link de Google Maps', detail: trimmedMapsUrl ? 'Actualizado' : 'Quitado' })
    }
    if ((event.templateId || 'default') !== templateId) {
      changes.push({ label: 'Plantilla del pase', detail: `${getTemplate(event.templateId).label} → ${getTemplate(templateId).label}` })
    }
    if ((event.accentColor || '') !== accentColor) {
      changes.push({ label: 'Color de acento', detail: accentColor ? 'Color personalizado' : 'Vuelve al color de la plantilla' })
    }
    if ((event.welcomeMessage || '') !== trimmedWelcome) changes.push({ label: 'Mensaje de bienvenida', detail: 'Actualizado' })
    if ((event.coverImage || '') !== coverImage) {
      changes.push({ label: 'Imagen de portada', detail: coverImage ? 'Actualizada' : 'Quitada' })
    }
    if ((event.capacity || 0) !== parsedCapacity) {
      changes.push({ label: 'Límite de invitados', detail: `${event.capacity || 0} → ${parsedCapacity}` })
    }
    if ((event.maxCompanions ?? 0) !== parsedMaxCompanions) {
      changes.push({ label: 'Acompañantes por invitado', detail: `${event.maxCompanions ?? 0} → ${parsedMaxCompanions}` })
    }
    if (JSON.stringify(event.customFields || []) !== JSON.stringify(customFields)) {
      changes.push({ label: 'Campos de registro', detail: `${(event.customFields || []).length} → ${customFields.length} campo(s)` })
    }
    if (JSON.stringify(event.timeline || []) !== JSON.stringify(timeline)) {
      changes.push({ label: 'Programa del evento', detail: `${(event.timeline || []).length} → ${timeline.length} actividad(es)` })
    }
    if ((event.requiresPayment || false) !== requiresPayment) {
      changes.push({ label: 'Cobro de entrada', detail: requiresPayment ? 'Activado' : 'Desactivado' })
    }
    if (requiresPayment) {
      const parsedPrice = parseFloat(ticketPrice) || 0
      const trimmedCurrency = currency.trim()
      const trimmedInstructions = paymentInstructions.trim()
      const trimmedContact = organizerContactPhone.trim()
      if (JSON.stringify(event.paymentMethods || []) !== JSON.stringify(paymentMethods)) {
        changes.push({ label: 'Métodos de cobro', detail: paymentMethods.map((m) => PAYMENT_METHOD_LABELS[m]).join(' + ') || 'Ninguno' })
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
    if (!name.trim() || !date || !location.trim()) return
    const { value: parsedCapacity, error: capacityValidationError } = parseCapacity(capacity)
    if (capacityValidationError) {
      setCapacityError(capacityValidationError)
      return
    }
    const { value: parsedMaxCompanions, error: maxCompanionsValidationError } = parseMaxCompanions(maxCompanions)
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
        name: name.trim(),
        date,
        startTime,
        endTime,
        location: location.trim(),
        description: description.trim(),
        dressCode: dressCode.trim() || undefined,
        coverImage,
        accentColor,
        templateId,
        welcomeMessage: welcomeMessage.trim(),
        mapsUrl: mapsUrl.trim() || undefined,
        entryMode,
        capacity: parsedCapacity,
        maxCompanions: parsedMaxCompanions,
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
    if (!name.trim() || !date || !location.trim()) return
    if (requiresPayment && paymentMethods.length === 0) {
      setSubmitError('Elegí al menos un método de cobro.')
      return
    }
    if (requiresPayment && !(parseFloat(ticketPrice) > 0)) {
      setSubmitError('Ingresá un precio mayor a 0 para el boleto.')
      return
    }
    const { value: parsedCapacity, error: capacityValidationError } = parseCapacity(capacity)
    if (capacityValidationError) {
      setCapacityError(capacityValidationError)
      return
    }
    const { value: parsedMaxCompanions, error: maxCompanionsValidationError } = parseMaxCompanions(maxCompanions)
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={EVENT_NAME_MAX}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor="edit-event-location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lugar</label>
          <input id="edit-event-location" type="text" required value={location} onChange={(e) => setLocation(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

        <div>
          <p className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha y hora</p>
          <EventScheduleField
            dateId="edit-event-date"
            startTimeId="edit-event-start-time"
            endTimeId="edit-event-end-time"
            date={date}
            onDateChange={setDate}
            startTime={startTime}
            onStartTimeChange={setStartTime}
            endTime={endTime}
            onEndTimeChange={setEndTime}
          />
        </div>
      </EditSection>

      <EditSection title="Detalles" subtitle="Descripción, vestimenta y ubicación en el mapa">
        <div>
          <label htmlFor="edit-event-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción (opcional)</label>
          <textarea id="edit-event-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div>
          <label htmlFor="edit-event-dress-code" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Vestimenta <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input id="edit-event-dress-code" type="text" value={dressCode} onChange={(e) => setDressCode(e.target.value)}
            maxLength={100} placeholder="Ej: Formal, Casual, Todo de blanco…"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div>
          <label htmlFor="edit-event-maps-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Link de Google Maps <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input id="edit-event-maps-url" type="url" value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)}
            placeholder="https://maps.google.com/maps?q=..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          <p className="text-xs text-gray-400 mt-1">
            Si no pegás un link, el pase no mostrará el botón "Cómo llegar" — así evitamos llevar a tus invitados a un lugar incorrecto. Para ver el mapa integrado, pega el link <strong>completo</strong> de Google Maps (desde el navegador, no el link corto).
          </p>
        </div>
      </EditSection>

      <EditSection title="Plantilla y estilo del pase" subtitle="Tema visual, portada, color de acento y mensaje de bienvenida">
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Plantilla del pase</p>
          <TemplatePicker
            selected={templateId}
            onSelect={setTemplateId}
            previewData={{ eventName: name, date, location, mapsUrl, coverImage, accentColor, welcomeMessage }}
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
                <input id="edit-event-accent-color" type="color" value={accentColor || getTemplate(templateId).vars.accent} onChange={(e) => setAccentColor(e.target.value)}
                  className="h-9 w-12 border border-gray-300 rounded-md cursor-pointer" />
                <span className="text-sm text-gray-500">{accentColor || `${getTemplate(templateId).vars.accent} (de la plantilla)`}</span>
              </div>
            </div>
            <div>
              <label htmlFor="edit-event-welcome-message" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mensaje de bienvenida</label>
              <input id="edit-event-welcome-message" type="text" value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)}
                placeholder="¡Te esperamos!" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
        </div>
      </EditSection>

      <EditSection title="Campos de registro" subtitle="Qué datos pides además de nombre y teléfono">
        <p className="text-xs text-gray-400 -mt-1">Nombre y teléfono siempre se piden. Agrega campos extra opcionales.</p>
        <CustomFieldsBuilder fields={customFields} onChange={setCustomFields} />
      </EditSection>

      <EditSection title="Programa del evento" subtitle="Orden del día visible en el pase del invitado">
        <p className="text-xs text-gray-400 -mt-1">Ej: 19:00 Recepción, 21:00 Cena…</p>
        <TimelineEditor entries={timeline} onChange={setTimeline} />
      </EditSection>

      <EditSection title="Modo de ingreso y cupo" subtitle={`Cupo actual: ${capacity || '0'} personas`}>
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
          <input id="edit-event-capacity" type="number" required min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)}
            placeholder="Ej: 200" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          <p className="text-xs text-gray-400 mt-1">
            Total de personas recomendado (invitados + acompañantes) — informativo, no bloquea nuevos registros si
            se supera.
          </p>
          {capacityError && <p className="text-xs text-red-500 mt-1">{capacityError}</p>}
        </div>
        <div>
          <label htmlFor="edit-event-max-companions" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Acompañantes por invitado</label>
          <input id="edit-event-max-companions" type="number" min="0" max={GUEST_MAX_COMPANIONS} value={maxCompanions} onChange={(e) => setMaxCompanions(e.target.value)}
            className="w-24 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          <p className="text-xs text-gray-400 mt-1">
            Cuántos acompañantes puede sumar cada invitado (autoregistro o alta manual). 0 = no se permiten
            acompañantes. No aplica a "Familia o grupo", que tiene su propio límite de integrantes.
          </p>
          {maxCompanionsError && <p className="text-xs text-red-500 mt-1">{maxCompanionsError}</p>}
        </div>
      </EditSection>

      <EditSection
        title="Cobro de entrada"
        subtitle={requiresPayment ? `Activo — ${currency}${ticketPrice || 0} por persona` : 'Desactivado'}
        defaultOpen={event.requiresPayment}
      >
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
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Métodos de cobro</label>
              <div className="flex gap-2">
                {(['transfer', 'cash'] as PaymentMethod[]).map((m) => (
                  <label
                    key={m}
                    className={`flex-1 flex items-center justify-center gap-2 border rounded-lg px-3 py-2.5 text-sm font-medium cursor-pointer transition-colors ${
                      paymentMethods.includes(m)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    <input type="checkbox" checked={paymentMethods.includes(m)} onChange={() => togglePaymentMethod(m)} className="sr-only" />
                    {PAYMENT_METHOD_LABELS[m]}
                  </label>
                ))}
              </div>
              {paymentMethods.length === 0 && <p className="text-xs text-red-500 mt-1">Elegí al menos un método.</p>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label htmlFor="edit-event-ticket-price" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio por persona</label>
                <input
                  id="edit-event-ticket-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={ticketPrice}
                  onChange={(e) => setTicketPrice(sanitizeDecimalInput(e.target.value))}
                  placeholder="Ej: 5000"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label htmlFor="edit-event-currency" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Moneda</label>
                <input
                  id="edit-event-currency"
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  placeholder="$"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            {paymentMethods.includes('transfer') && (
              <div>
                <label htmlFor="edit-event-payment-instructions" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Datos para transferencia</label>
                <textarea
                  id="edit-event-payment-instructions"
                  value={paymentInstructions}
                  onChange={(e) => setPaymentInstructions(e.target.value)}
                  rows={3}
                  placeholder="Ej: Transferí a alias fiesta.maria.mp, o por Mercado Pago: https://link.mercadopago..."
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}
            <div>
              <label htmlFor="edit-event-organizer-contact" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tu WhatsApp para pagos</label>
              <input
                id="edit-event-organizer-contact"
                type="tel"
                value={organizerContactPhone}
                onChange={(e) => setOrganizerContactPhone(e.target.value)}
                placeholder="Ej: +52 55 1234 5678"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
        <button type="submit" disabled={saving || coverUploading}
          className="bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar cambios'}
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
