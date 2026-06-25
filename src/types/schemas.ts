// Schemas de validación runtime para los documentos que llegan desde
// Firestore. NO son la fuente de tipos de la app (eso siguen siendo las
// interfaces de src/types/index.ts) — son una capa de diagnóstico que se
// ejecuta DESPUÉS de mapear un doc, para detectar si el resultado tiene la
// forma esperada. Si no la tiene, se loguea un error claro en vez de dejar
// que un `undefined` silencioso (de un cast `as string` sin fallback) se
// propague aguas abajo sin explicación.
//
// Deliberadamente NO reemplazan los mappers existentes ni cambian su tipo de
// retorno: siguen devolviendo el mismo objeto que devolvían antes (con los
// mismos fallbacks ya escritos), solo que ahora también se valida su forma.
// Cambiar los mappers para que retornen `null` en datos inválidos tocaría
// ~12 call sites en todo firebase/*.ts, incluidos checkInGuest/checkOutGuest
// (las transacciones más sensibles del proyecto) — ver TODO en events.ts y
// guests.ts para el alcance completo de ese cambio mayor, deliberadamente no
// incluido en esta subfase.
import { z } from 'zod'
import { WALL_TYPES } from '../utils/validation'
import { INVITATION_TEMPLATES } from '../templates/registry'
import type { TemplateId } from './index'

// Derivados de su única fuente de verdad (WALL_TYPES / INVITATION_TEMPLATES) en
// vez de tipear los mismos valores a mano por 3ra/4ta vez — agregar un tipo de
// mensaje o una plantilla nueva ya no requiere recordar actualizar este archivo.
const templateIds = INVITATION_TEMPLATES.map((t) => t.id) as [TemplateId, ...TemplateId[]]

const CustomFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['text', 'number', 'email', 'phone']),
  required: z.boolean(),
})

export const EventSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  name: z.string().min(1),
  date: z.string().min(1),
  startTime: z.string(),
  endTime: z.string(),
  location: z.string().min(1),
  description: z.string(),
  coverImage: z.string(),
  accentColor: z.string(),
  templateId: z.enum(templateIds),
  welcomeMessage: z.string(),
  mapsUrl: z.string(),
  entryMode: z.enum(['list', 'open', 'hybrid']),
  capacity: z.number(),
  customFields: z.array(CustomFieldSchema),
  requiresPayment: z.boolean(),
  ticketPrice: z.number(),
  currency: z.string(),
  paymentInstructions: z.string(),
  plan: z.enum(['premium']),
  paymentStatus: z.enum(['pending', 'paid', 'free_trial']),
  status: z.enum(['active', 'cancelled', 'archived']),
  guestCount: z.number(),
  checkedInCount: z.number(),
  coOrganizersMap: z.record(z.string(), z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
})

// Optional, no con fallback '': los acompañantes "legacy" (formato numérico
// viejo, ver normalizeCompanions en firebase/guests.ts) se normalizan a
// objetos `{}` sin estas claves, no a strings vacíos.
const CompanionDataSchema = z.object({
  name: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
})

export const GuestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lastName: z.string(),
  phone: z.string(),
  qrToken: z.string().min(1),
  status: z.enum(['invited', 'checked_in']),
  companions: z.array(CompanionDataSchema),
  rsvpStatus: z.enum(['pending', 'yes', 'no']),
  checkedInAt: z.number().nullable(),
  checkedInBy: z.string().nullable(),
  checkedInByEmail: z.string().nullable(),
  checkedOutAt: z.number().nullable(),
  checkedOutByEmail: z.string().nullable(),
  lockToken: z.string().nullable(),
  customData: z.record(z.string(), z.string()).optional(),
  paymentStatus: z.enum(['unpaid', 'paid']),
  createdAt: z.number(),
})

export const CheckinSchema = z.object({
  id: z.string().min(1),
  guestId: z.string().min(1),
  guestName: z.string(),
  type: z.enum(['check_in', 'check_out']),
  timestamp: z.number(),
  scannedBy: z.string(),
  scannedByEmail: z.string().nullable(),
})

const WallReplySchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.number(),
})

export const WallMessageSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  type: z.enum(WALL_TYPES),
  authorName: z.string(),
  authorToken: z.string(),
  authorRole: z.enum(['owner', 'guest']),
  authorPhotoURL: z.string().optional(),
  createdAt: z.number(),
  likedBy: z.array(z.string()),
  dislikedBy: z.array(z.string()),
  replies: z.array(WallReplySchema),
  deleted: z.boolean(),
  pinned: z.boolean(),
})

// Valida `mapped` (la salida YA construida por el mapper) contra `schema` y
// loguea un error descriptivo si no calza — no lanza, no modifica `mapped`.
export function warnIfInvalidShape(schema: z.ZodType, label: string, mapped: unknown): void {
  const result = schema.safeParse(mapped)
  if (!result.success) {
    console.error(`❌ Documento ${label} con forma inesperada:`, mapped, result.error.issues)
  }
}
