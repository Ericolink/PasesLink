import type { CoOrganizerPermissions } from './coOrganizerPermissions'
import type { ConcessionsConfig } from './concessions'

// Por ahora solo existe 'premium' (gratis durante el lanzamiento). Se deja como
// union (no un literal suelto) para poder reintroducir un tier de pago después
// sin tocar el resto del código, que ya está escrito en términos de `Plan`.
type Plan = 'premium'

type PaymentStatus = 'pending' | 'paid' | 'free_trial'

export type EventStatus = 'active' | 'cancelled' | 'archived'

export type EntryMode = 'list' | 'open' | 'hybrid'

// Ciclo de vida del pago de un invitado. Deliberadamente el ÚNICO campo que
// responde "¿está pagado?" — independiente de si el invitado cuenta para el
// cupo (el registro nunca se bloquea ni se libera por pago, ver
// EventData.capacity/paidCount).
// - 'unpaid': sin pago confirmado. Sin límite de tiempo — un invitado puede
//   subir su comprobante o esperar a pagar en efectivo el día del evento
//   cuando quiera, no hay cronómetro ni vencimiento.
// - 'pending_confirmation': el invitado marcó "ya pagué / comprobante
//   enviado" (solo transferencia) — espera que el organizador apruebe o
//   rechace. Un rechazo lo vuelve a 'unpaid' (nunca a 'expired'). Pensado
//   para que el día que exista una pasarela de pago real, este estado lo
//   resuelva un webhook en segundos en vez de un organizador a mano — la
//   máquina de estados no cambia, solo quién la dispara.
// - 'paid': pago confirmado por el organizador (o, a futuro, la pasarela).
//   Es la ÚNICA transición que mueve EventData.paidCount — nunca al solo
//   enviar comprobante.
// - 'expired': valor LEGACY, de antes de eliminar el "apartado temporal de
//   lugar" (holdExpiresAt + un barrido periódico que lo vencía solo). El
//   código actual nunca vuelve a escribir este valor, pero puede seguir
//   apareciendo en documentos ya guardados en producción — no se migran a
//   mano. Toda la UI/lógica debe tratarlo como equivalente a 'unpaid'
//   (comparar con `!== 'paid' && !== 'pending_confirmation'`, no enumerar
//   los 3 valores "no pagados" a mano).
export type GuestPaymentStatus = 'unpaid' | 'pending_confirmation' | 'paid' | 'expired'

// Formas de cobro que un organizador puede activar para un evento con costo
// (EventCreate/EditEventForm). Un evento puede ofrecer una sola o ambas a la
// vez — ver `paymentMethods` en EventData.
export type PaymentMethod = 'transfer' | 'cash'

export type CustomFieldType = 'text' | 'number' | 'email' | 'phone' | 'select'

// Unión cerrada (no string suelto) para que agregar una plantilla nueva sea
// un error de tipos hasta que también se agregue su entrada en
// src/templates/registry.ts — evita plantillas "fantasma" referenciadas desde
// un evento pero sin definición visual.
export type TemplateId =
  | 'default'
  | 'wedding'
  | 'cowboy'
  | 'graduation'
  | 'formal'
  | 'kids'
  | 'houseparty'

export interface CustomFieldOption {
  id: string
  label: string
}

export interface CustomField {
  id: string
  label: string
  type: CustomFieldType
  required: boolean
  // Solo tiene sentido cuando type === 'select'. La respuesta del invitado se
  // guarda en GuestData.customData como el `id` de la opción elegida (no su
  // label), igual que customData ya se indexa por field.id y no por
  // field.label — así, renombrar una opción no huérfana las respuestas ya
  // guardadas. Quien muestre el valor a un humano debe resolverlo con
  // formatCustomFieldValue (utils/customFieldInput.ts).
  options?: CustomFieldOption[]
}

export interface TimelineEntry {
  time: string   // 'HH:MM' (formato 24h, igual que startTime/endTime)
  label: string
}

export interface FaqEntry {
  id: string
  question: string
  answer: string
}

export interface TransportOption {
  id: string
  label: string          // ej. "Shuttle desde el hotel X", "Uber recomendado"
  description?: string
}

// Agrupado en un solo objeto anidado (no 3 campos top-level en EventData):
// las 3 piezas siempre se editan/muestran juntas ("cómo llegar"), y así un
// solo `event.transport` presente/ausente gatea toda la sección de cara al
// invitado. `parkingInfo` es un párrafo libre (no una lista estructurada)
// porque el estacionamiento suele ser una sola nota ("gratis en el lugar"),
// no varias opciones — a diferencia de `options`, que sí son alternativas
// entre las que el invitado elige.
export interface TransportInfo {
  options?: TransportOption[]
  parkingInfo?: string
  specialInstructions?: string[]
}

// Cuántos días antes de rsvpDeadline se dispara un recordatorio (0 = el
// mismo día del cierre). Sin `hour`: el cron corre una sola vez al día para
// toda la flota de eventos (ver scripts/send-rsvp-reminders.mjs) — respetar
// un horario por evento costaría correr el workflow cada hora, 12-24x más
// minutos de GitHub Actions sin beneficio real a esta escala.
export interface ReminderRule {
  id: string
  daysBeforeDeadline: number
}

// Catálogo de segmentos que el organizador define para su evento (ej. "VIP",
// "Familia", "Staff") — libre, no un enum cerrado, porque cada evento arma
// los suyos. `id` es estable (no el `label`, que puede renombrarse sin
// romper referencias ya guardadas en GuestData.tags/VisibilitySection.visibility,
// mismo criterio que CustomFieldOption.id vs .label).
export interface GuestSegmentTag {
  id: string
  label: string
  color?: string
}

// Forma de la mesa: solo afecta el ícono/preview en la UI (TableCard) —
// ninguna regla ni cálculo de ocupación la lee. 'custom' cubre layouts que no
// encajan en las 3 formas básicas sin forzar un valor incorrecto.
export type SeatingTableShape = 'round' | 'rectangular' | 'square' | 'custom'

// Mesa de un evento (events/{eventId}/tables/{tableId}). La asignación
// invitado→mesa vive en GuestData.tableId (no acá, como array) para no tener
// que reescribir este doc cada vez que alguien cambia de mesa — la ocupación
// se calcula sumando partySize() de los invitados con ese tableId, con los
// datos que la pantalla de asignación ya tiene en memoria vía useEvent().
// `position` no se usa todavía: queda reservado para un plano/drag&drop
// futuro sin requerir otra migración de datos.
export interface SeatingTableData {
  id: string
  name: string
  capacity: number
  shape: SeatingTableShape
  // Salón/área libre (ej. "Salón principal", "Terraza") — string libre por
  // ahora, sin catálogo propio; se puede promover a un catálogo tipado el día
  // que un evento necesite gestionar varios salones con reglas propias.
  zone?: string
  position?: { x: number; y: number }
  sortOrder: number
  notes?: string
  createdAt: number
  updatedAt: number
}

