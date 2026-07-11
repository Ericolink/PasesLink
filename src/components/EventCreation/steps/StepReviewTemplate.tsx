import { TemplatePicker } from '../../TemplatePicker'
import { PAYMENT_METHOD_LABELS } from '../../../utils/paymentMethods'
import { formatDate } from '../../../utils/time'
import type { CustomField, EntryMode, PaymentMethod, TemplateId, TimelineEntry } from '../../../types'

const ENTRY_MODE_LABELS: Record<EntryMode, string> = {
  list: 'Por lista de invitados',
  open: 'Entrada libre',
  hybrid: 'Mixto (lista + entrada libre)',
}

interface StepReviewTemplateProps {
  name: string
  date: string
  location: string
  entryMode: EntryMode
  requiresPayment: boolean
  paymentMethods: PaymentMethod[]
  ticketPrice: string
  currency: string
  coverImage: string
  accentColor: string
  description: string
  dressCode: string
  mapsUrl: string
  welcomeMessage: string
  timeline: TimelineEntry[]
  customFields: CustomField[]
  showRegistrationFieldsRow: boolean
  templateId: TemplateId
  onSelectTemplate: (id: TemplateId) => void
  onEditStep: (step: number) => void
}

function SummaryRow({ title, detail, onEdit }: { title: string; detail: string; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{detail}</p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 text-xs font-medium text-primary hover:underline"
      >
        Editar
      </button>
    </div>
  )
}

export function StepReviewTemplate({
  name,
  date,
  location,
  entryMode,
  requiresPayment,
  paymentMethods,
  ticketPrice,
  currency,
  coverImage,
  accentColor,
  description,
  dressCode,
  mapsUrl,
  welcomeMessage,
  timeline,
  customFields,
  showRegistrationFieldsRow,
  templateId,
  onSelectTemplate,
  onEditStep,
}: StepReviewTemplateProps) {
  const paymentSummary = requiresPayment
    ? `Cobra ${currency}${ticketPrice || '0'} · ${
        paymentMethods.length ? paymentMethods.map((m) => PAYMENT_METHOD_LABELS[m]).join(', ') : 'sin método elegido'
      }`
    : 'Entrada gratuita'

  const activeTimelineCount = timeline.filter((e) => e.time && e.label.trim()).length
  const formattedDate = date ? formatDate(date) : undefined

  return (
    <>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Última revisión. Podés editar cualquier sección — al confirmar, volvés directo acá.
      </p>

      <div className="border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-700 px-4 mb-5">
        <SummaryRow
          title="Información básica"
          detail={`${name || 'Sin nombre'} · ${formattedDate || 'sin fecha'} · ${location || 'sin lugar'}`}
          onEdit={() => onEditStep(1)}
        />
        <SummaryRow
          title="Método de invitación"
          detail={`${ENTRY_MODE_LABELS[entryMode]} · ${paymentSummary}`}
          onEdit={() => onEditStep(2)}
        />
        <SummaryRow
          title="Imagen y colores"
          detail={coverImage ? 'Con portada' : 'Sin portada'}
          onEdit={() => onEditStep(3)}
        />
        <SummaryRow
          title="Descripción y ubicación"
          detail={description.trim() ? 'Con descripción' : 'Sin descripción'}
          onEdit={() => onEditStep(4)}
        />
        <SummaryRow
          title="Programa del evento"
          detail={activeTimelineCount > 0 ? `${activeTimelineCount} actividad(es)` : 'Sin programa'}
          onEdit={() => onEditStep(5)}
        />
        {showRegistrationFieldsRow && (
          <SummaryRow
            title="Campos de registro"
            detail={customFields.length > 0 ? `${customFields.length} campo(s) extra` : 'Solo nombre y teléfono'}
            onEdit={() => onEditStep(6)}
          />
        )}
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Plantilla del pase
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Así se verá la invitación completa que reciben tus invitados.
          </p>
        </div>
        <TemplatePicker
          selected={templateId}
          onSelect={onSelectTemplate}
          previewData={{
            eventName: name,
            date: formattedDate,
            location,
            mapsUrl,
            coverImage,
            accentColor,
            welcomeMessage,
            description,
            dressCode,
            timeline,
          }}
        />
      </div>
    </>
  )
}
