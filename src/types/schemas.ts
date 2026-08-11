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
import { COMMUNITY_FONT_OPTIONS, INVITATION_TEMPLATES } from '../templates/registry'
import type { TemplateId } from './index'

// Derivados de su única fuente de verdad (WALL_TYPES / INVITATION_TEMPLATES) en
// vez de tipear los mismos valores a mano por 3ra/4ta vez — agregar un tipo de
// mensaje o una plantilla nueva ya no requiere recordar actualizar este archivo.
const templateIds = INVITATION_TEMPLATES.map((t) => t.id) as [TemplateId, ...TemplateId[]]
const communityFontValues = COMMUNITY_FONT_OPTIONS.map((o) => o.value) as [string, ...string[]]

// Plantillas comunitarias (Feature de innovación): a diferencia del resto de
// este archivo, este schema NO es solo diagnóstico — el formulario de envío
// (SubmitCommunityTemplate.tsx) lo usa para VALIDAR de verdad antes de
// escribir a Firestore, porque acá el dato es contenido generado por un
// tercero (UGC), no la salida de un mapper propio. Colores restringidos a
// hex estricto y fuentes a la misma lista curada que ya usa
// EventData.themeOverrides — mismo criterio de "no configuraciones
// arbitrarias" ya aplicado ahí. `shadow`/`borderRadius` restringidos a un
// alfabeto seguro (sin `;`, `{`, `url(`) para que un valor no confiable nunca
// pueda intentar salirse de una propiedad CSS individual, aunque hoy se
// inyecten como objetos de estilo de React (no strings concatenados) y el
// riesgo real sea bajo.
const HEX_COLOR_REGEX = /^#[0-9a-f]{6}$/i
const SAFE_CSS_VALUE_REGEX = /^[a-zA-Z0-9\s,.\-#()%]+$/

export const CommunityTemplateVarsSchema = z.object({
  accent: z.string().regex(HEX_COLOR_REGEX),
  accentDark: z.string().regex(HEX_COLOR_REGEX),
  accentSoft: z.string().regex(HEX_COLOR_REGEX),
  pageBg: z.string().regex(HEX_COLOR_REGEX),
  surface: z.string().regex(HEX_COLOR_REGEX),
  text: z.string().regex(HEX_COLOR_REGEX),
  textMuted: z.string().regex(HEX_COLOR_REGEX),
  border: z.string().regex(HEX_COLOR_REGEX),
  fontFamily: z.enum(communityFontValues),
  borderRadius: z.string().regex(/^[\d.]+(px|rem|em|%)$/),
  shadow: z.string().max(300).regex(SAFE_CSS_VALUE_REGEX),
  enterAnimation: z.enum(['animate-fade-in-up', 'animate-fade-in', 'animate-bounce-in', 'animate-slide-in-up']),
  confettiShape: z.enum(['star', 'square']).optional(),
  secondaryFontFamily: z.enum(communityFontValues).optional(),
  buttonVariant: z.enum(['solid', 'outline']).optional(),
  spacingScale: z.enum(['compact', 'cozy', 'relaxed']).optional(),
})

export const CommunityTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  authorUid: z.string().min(1),
  authorDisplayName: z.string(),
  description: z.string().max(500),
  category: z.string().min(1),
  previewImageUrl: z.string().optional(),
  vars: CommunityTemplateVarsSchema,
  license: z.string().max(60),
  version: z.number().int().positive(),
  compatibility: z.array(z.string()),
  status: z.enum(['draft', 'in_review', 'approved', 'rejected', 'archived']),
  reviewerUid: z.string().optional(),
  reviewNotes: z.string().optional(),
  createdAt: z.number(),
  submittedAt: z.number().optional(),
  publishedAt: z.number().optional(),
  updatedAt: z.number(),
})

const CustomFieldOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
})

const CustomFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['text', 'number', 'email', 'phone', 'select']),
  required: z.boolean(),
  options: z.array(CustomFieldOptionSchema).optional(),
})

const TimelineEntrySchema = z.object({
  time: z.string(),
  label: z.string().min(1),
})