// Motor de visibilidad de secciones (invitado, no organizador — para
// permisos de organizador ver coOrganizerPermissions.ts). Cada campo
// presente es una condición en AND con las demás; dentro de un campo, los
// valores están en OR entre sí. Sin condiciones (objeto vacío/ausente) =
// visible para cualquier invitado. Deliberadamente sin operadores OR/NOT a
// nivel de regla: nadie pidió combinaciones booleanas arbitrarias todavía, y
// agregarlas ahora sería sobre-diseño — este shape deja lugar para sumar
// campos futuros (rol, rango de fecha) sin romper los ya guardados.
export interface SectionVisibilityRule {
  tags?: string[]
  rsvpStatus?: RsvpStatus[]
  paymentStatus?: GuestPaymentStatus[]
  hasCompanion?: boolean
}

// Sección nueva y libre (After Party, Cena VIP, Hospedaje...) que el
// organizador arma desde cero, con gating opcional. Las secciones YA
// existentes del evento (transport/faq/timeline/welcomeMessage) NO se
// migran a este modelo — conservan sus propios tipos y componentes ya
// probados en producción; su gating opcional vive en
// EventData.sectionVisibility, no acá. `body` es texto libre (no HTML) para
// no abrir una superficie de XSS nueva en GuestPass. Sin campo `order`
// separado: el orden es la posición dentro del array
// EventData.sections, mismo criterio que FaqEntry/TimelineEntry (reordenar
// = mover dentro del array, ver useReorderableList).
export interface VisibilitySection {
  id: string
  title: string
  body?: string
  visibility?: SectionVisibilityRule
}

// Subconjunto de InvitationTemplate['vars'] (src/templates/registry.ts) que
// el organizador puede pisar por evento — no se importa el tipo completo
// acá para evitar un ciclo de imports (registry.ts ya importa TemplateId
// desde este archivo). Debe seguir siendo un subconjunto ESTRUCTURALMENTE
// compatible con TemplateVars: buildInviteThemeStyle lo recibe como
// Partial<TemplateVars> gracias al tipado estructural de TS, sin cast.
export interface ThemeOverrides {
  accent?: string
  secondaryFontFamily?: string
  buttonVariant?: 'solid' | 'outline'
}

// Mismo motivo que ThemeOverrides arriba (evitar ciclo de imports con
// registry.ts): estructuralmente idéntico a InvitationTemplate['vars']
// (TemplateVars, ya exportado desde registry.ts) — TypeScript los trata como
// compatibles por tipado estructural, sin necesidad de importar uno desde el
// otro. Si TemplateVars gana un campo nuevo, este tipo también debe ganarlo
// para seguir siendo compatible (el compilador lo señala en
// buildInviteThemeStyle si se olvida).
export interface CommunityTemplateVars {
  accent: string
  accentDark: string
  accentSoft: string
  pageBg: string
  surface: string
  text: string
  textMuted: string
  border: string
  fontFamily: string
  borderRadius: string
  shadow: string
  enterAnimation: 'animate-fade-in-up' | 'animate-fade-in' | 'animate-bounce-in' | 'animate-slide-in-up'
  confettiShape?: 'star' | 'square'
  secondaryFontFamily?: string
  buttonVariant?: 'solid' | 'outline'
  spacingScale?: 'compact' | 'cozy' | 'relaxed'
}

export type CommunityTemplateStatus = 'draft' | 'in_review' | 'approved' | 'rejected' | 'archived'

// Plantilla propuesta por un diseñador externo (Feature de innovación:
// plantillas comunitarias). Colección top-level `communityTemplates/{id}` —
// ver firestore.rules para el flujo de moderación (mismo patrón que
// `reports`: create requiere auth, update de contenido solo del autor en
// draft/rejected, transiciones de estado solo por isAdmin()).
export interface CommunityTemplate {
  id: string
  name: string
  authorUid: string
  // Snapshot del nombre del autor al momento de crear/actualizar — evita leer
  // users/{uid} en cada fila de una tabla de moderación o del picker.
  authorDisplayName: string
  description: string
  category: string
  previewImageUrl?: string
  vars: CommunityTemplateVars
  // Texto libre v1 (ej. "PaseLink", "CC-BY") — sin catálogo de licencias
  // todavía, ver PLATFORM_EXPANSION_ARCHITECTURE.md-style "fuera de alcance".
  license: string
  version: number
  // Ids informativos de features ya verificadas contra esta plantilla (ej.
  // 'confetti', 'wall') — sin validación automática todavía, ver nota en el
  // formulario de envío.
  compatibility: string[]
  status: CommunityTemplateStatus
  reviewerUid?: string
  reviewNotes?: string
  createdAt: number
  submittedAt?: number
  publishedAt?: number
  updatedAt: number
}

// Copia CONGELADA de CommunityTemplateVars al momento en que el organizador
// eligió una plantilla comunitaria para su evento (ver TemplatePicker) — no
// una referencia viva al doc de communityTemplates. Así, si esa plantilla se
// archiva o cambia de versión después, los eventos que ya la usan siguen
// renderizando exactamente igual (mismo criterio que amountDueMinorUnits en
// PLATFORM_EXPANSION_ARCHITECTURE.md §4.3: congelar en vez de recalcular).
// Separado de ThemeOverrides (que sigue siendo solo ajustes manuales chicos
// del organizador) — ambos se mezclan en el mismo punto donde hoy se pasa
// `overrides` a buildInviteThemeStyle, con themeOverrides ganando por encima.
export interface CommunityTemplateSnapshot {
  id: string
  name: string
  vars: Partial<CommunityTemplateVars>
}

// Regalos (EventInfoPanel/sections/GiftSection.tsx) — shape mínimo a
// propósito: link a un registro externo (Amazon, Liverpool, Mercado Libre...)
// + nota de efectivo/transferencia + mensaje libre. No arma un catálogo de
// regalos propio ni tracking de "quién regaló qué" — eso es un producto
// distinto; hoy resuelve el caso común (organizador comparte 1-2 canales).
export interface GiftInfo {
  message?: string
  registryUrl?: string
  cashInfo?: string
}

export interface MenuOption {
  id: string
  name: string
  description?: string
}

