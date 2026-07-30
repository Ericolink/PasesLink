import type { NewEventInput } from '../firebase/events'
import type { CustomField, EntryMode, PaymentMethod, TemplateId, TimelineEntry } from '../types'

export interface EventDraftFields {
  name: string
  date: string
  startTime: string
  endTime: string
  location: string
  description: string
  dressCode: string
  templateId: TemplateId
  accentColor: string
  secondaryFontFamily: string
  buttonVariant: 'solid' | 'outline'
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
  organizerContactPhoneCountry: string
  coverImage: string
  timeline: TimelineEntry[]
}

// Auditoría de escalabilidad (F19): todos los campos del formulario en un
// solo objeto de estado (en vez de 22 useState individuales) + una función
// genérica updateField para tocarlos — mismo criterio en EditEventForm.tsx.
// `coverImage` queda AFUERA a propósito: lo dueña useCoverPhoto (recorte,
// subida, error), no este formulario.
export type FormFields = Omit<EventDraftFields, 'coverImage'>

// Arma el objeto que viaja a Firestore a partir del estado del formulario —
// vive fuera de EventCreate.tsx (que solo puede exportar el componente, ver
// react-refresh/only-export-components) para que tanto la creación
// temprana como cada actualización incremental (ver persistProgress en
// EventCreate.tsx, Fase 3 del rediseño del wizard) construyan exactamente
// lo mismo, y para poder testearla sin renderizar el componente ni tocar
// Firebase.
export function buildEventInput(
  form: FormFields,
  coverImage: string,
  parsedCapacity: number,
  parsedMaxCompanions: number,
): NewEventInput {
  return {
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
    themeOverrides: (form.secondaryFontFamily || form.buttonVariant !== 'solid')
      ? {
        ...(form.secondaryFontFamily ? { secondaryFontFamily: form.secondaryFontFamily } : {}),
        ...(form.buttonVariant !== 'solid' ? { buttonVariant: form.buttonVariant } : {}),
      }
      : undefined,
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
    organizerContactPhoneCountry: form.requiresPayment ? form.organizerContactPhoneCountry : '',
    timeline: form.timeline,
  }
}