const FaqEntrySchema = z.object({
  id: z.string(),
  question: z.string().min(1),
  answer: z.string().min(1),
})

const TransportOptionSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  description: z.string().optional(),
})

const TransportInfoSchema = z.object({
  options: z.array(TransportOptionSchema).optional(),
  parkingInfo: z.string().optional(),
  specialInstructions: z.array(z.string()).optional(),
})

const ReminderRuleSchema = z.object({
  id: z.string(),
  daysBeforeDeadline: z.number().int().min(0).max(60),
})

const GuestSegmentTagSchema = z.object({
  id: z.string(),
  label: z.string(),
  color: z.string().optional(),
})

const SectionVisibilityRuleSchema = z.object({
  tags: z.array(z.string()).optional(),
  rsvpStatus: z.array(z.enum(['pending', 'yes', 'no'])).optional(),
  paymentStatus: z.array(z.enum(['unpaid', 'pending_confirmation', 'paid', 'expired'])).optional(),
  hasCompanion: z.boolean().optional(),
})

const VisibilitySectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string().optional(),
  visibility: SectionVisibilityRuleSchema.optional(),
})

const ThemeOverridesSchema = z.object({
  accent: z.string().optional(),
  secondaryFontFamily: z.string().optional(),
  buttonVariant: z.enum(['solid', 'outline']).optional(),
})

const MenuOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
})

const DietaryRestrictionSchema = z.object({
  id: z.string(),
  label: z.string(),
  requiresNote: z.boolean().optional(),
})

const MenuSelectionSchema = z.object({
  optionId: z.string().optional(),
  restrictionIds: z.array(z.string()).optional(),
  note: z.string().optional(),
})

const GiftInfoSchema = z.object({
  message: z.string().optional(),
  registryUrl: z.string().optional(),
  cashInfo: z.string().optional(),
})

// Espeja ConcessionsConfig (src/types/concessions.ts) — campo opcional de
// EventData, presente solo si el evento activó el módulo de comida/bebida.
const ConcessionsConfigSchema = z.object({
  enabled: z.boolean(),
  storeName: z.string().optional(),
  currency: z.string(),
  paymentMethods: z.array(z.enum(['transfer', 'cash'])),
  useEventPaymentInstructions: z.boolean(),
  paymentInstructions: z.string().optional(),
  pickupInstructions: z.string().optional(),
  concessionsStaffMap: z.record(z.string(), z.string()).optional(),
})