// requiresNote: la opción exige detalle en texto libre al elegirla (ej.
// "Alergia" sin especificar a qué no le sirve al organizador para catering).
export interface DietaryRestriction {
  id: string
  label: string
  requiresNote?: boolean
}

// Selección por PERSONA (invitado o cada acompañante), no por invitación —
// es lo que permite un conteo real por platillo cuando un grupo tiene
// necesidades distintas. Mismo criterio de "id, no label" que
// CustomFieldOption: renombrar una opción de menú no huérfana selecciones
// ya guardadas.
export interface MenuSelection {
  optionId?: string
  restrictionIds?: string[]
  note?: string
}

export interface EventData {
  id: string
  ownerId: string
  name: string
  date: string
  startTime?: string // 'HH:MM', opcional
  endTime?: string   // 'HH:MM', opcional
  location: string
  description?: string
  dressCode?: string
  coverImage?: string
  accentColor?: string
  templateId?: TemplateId
  // Subconjunto de tokens de la plantilla que el organizador pisó a mano
  // (ver ThemeOverrides) — 'accent' duplica accentColor en la práctica; se
  // deja igual por compatibilidad con el mecanismo `overrides` ya existente
  // en buildInviteThemeStyle, que hoy solo recibe accentColor por separado.
  themeOverrides?: ThemeOverrides
  // Presente solo si el organizador eligió una plantilla de la comunidad
  // (ver CommunityTemplateSnapshot) — cuando está presente, templateId queda
  // en 'default' (base estructural neutra, sin ornamentos propios todavía).
  communityTemplateSnapshot?: CommunityTemplateSnapshot | null
  welcomeMessage?: string
  mapsUrl?: string
  entryMode: EntryMode
  capacity: number
  // Convierte `capacity` de sugerencia a límite duro (ver
  // CAPACITY_LIMIT_ARCHITECTURE.md) — ausente/false: comportamiento de
  // siempre, `capacity` es solo informativo y el registro nunca se bloquea
  // (ningún evento existente se ve afectado). true: registerWalkInGuest/
  // addGuest/addGuestsBulk/addGuestsFromRows (y updateGuest al aumentar
  // acompañantes) rechazan la operación en cuanto peopleCount llegaría a
  // superar capacity — chequeado DENTRO de la misma transacción que
  // incrementa peopleCount (ver assertCapacityAvailable en
  // src/firebase/attendeeLimit.ts), así que dos registros simultáneos por el
  // último lugar nunca terminan los dos con éxito. No se agrega un contador
  // nuevo: se reutiliza peopleCount, que ya se mantiene atómicamente en cada
  // alta/baja/edición de invitado.
  attendeeLimitEnabled?: boolean
  // Catálogo de segmentos del evento (ver GuestSegmentTag) — definidos acá,
  // asignados por invitado en GuestData.tags. Ausente = el evento no usa
  // segmentación todavía.
  guestTags?: GuestSegmentTag[]
  // Id de un GuestSegmentTag (de guestTags arriba) que Anfitrión en Vivo
  // destaca como métrica propia (ej. "VIP") — opcional; si no está definido,
  // esa tarjeta simplemente no se muestra. No introduce un concepto de "tier"
  // nuevo, solo reutiliza el catálogo de etiquetas que ya existe.
  vipTagId?: string | null
  // Gating opcional de las secciones YA existentes de más abajo (transport/
  // faq/timeline/welcomeMessage) — no se migran a un modelo de bloques, solo
  // ganan una condición de visibilidad adicional. Clave ausente = visible
  // para cualquier invitado, igual que antes de que existiera este campo.
  sectionVisibility?: Partial<Record<'transport' | 'faq' | 'timeline' | 'welcomeMessage' | 'map' | 'departureReminder', SectionVisibilityRule>>
  // Margen (minutos) que se suma al tiempo de viaje estimado del recordatorio
  // de salida (Feature de innovación) — ausente = 15 min por defecto (ver
  // DEFAULT_BUFFER_MINUTES en useDepartureReminder.ts). El invitado puede
  // además ajustarlo al vuelo en el propio widget (estado local, no se
  // persiste acá).
  departureReminderBufferMinutes?: number
  // Secciones nuevas y libres (After Party, Cena VIP, Hospedaje...) — ver
  // VisibilitySection.
  sections?: VisibilitySection[]
  // Menú y restricciones alimenticias estructuradas — ver MenuOption/
  // DietaryRestriction. Ausente = el evento no ofrece selección de menú (el
  // paso correspondiente no se muestra en el RSVP).
  menu?: { options: MenuOption[]; restrictions: DietaryRestriction[] }
  // Regalos — ver GiftInfo. Ausente = el evento no muestra la fila
  // correspondiente en el Event Information Panel.
  gifts?: GiftInfo
  // Tope de acompañantes que puede sumar UN invitado individual (autoregistro
  // público o alta/edición manual del organizador) — ver GUEST_MAX_COMPANIONS
  // en utils/validation.ts (techo 20) y resolveMaxCompanions en
  // firebase/guests.ts (única fuente de verdad del valor efectivo). Ausente
  // en eventos de antes de este campo: se resuelve a 0 (sin acompañantes),
  // no a "sin límite" — pedido explícito para no dejar overselling
  // silencioso en eventos ya creados. NO aplica a invitados `isGroup: true`
  // ("familia o grupo"), que sigue gobernado por su propio tope
  // GUEST_GROUP_MAX_MEMBERS — es una herramienta de alta masiva distinta, ya
  // confiada al organizador.
  maxCompanions?: number
  customFields?: CustomField[]
  requiresPayment: boolean
  // Métodos de cobro activos cuando requiresPayment es true — puede incluir
  // uno u otro, o ambos a la vez (EventCreate/EditEventForm). Vacío si el
  // evento no cobra entrada. `paymentInstructions` abajo solo aplica a
  // 'transfer' (datos bancarios/alias); 'cash' no necesita instrucciones,
  // se cobra presencialmente y el organizador lo marca a mano.
  paymentMethods: PaymentMethod[]
  ticketPrice: number
  currency: string
  paymentInstructions: string
  // Teléfono del organizador (o de quien gestione los pagos) en formato
  // internacional para el link de WhatsApp (wa.me) que ve el invitado en su
  // pase cuando el evento cobra entrada — enviar comprobante, resolver
  // dudas, pedir devolución o reportar un problema de acceso, todo por el
  // mismo canal. Opcional: si está vacío, ese apartado no se muestra.
  organizerContactPhone?: string
  // País (código ISO alpha-2, ej. "MX", "US") elegido junto al teléfono de
  // arriba — ver toWhatsAppPhone (utils/phone.ts): sin esto, un número sin
  // "+" es ambiguo (10 dígitos locales no distinguen México de EE.UU./Canadá)
  // y cae a México como último recurso.
  organizerContactPhoneCountry?: string
  timeline?: TimelineEntry[]
  // Preguntas frecuentes configurables por el organizador (FaqEditor.tsx),
  // mostradas al invitado como fila del Event Information Panel (ver
  // src/components/EventInfoPanel/sections/FAQSection.tsx). Ausente = sin
  // sección de FAQ.
  faq?: FaqEntry[]
  // Transporte, estacionamiento e indicaciones especiales (TransportEditor.tsx),
  // mostrado al invitado como fila del panel (TransportationSection.tsx).
  // Ausente = sin sección.
  transport?: TransportInfo
  // Recordatorios automáticos de RSVP por email (distinto del panel manual
  // de WhatsApp en ReminderSection.tsx) — enviados por
  // scripts/send-rsvp-reminders.mjs (GitHub Actions cron diario) solo a
  // invitados con rsvpStatus 'pending'. 'YYYY-MM-DD', sin hora: el cierre de
  // RSVP es un día, no un instante.
  rsvpDeadline?: string
  remindersEnabled?: boolean
  reminderRules?: ReminderRule[]
  // Campaña de reconfirmación de asistencia (ver
  // WAITLIST_RECONFIRMATION_ARCHITECTURE.md, Fase 2) — solo la campaña
  // ACTIVA/última, no un historial (una por vez, se reemplaza al relanzar).
  // Ausente = el evento nunca inició una. reminderRules reutiliza el mismo
  // tipo que reminderRules de arriba (mismo componente de UI,
  // ReminderRulesEditor.tsx, mismo motor de envío en functions/).
  reconfirmCampaign?: {
    startedAt: number
    deadline: number
    // Siempre se les pide reconfirmar a invitados confirmados (rsvpStatus
    // 'yes') que todavía no pagaron — sin excepción ni opción para incluir
    // a quien ya pagó (decisión explícita: más simple que el diseño
    // original, que permitía incluirlos).
    excludeTagIds?: string[]
    reminderRules: ReminderRule[]
  }
  plan: Plan
  paymentStatus: PaymentStatus
  status: EventStatus
  // Cantidad de invitaciones/documentos `guests` (1 por invitado o por
  // familia/grupo, sin importar cuántas personas represente cada uno).
  guestCount: number
  // Cantidad total de PERSONAS esperadas: suma de partySize() (1 +
  // companions.length) de cada invitado/familia — a diferencia de
  // guestCount, que cuenta invitaciones, no personas. Existe como contador
  // denormalizado (no derivado en el cliente) para que las vistas que
  // listan varios eventos sin cargar su subcolección `guests` (Dashboard)
  // puedan calcular "% de asistencia" correctamente: dividir
  // checkedInCount (personas) entre guestCount (invitaciones) da porcentajes
  // incorrectos en cuanto un invitado tiene acompañantes o es una familia de
  // varios integrantes.
  peopleCount: number
  // Asistencia acumulada (cuánta gente hizo check-in alguna vez) — nunca se
  // decrementa por una salida individual. Para "cuánta gente hay adentro
  // ahora mismo" usar `occupancyCount`.
  checkedInCount: number
  // Ocupación en vivo: sube con cualquier ingreso (check-in, reingreso o
  // walk-in anónimo) y baja con cualquier salida (temporal, definitiva o
  // walkOut) — es la única fuente de verdad para gatear `capacity` contra
  // cuánta gente hay físicamente adentro. Separado de `checkedInCount` a
  // propósito: ese campo alimenta estadísticas de asistencia acumulada
  // (EventDetail, Reports, la barra de progreso del Scanner) que no deben
  // fluctuar hacia abajo cuando alguien sale y vuelve.
  occupancyCount: number
  // Ledger de walk-ins netos (walkIn - walkOut, nunca negativo, ver
  // src/firebase/capacity.ts). No lo lee ninguna pantalla directamente —
  // existe para que reconcileGuestCounters.ts (Cloud Functions) pueda
  // recomponer checkedInCount/occupancyCount como "derivado de guests/ +
  // este ledger": walkIn/walkOut son la única fuente de esos dos contadores
  // que no crea un documento de invitado, así que no son derivables de
  // guests/ sin este campo aparte.
  walkInNetCount?: number
  // Personas con pago aprobado (partySize(), no invitaciones) — sube SOLO al
  // aprobar (nunca al enviar comprobante), baja si se revierte el pago o se
  // borra un invitado que ya estaba pagado (ver setGuestPaymentStatus/
  // deleteGuest/updateGuest en src/firebase/guests.ts). No aplica a eventos
  // gratuitos (requiresPayment: false) — la UI no debe mostrarlo ahí.
  // Eventos creados antes de este campo caen a 0 (ver mapEvent) — se
  // autocorrige solo vía reconcileGuestCounters/reconcileDirtyGuestCounters
  // (functions/src/reconciliation/reconcileGuestCounters.ts), sin necesidad
  // de correr ningún script a mano.
  paidCount: number
  // Cantidad de check-ins (escaneos QR exitosos, primera entrada o
  // reingreso — no walk-ins, que no pasan por checkInGuest) agrupados por
  // hora del día ("20:00" = 20:00-20:59), mantenido con increment() en la
  // misma transacción que escribe checkedInCount/occupancyCount (ver
  // checkInGuest en src/firebase/guests.ts). Reemplaza el
  // cálculo que antes recorría TODA la subcolección `checkins` en el
  // cliente cada vez que se abría Reports (ver auditoría de escalabilidad,
  // hallazgo F4) — "Llegadas por hora" ahora lee este campo directo, O(1).
  // Eventos con check-ins de antes de este campo no lo tienen poblado
  // retroactivamente — correr scripts/backfill-checkins-by-hour.mjs una vez
  // si hace falta reflejar check-ins ya escaneados antes de este cambio
  // (mismo criterio que paidCount arriba).
  checkinsByHour?: Record<string, number>
  // Cantidad de invitaciones/documentos `guests` (no personas — mismo
  // criterio que guestCount, no peopleCount) por cada valor de rsvpStatus.
  // Mantenidos con increment() en addGuest/addGuestsBulk/addGuestsFromRows
  // (siempre suman a rsvpPendingCount, ver functions/src/capacity/createGuests.ts),
  // registerWalkInGuest (siempre a rsvpYesCount), setGuestRsvp/
  // resetGuestRsvp (mueven de un balde a otro) y deleteGuest/
  // bulkDeleteGuests (restan del balde que tenía el invitado borrado) — ver
  // auditoría de escalabilidad, hallazgo F22. Reemplazan el cálculo que
  // antes recorría TODO el array `guests` en Reports.tsx en cada render.
  // Eventos con invitados de antes de este campo no lo tienen poblado
  // retroactivamente — se autocorrige solo, mismo mecanismo que paidCount
  // arriba (checkinsByHour es la excepción: ese sí sigue necesitando un
  // backfill manual, no entra en la reconciliación de guests/).
  rsvpYesCount?: number
  rsvpNoCount?: number
  rsvpPendingCount?: number
  coOrganizersMap?: Record<string, string>  // { [uid]: email }
  // Permisos granulares por co-organizador (ver src/types/coOrganizerPermissions.ts).
  // Opcional y aditivo: un co-organizador sin entrada acá (evento/co-org de
  // antes de este campo) cae a LEGACY_COORG_DEFAULTS vía resolveEventPermissions,
  // nunca requiere backfill.
  coOrganizerPermissions?: Record<string, CoOrganizerPermissions>
  // Venta de alimentos/bebidas/souvenirs durante el evento (ver
  // src/types/concessions.ts y FOOD_BEVERAGE_ORDERING_ARCHITECTURE.md).
  // Ausente = el evento nunca activó el módulo. Mientras dure la beta, solo
  // un admin de PaseLink puede poner `concessions.enabled` en `true` (ver
  // firestore.rules) — el resto del campo (catálogo, staff, config de pago)
  // ya lo administra el organizador normalmente una vez habilitado.
  concessions?: ConcessionsConfig
  createdAt: number
  updatedAt: number
}

export type WallMessageType = 'comment' | 'question' | 'music' | 'idea'

// Set cerrado por ahora (agregar una reacción nueva = un entry acá + en
// REACTIONS en ReactionPicker.tsx, nada más — el resto del sistema
// (contadores, "más usadas", picker) ya itera sobre lo que exista en
// `reactions` sin asumir cuáles tipos hay).
export type ReactionType = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry'

// Forma de un documento en la subcolección .../reactions/{token} — auditoría
// F2/F11: reemplazó al mapa `reactions` embebido en WallMessage/PhotoData
// (podía superar el límite de 1MB/documento con contenido viral), un doc por
// reactor en vez de una entrada de mapa. photoURL/reactedAt opcionales:
// reacciones migradas desde el mapa viejo por el backfill pueden no
// tenerlos si el mapa original tampoco los tenía (datos de antes de que esos
// campos existieran) — ReactionListSheet cae a un fallback.
export interface WallReaction {
  type: ReactionType
  // Denormalizado (igual que authorName en el mensaje) para poder mostrar
  // "quién reaccionó" sin una consulta extra por reacción.
  name: string
  photoURL?: string
  reactedAt?: number
}

export interface WallMessage {
  id: string
  text: string
  type: WallMessageType
  authorName: string
  authorToken: string
  authorRole: 'owner' | 'guest'
  authorPhotoURL?: string
  createdAt: number
  // Denormalizados, mantenidos con increment() en la transacción de
  // reactToContent (ver interactions.ts) — la fuente de verdad de cada
  // reacción individual es la subcolección .../reactions/{token} (ver
  // WallReaction), no un campo de este documento. `mapMessage` completa
  // `0`/`{}` para docs de antes de esta migración que todavía no corrieron
  // el backfill.
  reactionCount: number
  reactionCountsByType: Partial<Record<ReactionType, number>>
  replies: WallReply[]
  deleted: boolean
  pinned: boolean
}