// Espeja CoOrganizerPermissions (src/types/coOrganizerPermissions.ts).
// Optional a nivel de mapa: un evento/co-org de antes de este campo
// simplemente no lo tiene, resuelto con LEGACY_COORG_DEFAULTS en el cliente.
const CoOrganizerPermissionsSchema = z.object({
  addGuests: z.boolean(),
  editGuests: z.boolean(),
  deleteGuests: z.boolean(),
  shareInviteLink: z.boolean(),
  confirmPayments: z.boolean(),
  scanQr: z.boolean(),
  viewGuestList: z.boolean(),
  postWall: z.boolean(),
  moderateWall: z.boolean(),
  editEvent: z.boolean(),
  manageCoOrganizers: z.boolean(),
  viewReports: z.boolean(),
  exportLists: z.boolean(),
  downloadEventInfo: z.boolean(),
  manageSeating: z.boolean(),
  viewLiveDashboard: z.boolean(),
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
  dressCode: z.string().optional(),
  coverImage: z.string(),
  accentColor: z.string(),
  templateId: z.enum(templateIds),
  themeOverrides: ThemeOverridesSchema.optional(),
  communityTemplateSnapshot: z.object({
    id: z.string(),
    name: z.string(),
    vars: CommunityTemplateVarsSchema.partial(),
  }).optional(),
  welcomeMessage: z.string(),
  mapsUrl: z.string(),
  entryMode: z.enum(['list', 'open', 'hybrid']),
  capacity: z.number(),
  attendeeLimitEnabled: z.boolean().optional(),
  maxCompanions: z.number().optional(),
  customFields: z.array(CustomFieldSchema),
  requiresPayment: z.boolean(),
  paymentMethods: z.array(z.enum(['transfer', 'cash'])),
  ticketPrice: z.number(),
  currency: z.string(),
  paymentInstructions: z.string(),
  organizerContactPhone: z.string().optional(),
  organizerContactPhoneCountry: z.string().optional(),
  timeline: z.array(TimelineEntrySchema).optional(),
  faq: z.array(FaqEntrySchema).optional(),
  transport: TransportInfoSchema.optional(),
  rsvpDeadline: z.string().optional(),
  remindersEnabled: z.boolean().optional(),
  reminderRules: z.array(ReminderRuleSchema).optional(),
  reconfirmCampaign: z.object({
    startedAt: z.number(),
    deadline: z.number(),
    excludeTagIds: z.array(z.string()).optional(),
    reminderRules: z.array(ReminderRuleSchema),
  }).optional(),
  guestTags: z.array(GuestSegmentTagSchema).optional(),
  vipTagId: z.string().nullable().optional(),
  sectionVisibility: z.record(z.string(), SectionVisibilityRuleSchema).optional(),
  departureReminderBufferMinutes: z.number().optional(),
  sections: z.array(VisibilitySectionSchema).optional(),
  menu: z.object({ options: z.array(MenuOptionSchema), restrictions: z.array(DietaryRestrictionSchema) }).optional(),
  gifts: GiftInfoSchema.optional(),
  plan: z.enum(['premium']),
  paymentStatus: z.enum(['pending', 'paid', 'free_trial']),
  status: z.enum(['active', 'cancelled', 'archived']),
  guestCount: z.number(),
  peopleCount: z.number(),
  checkedInCount: z.number(),
  occupancyCount: z.number(),
  paidCount: z.number(),
  checkinsByHour: z.record(z.string(), z.number()),
  rsvpYesCount: z.number(),
  rsvpNoCount: z.number(),
  rsvpPendingCount: z.number(),
  coOrganizersMap: z.record(z.string(), z.string()),
  coOrganizerPermissions: z.record(z.string(), CoOrganizerPermissionsSchema).optional(),
  concessions: ConcessionsConfigSchema.optional(),
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
  phoneCountry: z.string().optional(),
  menuSelection: MenuSelectionSchema.optional(),
})

export const GuestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lastName: z.string(),
  phone: z.string(),
  phoneCountry: z.string().optional(),
  email: z.string().optional(),
  qrToken: z.string().min(1),
  status: z.enum(['invited', 'checked_in']),
  companions: z.array(CompanionDataSchema),
  isGroup: z.boolean().optional(),
  registrationSource: z.enum(['organizer', 'self']).optional(),
  rsvpStatus: z.enum(['pending', 'yes', 'no']),
  checkedInAt: z.number().nullable(),
  checkedInBy: z.string().nullable(),
  checkedInByEmail: z.string().nullable(),
  checkedOutAt: z.number().nullable(),
  checkedOutByEmail: z.string().nullable(),
  exitType: z.enum(['temporary', 'final']).nullable(),
  presentIndices: z.array(z.number()).optional(),
  lockToken: z.string().nullable(),
  lockTokens: z.array(z.string()).optional(),
  customData: z.record(z.string(), z.string()).optional(),
  tags: z.array(z.string()).optional(),
  tableId: z.string().nullable().optional(),
  menuSelection: MenuSelectionSchema.optional(),
  paymentStatus: z.enum(['unpaid', 'pending_confirmation', 'paid', 'expired']),
  paymentMethod: z.enum(['transfer', 'cash']).nullable(),
  paymentNote: z.string().optional(),
  guestUid: z.string().nullable().optional(),
  guestPhotoURL: z.string().nullable().optional(),
  createdAt: z.number(),
  reconfirmStatus: z.enum(['requested', 'confirmed', 'expired']).optional(),
  reconfirmDeadline: z.number().nullable().optional(),
  version: z.number().optional(),
  updatedAt: z.number().nullable().optional(),
})