export interface WallReply {
  id: string
  text: string
  authorName: string
  authorToken: string
  authorRole: 'owner' | 'guest'
  authorPhotoURL?: string
  createdAt: number
}

type GuestStatus = 'invited' | 'checked_in'

// Solo tiene sentido mientras `checkedOutAt` está seteado (invitado
// actualmente afuera): 'temporary' = puede volver a escanear su QR para
// reingresar, 'final' = checkInGuest bloquea el reingreso (ver
// firebase/guests.ts) salvo que el organizador lo revierta con
// allowGuestReentry. Se limpia a `null` en cada nuevo check-in/reingreso.
type GuestExitType = 'temporary' | 'final' | null

export type RsvpStatus = 'pending' | 'yes' | 'no'

export interface CompanionData {
  name?: string
  lastName?: string
  phone?: string
  // País del teléfono de arriba — ver el mismo campo en GuestData.
  phoneCountry?: string
  // Selección de menú propia del acompañante — un grupo puede tener
  // necesidades de catering distintas por persona (ver MenuSelection).
  menuSelection?: MenuSelection
  // Respuestas a los EventData.customFields marcados `required: true` —
  // solo se piden/guardan para acompañantes agregados vía autoregistro
  // (EventJoin.tsx), donde la invitación exige que cada acompañante nuevo
  // complete lo mismo que el invitado principal. Ausente en acompañantes
  // cargados por el organizador (GuestAddForm), que nunca piden esto.
  customData?: Record<string, string>
}

export interface GuestData {
  id: string
  name: string
  lastName?: string
  phone?: string
  // Al igual que `phone`, vive en `guestContacts/{guestId}` (no en el
  // documento público del invitado) y se fusiona en subscribeToGuests —
  // presente solo para autoregistro e invitados importados por CSV, que son
  // los únicos flujos que hoy capturan email (ver functions/src/capacity/
  // createGuests.ts y registerWalkInGuest.ts).
  email?: string
  // País (código ISO alpha-2, ej. "MX", "US") elegido junto al teléfono al
  // cargarlo — igual que `phone`, vive en `guestContacts/{guestId}`. Sin
  // esto, toWhatsAppPhone (utils/phone.ts) no puede distinguir un número
  // local sin "+" de otro país (ej. un celular de EE.UU. de 10 dígitos es
  // indistinguible de uno mexicano) y cae a México como último recurso.
  // Ausente en invitados cargados antes de este campo.
  phoneCountry?: string
  // Consentimiento para enviar WhatsApp automático (Meta Cloud API, ver
  // functions/src/lib/waChannel.ts) sobre este evento — transaccional
  // únicamente (oferta de lista de espera, reconfirmación), nunca marketing.
  // `true` solo cuando el propio invitado tecleó su teléfono (autoregistro
  // vía registerWalkInGuest, auto-edición vía updateGuestSelf, o promovido
  // desde una entrada de waitlist que él mismo creó) — vive en
  // `guestContacts/{guestId}`, igual que `phone`. Ausente/false en alta
  // manual del organizador o importación CSV: el organizador conoce el
  // teléfono, pero eso no es consentimiento del invitado para recibir
  // mensajes automáticos.
  whatsappConsent?: boolean
  qrToken: string
  status: GuestStatus
  companions: CompanionData[]
  // Invitado creado como "familia o grupo" (nombre de grupo + cantidad de
  // integrantes) en vez de invitado individual. Solo cambia CÓMO se muestra
  // el nombre/cantidad en la UI (ver GuestAddForm/GuestList/GuestPass) — el
  // conteo real de personas sigue siendo partySize() (1 + companions.length),
  // el check-in/QR/estadísticas no distinguen este campo. Ausente/false en
  // invitados creados antes de este campo (siempre invitados individuales).
  isGroup?: boolean
  // Origen del alta: 'organizer' = lo cargó el organizador/coanfitrión a mano
  // (GuestAddForm, alta masiva, CSV) — sin tope de acompañantes propio,
  // gobierna únicamente EventData.capacity. 'self' = el propio invitado se
  // autoregistró (registerWalkInGuest) o llegó promovido desde una entrada
  // de waitlist que él mismo creó (ver WaitlistEntryData.registrationSource)
  // — sujeto al tope EventData.maxCompanions también en ediciones
  // posteriores del organizador (ver companionsWithinLimitData en
  // firestore.rules y updateGuest en src/firebase/guests.ts). Ausente en
  // invitados creados antes de este campo: se trata como 'organizer' (el
  // valor permisivo) para no bloquear retroactivamente ninguna edición ya
  // válida — nunca se migra en bloque, ver política de "no romper invitados
  // existentes".
  registrationSource?: 'organizer' | 'self'
  rsvpStatus: RsvpStatus
  checkedInAt: number | null
  checkedInBy: string | null
  checkedInByEmail: string | null
  checkedOutAt: number | null
  checkedOutByEmail: string | null
  exitType: GuestExitType
  // Check-in parcial (familias/acompañantes): índices de esta invitación
  // (0 = invitado principal, 1..N = companions[i-1]) que YA hicieron
  // check-in alguna vez — ver checkInGuest/planCheckIn en
  // functions/src/checkin/shared.ts, única fuente de verdad (Cloud
  // Functions, Admin SDK). Nunca lo escribe el cliente: accessControlFieldsUntouched
  // en firestore.rules lo protege igual que status/checkedInAt. Siempre
  // presente en la respuesta de las Callables de check-in (mapGuestForResponse
  // ya resuelve el fallback de invitados 'checked_in' de antes de este campo,
  // tratándolos como "toda la invitación ya entró completa") — puede faltar
  // en el snapshot crudo de Firestore que usa subscribeToGuests si el
  // invitado nunca pasó por ahí, ver presentIndicesOf en src/firebase/guests.ts
  // para el mismo fallback del lado del cliente.
  presentIndices?: number[]
  // `lockToken` es un espejo legacy (último dispositivo reconocido) que se
  // mantiene por compatibilidad con el pill "Pase abierto" y el botón
  // "Desbloquear pase" del organizador (GuestDetailSheet). La fuente real
  // de verdad para autorizar escrituras del invitado (RSVP, comprobante de
  // pago, auto-edición) es `lockTokens`: una lista acotada de dispositivos
  // reconocidos para este pase (últimos N, con expulsión del más viejo al
  // llegar al tope — ver claimGuestPass en src/firebase/guests.ts). Permite
  // que el mismo invitado abra el link desde el navegador interno de
  // Instagram/TikTok/WhatsApp/etc. y después desde Safari/Chrome sin quedar
  // bloqueado. Ausente/vacío en invitados nunca abiertos o creados antes de
  // este campo.
  lockToken: string | null
  lockTokens?: string[]
  customData?: Record<string, string>
  // Ids de EventData.guestTags asignados a este invitado (segmentación) —
  // solo lo escribe el organizador (bulkSetGuestTags), nunca el propio
  // invitado. Ausente = sin segmento asignado.
  tags?: string[]
  // Mesa asignada (id de SeatingTableData) — null/ausente = sin asignar
  // todavía. Solo lo escribe el organizador/coanfitrión con manageSeating,
  // nunca el propio invitado (mismo criterio que `tags`).
  tableId?: string | null
  // Selección de menú propia del invitado (no de sus acompañantes, ver
  // CompanionData.menuSelection) — se completa junto con la confirmación de
  // RSVP cuando EventData.menu existe.
  menuSelection?: MenuSelection
  paymentStatus: GuestPaymentStatus
  // Método elegido al autoregistrarse (o fijado por el organizador al
  // marcar el pago) — null en eventos gratuitos y en invitados agregados
  // por el organizador que todavía no pagaron. Ver PaymentMethod.
  paymentMethod: PaymentMethod | null
  // Referencia opcional que deja el invitado al marcar "ya pagué" (número de
  // operación, hora del depósito, etc.) — le ahorra al organizador tener que
  // ir a buscarlo por WhatsApp para revisar el comprobante.
  paymentNote?: string
  // Auditoría de la confirmación de pago (Cloud Function setGuestPaymentStatus/
  // bulkSetGuestPaymentStatus, ver functions/src/payments/confirmPayment.ts):
  // se escriben SOLO en la transición real `!paid -> paid` (nunca se pisan al
  // corregir el método sobre un invitado ya pagado) y se limpian a `null` al
  // revertir a `unpaid`. Ausentes en cualquier documento creado antes de este
  // campo. paidBy es el uid del organizador que confirmó (fuente manual) o el
  // nombre de la pasarela de pago (fuente automática futura, ej. 'stripe').
  paidAt?: number | null
  paidBy?: string | null
  // Presentes solo cuando el invitado se autoregistró logueado con una
  // cuenta PaseLink (ver registerWalkInGuest en src/firebase/capacity.ts) —
  // null en alta manual del organizador y en todo invitado creado antes de
  // este campo. guestPhotoURL es una copia (denormalizada al momento del
  // registro, no sincronizada después) del photoURL del perfil en ese
  // instante — ver GuestAvatar.tsx para el porqué de no leerlo en vivo.
  guestUid?: string | null
  guestPhotoURL?: string | null
  createdAt: number
  // Reconfirmación de asistencia (ver WAITLIST_RECONFIRMATION_ARCHITECTURE.md,
  // Fase 2). Ausente = nunca fue parte de ninguna campaña. 'requested' lo
  // escribe la Callable que arranca la campaña o "dar más tiempo" del
  // organizador; 'confirmed' solo lo puede escribir el propio invitado
  // (autoservicio por lockToken); 'expired' solo el barrido diario
  // (Admin SDK) cuando vence reconfirmDeadline sin respuesta — nunca se
  // libera el lugar automáticamente al llegar acá, es un estado "en
  // riesgo" que el organizador resuelve a mano (liberar o dar más tiempo).
  reconfirmStatus?: 'requested' | 'confirmed' | 'expired'
  reconfirmDeadline?: number | null
  // Control de concurrencia optimista: se incrementa en +1 en cada escritura
  // que lo chequea (updateGuest/updateGuestSelf, ver src/firebase/guests.ts).
  // Ausente/0 en invitados creados antes de este campo. NO todas las
  // escrituras lo incrementan (ver el comentario de nextGuestVersion en
  // firebase/guests.ts) — es una protección dirigida a la edición de
  // formulario (organizador/auto-edición), no un contador universal de
  // cualquier cambio del documento.
  version?: number
  updatedAt?: number | null
}