export const WaitlistEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  partySize: z.number().int().min(1),
  phone: z.string().optional(),
  phoneCountry: z.string().optional(),
  email: z.string().optional(),
  customData: z.record(z.string(), z.string()).optional(),
  waitlistToken: z.string().min(1),
  status: z.enum(['waiting', 'offered', 'promoted', 'declined', 'expired', 'removed']),
  priorityBoost: z.number(),
  createdAt: z.number(),
  offerToken: z.string().nullable(),
  offerExpiresAt: z.number().nullable(),
  respondedAt: z.number().nullable(),
  promotedGuestId: z.string().nullable(),
  promotionReason: z.enum(['fifo', 'manual']).nullable(),
  registrationSource: z.enum(['organizer', 'self']).optional(),
})

export const CheckinSchema = z.object({
  id: z.string().min(1),
  guestId: z.string().min(1),
  guestName: z.string(),
  type: z.enum(['check_in', 'check_out', 'entry_blocked']),
  exitKind: z.enum(['temporary', 'final']).optional(),
  reentry: z.boolean().optional(),
  reason: z.enum(['final_exit_blocked']).optional(),
  addedCount: z.number().optional(),
  partial: z.boolean().optional(),
  timestamp: z.number(),
  scannedBy: z.string(),
  scannedByEmail: z.string().nullable(),
})

export const SeatingTableSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  capacity: z.number().int().positive(),
  shape: z.enum(['round', 'rectangular', 'square', 'custom']),
  zone: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  sortOrder: z.number(),
  notes: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

const concessionsCategorySchema = z.enum(['drink', 'food', 'snack', 'souvenir', 'special'])

export const ConcessionItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  category: concessionsCategorySchema,
  imageUrl: z.string().optional(),
  priceMinorUnits: z.number().int().nonnegative(),
  currency: z.string().min(1),
  stockMode: z.enum(['unlimited', 'limited']),
  stockRemaining: z.number().int().nonnegative().optional(),
  stockInitial: z.number().int().nonnegative().optional(),
  soldCount: z.number().int().nonnegative(),
  status: z.enum(['active', 'outOfStock', 'archived']),
  sortOrder: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

const ConcessionOrderLineSchema = z.object({
  itemId: z.string().min(1),
  nameSnapshot: z.string(),
  categorySnapshot: concessionsCategorySchema,
  unitPriceMinorUnitsSnapshot: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  lineTotalMinorUnits: z.number().int().nonnegative(),
})

export const ConcessionOrderSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  guestId: z.string().min(1),
  guestNameSnapshot: z.string(),
  items: z.array(ConcessionOrderLineSchema),
  subtotalMinorUnits: z.number().int().nonnegative(),
  totalMinorUnits: z.number().int().nonnegative(),
  currency: z.string().min(1),
  itemCount: z.number().int().positive(),
  paymentMethod: z.enum(['transfer', 'cash']).nullable(),
  paymentPhase: z.enum(['awaiting_payment', 'proof_submitted', 'confirmed', 'rejected', 'cancelled']),
  paymentNote: z.string().optional(),
  paymentProofUrl: z.string().optional(),
  rejectionReason: z.string().optional(),
  cancelReason: z.enum([
    'guest_cancelled', 'organizer_cancelled', 'refunded', 'item_removed', 'guest_removed_from_event', 'event_cancelled',
  ]).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  paidAt: z.number().optional(),
})

const ConcessionFulfillmentLineSchema = z.object({
  nameSnapshot: z.string(),
  categorySnapshot: concessionsCategorySchema,
  quantity: z.number().int().positive(),
})

export const ConcessionFulfillmentSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  guestId: z.string().min(1),
  guestNameSnapshot: z.string(),
  orderNumber: z.string().min(1),
  lines: z.array(ConcessionFulfillmentLineSchema),
  fulfillmentStatus: z.enum(['not_ready', 'queued', 'preparing', 'ready', 'delivered', 'cancelled']),
  createdAt: z.number(),
  updatedAt: z.number(),
  deliveredAt: z.number().optional(),
})

const WallReplySchema = z.object({
  id: z.string(),
  text: z.string(),
  authorName: z.string(),
  authorToken: z.string(),
  authorRole: z.enum(['owner', 'guest']),
  authorPhotoURL: z.string().optional(),
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
  reactionCount: z.number(),
  reactionCountsByType: z.record(z.string(), z.number()),
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