// Entrada en la lista de espera de un evento con cupo lleno (ver
// WAITLIST_RECONFIRMATION_ARCHITECTURE.md) — vive en
// events/{eventId}/waitlist/{entryId}, separada de `guests`: todo documento
// en `guests` tiene un lugar confirmado, invariante que mantiene simple el
// conteo de peopleCount (nunca hay que filtrar entradas de waitlist).
export type WaitlistEntryStatus = 'waiting' | 'offered' | 'promoted' | 'declined' | 'expired' | 'removed'

export interface WaitlistEntryData {
  id: string
  name: string
  partySize: number
  phone?: string
  phoneCountry?: string
  email?: string
  // Mismo criterio que GuestData.whatsappConsent — siempre `true` acá
  // porque unirse a la lista de espera es, por definición, una acción que
  // el propio invitado hace tecleando sus datos (no existe alta manual del
  // organizador para `waitlist`, ver joinWaitlist en src/firebase/waitlist.ts).
  // Se propaga tal cual a `guestContacts` si esta entrada se promueve a
  // invitado (ver functions/src/waitlist/promoteToGuest.ts).
  whatsappConsent?: boolean
  // Respuestas a los campos personalizados del evento (EventData.customFields)
  // — el formulario de lista de espera pide exactamente los mismos campos
  // que el registro normal (EventJoin.tsx), incluidos los obligatorios. Se
  // copia tal cual al crear el guest doc al confirmar la oferta (ver
  // functions/src/callable/confirmWaitlistOffer.ts).
  customData?: Record<string, string>
  // Larga vida (dura toda la espera) — solo habilita LEER el estado de esta
  // entrada. Separado de offerToken a propósito: un link reenviado o
  // cacheado semanas después de anotarse no debe poder reclamar un lugar
  // real, solo consultar posición/estado. Mismo principio que llevó a
  // separar lockToken en lockTokens[] en guests.
  waitlistToken: string
  status: WaitlistEntryStatus
  // 0 por defecto. "Mover al frente de la fila" = escribir un valor mayor al
  // máximo actual entre las 'waiting' — una sola escritura, sin reordenar el
  // resto de la fila (importa a partir de cientos/miles de entradas). Orden
  // real: status=='waiting' ORDER BY priorityBoost DESC, createdAt ASC.
  priorityBoost: number
  createdAt: number
  // Corta vida — generado por Cloud Functions solo al pasar a 'offered',
  // exigido para confirmar/declinar esa oferta puntual. Vencida o resuelta
  // la oferta, deja de servir para siempre (a diferencia de waitlistToken).
  offerToken: string | null
  offerExpiresAt: number | null
  // Cuándo se resolvió la oferta activa (confirmó/declinó/venció) — gratis
  // de capturar, útil para métricas futuras (tiempo de respuesta) sin
  // necesitar una colección de auditoría aparte.
  respondedAt: number | null
  promotedGuestId: string | null
  // 'fifo' = la cascada automática le tocaba por orden; 'manual' = el
  // organizador la asignó saltando el orden. Responde, sin tener que
  // reconstruirlo a partir de timestamps, la pregunta de soporte "¿por qué a
  // esta persona sí y a la que se anotó antes no?".
  promotionReason: 'fifo' | 'manual' | null
  // Mismo significado que GuestData.registrationSource — se propaga tal cual
  // al guest doc si esta entrada se promueve (ver functions/src/waitlist/
  // promoteToGuest.ts). 'self' en joinWaitlist (anotarse es siempre
  // autoservicio). En moveGuestToWaitlist (el organizador manda a un
  // invitado existente a la espera) se copia el registrationSource que ya
  // tenía ese invitado, para no perder su origen al ir y volver. Ausente en
  // entradas creadas antes de este campo: se trata como 'organizer', mismo
  // criterio permisivo que GuestData.registrationSource.
  registrationSource?: 'organizer' | 'self'
}

// 'entry_blocked': intento de ingreso rechazado por checkInGuest (hoy solo el
// caso de reingreso bloqueado tras una salida definitiva — ver `reason`).
// payment_required NO genera esta entrada: no es un rechazo, es un estado que
// el propio escáner resuelve en el momento (ver handleConfirmPayment en
// src/pages/Scanner.tsx: confirma el pago vía setGuestPaymentStatus y luego
// hace el check-in normal).
type CheckinType = 'check_in' | 'check_out' | 'entry_blocked'

export interface CheckinLog {
  id: string
  guestId: string
  guestName: string
  type: CheckinType
  // Solo presente en entradas type: 'check_out' — distingue salida temporal
  // (puede volver) de definitiva (no puede reingresar sin excepción).
  exitKind?: 'temporary' | 'final'
  // Solo presente en entradas type: 'check_in' que corresponden a un
  // reingreso tras una salida temporal (no al primer check-in).
  reentry?: boolean
  // Solo presente en entradas type: 'entry_blocked'.
  reason?: 'final_exit_blocked'
  // Solo presentes en entradas type: 'check_in' que registraron un check-in
  // parcial (familia/acompañantes donde no entró todo el mundo junto) — ver
  // planCheckIn en functions/src/checkin/shared.ts. `addedCount` es cuántas
  // personas sumó ESTE escaneo puntual (no el total de la invitación).
  addedCount?: number
  partial?: boolean
  timestamp: number
  scannedBy: string
  scannedByEmail: string | null
}

export const RSVP_LABELS: Record<RsvpStatus, string> = {
  pending: 'Sin responder',
  yes: 'Asistirá',
  no: 'No asistirá',
}

export const PAYMENT_STATUS_LABELS: Record<GuestPaymentStatus, string> = {
  paid: 'Pagado',
  pending_confirmation: 'En revisión',
  unpaid: 'Sin pagar',
  expired: 'Vencido',
}

export interface UserProfile {
  uid: string
  email: string
  firstName: string
  lastName: string
  displayName: string      // firstName + ' ' + lastName
  birthDate: string        // 'YYYY-MM-DD'
  photoURL?: string
  // Tokens FCM de los dispositivos donde este usuario activó push
  // notifications (Feature 5) — más de uno posible (celular + notebook).
  // Escrito directo por src/firebase/messaging.ts (arrayUnion/arrayRemove),
  // no pasa por updateUserProfile. Ausente = nunca activó push.
  fcmTokens?: string[]
  createdAt: number
}

export interface UserInvitation {
  eventId: string
  eventName: string
  eventDate: string
  eventLocation: string
  eventCoverImage?: string
  // Plantilla del evento al momento del registro — alimenta el theming del
  // ticket en MyInvitations.tsx (ver src/templates/ticketTheme.ts).
  // Opcionales: invitaciones guardadas antes de este campo caen al ticket
  // "default" (look actual de PaseLink), sin backfill necesario.
  eventTemplateId?: TemplateId
  eventAccentColor?: string
  guestName: string
  qrToken: string
  type: 'walkin' | 'invited'
  registeredAt: number
}

export type FeedbackCategory = 'suggestion' | 'bug' | 'comment' | 'question' | 'inappropriate' | 'feature_request' | 'other'

export type FeedbackStatus = 'new' | 'in_review' | 'planned' | 'resolved' | 'closed'

export type FeedbackPriority = 'low' | 'normal' | 'high' | 'urgent'

// Buzón de feedback: solo el administrador puede leer estos documentos (ver
// firestore.rules) — ni siquiera el propio autor puede releer lo que envió.
// userId/userEmail son mutuamente excluyentes: userId cuando hay sesión,
// userEmail cuando el envío es anónimo (ver src/firebase/feedback.ts).
export interface Feedback {
  id: string
  userId: string | null
  userEmail: string | null
  userDisplayName: string | null
  subject: string
  message: string
  category: FeedbackCategory
  status: FeedbackStatus
  priority: FeedbackPriority
  tags: string[]
  adminNotes: string
  favorite: boolean
  read: boolean
  createdAt: number
  updatedAt: number
}

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  suggestion: 'Sugerencia',
  bug: 'Reportar un error',
  comment: 'Comentario',
  question: 'Duda',
  inappropriate: 'Comportamiento inapropiado',
  feature_request: 'Solicitud de nueva función',
  other: 'Otro',
}

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'Nuevo',
  in_review: 'En revisión',
  planned: 'Planeado',
  resolved: 'Resuelto',
  closed: 'Cerrado',
}

export const FEEDBACK_PRIORITY_LABELS: Record<FeedbackPriority, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
}

// Moderación del muro (src/firebase/moderation.ts, src/firebase/sanctions.ts).
// Un reporte apunta a un comentario o foto puntual; el "contenido" se guarda
// como snapshot (contentSnapshot/contentCaption) porque el original puede
// borrarse después (por el organizador o por el propio admin) y el caso debe
// seguir siendo revisable igual.
export type ReportedContentType = 'comment' | 'photo'

export type ReportStatus = 'pending' | 'in_review' | 'resolved' | 'rejected'

type ReportActionType =
  | 'status_change'
  | 'note'
  | 'content_deleted'
  | 'sanction_applied'
  | 'sanction_revoked'

export interface ReportActionEntry {
  id: string
  type: ReportActionType
  adminUid: string
  adminEmail: string | null
  detail: string
  createdAt: number
}

// reporterUid/reporterName/reporterEmail siempre se guardan (se necesitan
// para el cooldown y para evitar reportes duplicados) — `anonymous` solo
// controla si el panel de admin los muestra u oculta, no si existen en el
// documento (que de todas formas solo puede leer un admin, ver firestore.rules).
export interface ContentReport {
  id: string
  eventId: string
  eventName: string
  contentType: ReportedContentType
  contentId: string
  contentSnapshot: string
  contentCaption?: string
  contentAuthorName: string
  contentAuthorToken: string
  contentAuthorUid: string | null
  reporterUid: string
  reporterName: string
  reporterEmail: string | null
  anonymous: boolean
  reason: string
  status: ReportStatus
  adminNotes: string
  actionHistory: ReportActionEntry[]
  createdAt: number
  updatedAt: number
}

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: 'Pendiente',
  in_review: 'En revisión',
  resolved: 'Resuelto',
  rejected: 'Rechazado',
}

export const REPORT_CONTENT_TYPE_LABELS: Record<ReportedContentType, string> = {
  comment: 'Comentario',
  photo: 'Fotografía',
}

// Sanciones aplicables a una cuenta desde un reporte (src/firebase/sanctions.ts).
// Diseñado para poder agregar tipos nuevos sin tocar el resto del sistema —
// cada tipo solo determina QUÉ campo de UserSanctionScope toca applySanction.
export type SanctionType = 'warning' | 'ban' | 'suspension' | 'comment_restriction' | 'photo_restriction'

export type SanctionScope = 'global' | 'event'

export const SANCTION_TYPE_LABELS: Record<SanctionType, string> = {
  warning: 'Advertencia',
  ban: 'Baneo permanente',
  suspension: 'Suspensión temporal',
  comment_restriction: 'Restricción de comentarios',
  photo_restriction: 'Restricción de fotos',
}

// bannedUntil/commentBanUntil/photoBanUntil: 0 = sin restricción activa,
// timestamp (ms) en el futuro = restricción activa hasta esa fecha,
// Number.MAX_SAFE_INTEGER = permanente (ver PERMANENT_SANCTION_MS en sanctions.ts).
export interface UserSanctionScopeState {
  bannedUntil: number
  commentBanUntil: number
  photoBanUntil: number
  reason: string
}

export interface UserSanctionSummary {
  uid: string
  warningsCount: number
  global: UserSanctionScopeState
  events: Record<string, UserSanctionScopeState>
  updatedAt: number
}

export interface SanctionHistoryEntry {
  id: string
  type: SanctionType | 'revoked'
  scope: SanctionScope
  eventId: string | null
  eventName: string | null
  reason: string
  durationMs: number | null // null = permanente
  expiresAt: number | null
  adminUid: string
  adminEmail: string | null
  reportId: string | null
  createdAt: number
}

