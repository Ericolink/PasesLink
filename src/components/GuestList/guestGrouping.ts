import type { EntryMode, GuestData } from '../../types'
import { partySize, guestPresence } from '../../firebase/guests'
import { PAYMENT_METHOD_LABELS } from '../../utils/paymentMethods'

export function guestDisplayName(guest: Pick<GuestData, 'name' | 'lastName' | 'isGroup'>): string {
  return guest.isGroup ? guest.name : `${guest.name} ${guest.lastName || ''}`.trim()
}

// Sección donde cae la fila. Deliberadamente más angosta que "todo lo que
// falta cobrar": un `unpaid` sin límite de tiempo (transferencia sin
// confirmar, o efectivo a cobrar al ingresar) no requiere que el organizador
// haga nada TODAVÍA — se resuelve solo cuando el invitado paga o envía su
// comprobante. Lo urgente de verdad es un comprobante esperando aprobación.
//
// `lockToken`/`lockTokens` NO cuentan acá a propósito: se setean la primera
// vez que el invitado abre su pase (caso normal, esperado, de casi todo
// invitado que asiste) — no indica ningún conflicto por sí solo, y no hay
// ninguna UI que lo muestre (ver claimGuestPass en firebase/guests.ts para
// el mecanismo de reconocimiento de dispositivos en sí, que sigue activo
// como autorización silenciosa aunque no tenga aviso ni acción manual).
//
// `confirmed_unpaid` es un nivel intermedio entre "atención" y "confirmado":
// un invitado que ya respondió que sí pero todavía debe (transferencia sin
// confirmar, o efectivo a cobrar en la puerta) no requiere ninguna decisión
// del organizador todavía, así que no es `attention` — pero mezclarlo dentro
// de "Confirmados" obligaba a escanear fila por fila para ver quién falta
// cobrar en eventos grandes. Separarlo en su propia sección resuelve eso sin
// agregar ningún filtro nuevo: es puramente el mismo agrupado por defecto,
// una fila puede pasar de acá a `confirmed` sola cuando se aprueba su pago.
export type GuestUrgency = 'attention' | 'confirmed_unpaid' | 'confirmed' | 'unanswered' | 'declined'

function needsAttention(guest: GuestData, requiresPayment: boolean): boolean {
  if (!requiresPayment) return false
  return guest.paymentStatus === 'pending_confirmation'
}

function guestUrgency(guest: GuestData, requiresPayment: boolean): GuestUrgency {
  if (needsAttention(guest, requiresPayment)) return 'attention'
  if (guest.rsvpStatus === 'no' || guestPresence(guest) === 'final_out') return 'declined'
  if (guest.rsvpStatus === 'pending') return 'unanswered'
  if (requiresPayment && guest.paymentStatus !== 'paid') return 'confirmed_unpaid'
  return 'confirmed'
}

// En eventos sin cobro `confirmed_unpaid` nunca se produce (ver
// `guestUrgency`), así que esa sección queda vacía y no se renderiza
// (`GuestSection` no pinta secciones con 0 invitados) — cero cambio visual
// para eventos gratis.
export const SECTION_ORDER: { key: GuestUrgency; title: string; collapsedByDefault: boolean }[] = [
  { key: 'attention', title: 'Necesita tu atención', collapsedByDefault: false },
  { key: 'confirmed_unpaid', title: 'Pendientes de pago', collapsedByDefault: false },
  { key: 'confirmed', title: 'Confirmados', collapsedByDefault: false },
  { key: 'unanswered', title: 'Sin responder', collapsedByDefault: false },
  { key: 'declined', title: 'No asistirán', collapsedByDefault: true },
]

// "Confirmados" es ambiguo en eventos de pago: todo lo que cae en esa
// sección ya tiene paymentStatus 'paid' (ver guestUrgency), así que el
// nombre genérico se leía como si fuera sobre asistencia — no sobre pago.
// En eventos gratis no hay pago que confirmar, así que el título original
// (asistencia) sigue siendo el correcto y no cambia. Separado de
// SECTION_ORDER porque el título de esta única sección depende de
// `requiresPayment`, algo que SECTION_ORDER no conoce.
export function sectionTitle(key: GuestUrgency, requiresPayment: boolean): string {
  if (key === 'confirmed' && requiresPayment) return 'Pagos confirmados'
  return SECTION_ORDER.find((s) => s.key === key)!.title
}

export function groupGuestsByUrgency(guests: GuestData[], requiresPayment: boolean): Record<GuestUrgency, GuestData[]> {
  const groups: Record<GuestUrgency, GuestData[]> = { attention: [], confirmed_unpaid: [], confirmed: [], unanswered: [], declined: [] }
  for (const guest of guests) groups[guestUrgency(guest, requiresPayment)].push(guest)
  return groups
}

export interface SummaryBadge {
  label: string
  count: number
  accent: 'success' | 'warning' | 'gray'
  sub?: string
}

// Fila de resumen (MetricTile, ver GuestList.tsx) arriba de las listas — no
// repite groups[key] tal cual (esas ya no muestran su propio conteo, ver
// `hideCount` en ListSection), sino que cambia qué pregunta responde según
// cómo llegan los invitados: en "lista" (entryMode) el organizador arma la
// lista a mano y lo que importa es si cada quien confirmó asistencia; en
// "auto-registro"/"ingreso libre" cualquiera se suma solo, así que lo que
// importa es si ya pagó (o, en evento gratis, simplemente cuántos hay).
// Reutiliza `groups` tal cual lo devuelve `groupGuestsByUrgency` — ningún
// conteo nuevo, solo otra forma de sumarlos.
export function guestSummaryBadges(
  groups: Record<GuestUrgency, GuestData[]>,
  totalGuests: number,
  entryMode: EntryMode,
  requiresPayment: boolean,
  waitlistCount: number,
): SummaryBadge[] {
  if (entryMode === 'list') {
    // "Confirmado" acá es asistencia (rsvpStatus 'yes'), sin importar el
    // pago — attention/confirmed_unpaid/confirmed son las tres formas de
    // llegar a rsvp 'yes' (ver guestUrgency), unanswered/declined las dos
    // de no llegar.
    const confirmed = groups.attention.length + groups.confirmed_unpaid.length + groups.confirmed.length
    return [
      { label: 'Registrados', count: totalGuests, accent: 'gray' },
      {
        label: 'Confirmados',
        count: confirmed,
        accent: 'success',
        sub: confirmed === 0 ? 'Todavía no hay invitados confirmados.' : undefined,
      },
      { label: 'No confirmados', count: totalGuests - confirmed, accent: 'gray' },
    ]
  }

  if (requiresPayment) {
    const unpaid = groups.attention.length + groups.confirmed_unpaid.length
    const badges: SummaryBadge[] = [
      { label: 'Pendientes de pago', count: unpaid, accent: 'warning', sub: unpaid === 0 ? 'No hay pagos pendientes.' : undefined },
      {
        label: 'Pagos confirmados',
        count: groups.confirmed.length,
        accent: 'success',
        sub: groups.confirmed.length === 0 ? 'Todavía no hay pagos confirmados.' : undefined,
      },
    ]
    if (waitlistCount > 0) badges.push({ label: 'Lista de espera', count: waitlistCount, accent: 'warning' })
    return badges
  }

  const badges: SummaryBadge[] = [{ label: 'Registrados', count: totalGuests, accent: 'gray' }]
  if (waitlistCount > 0) badges.push({ label: 'Lista de espera', count: waitlistCount, accent: 'warning' })
  return badges
}

// Color del indicador de la fila. Comparte `needsAttention` como única fuente
// de "esto requiere tu acción ahora" con `guestUrgency` (arriba), pero no es
// un mapeo 1 a 1 con la sección: un invitado en la sección "Confirmados" que
// todavía debe (transferencia dentro de plazo, o efectivo a pagar al
// ingresar) se marca 'wait' en vez de 'ok' — no está "al día" solo porque no
// necesita intervención tuya todavía.
export type GuestIndicator = 'action' | 'ok' | 'wait' | 'off'

// Clases del punto de indicador — en su propio archivo de solo-valores (no
// un archivo de componentes) para no romper Fast Refresh. GuestRow.tsx y
// WaitlistEntryRow.tsx comparten este mismo mapeo de colores.
export const INDICATOR_CLASS: Record<string, string> = {
  action: 'bg-amber-500',
  ok: 'bg-green-500',
  off: 'bg-gray-300 dark:bg-gray-700',
  wait: 'border-[1.5px] border-violet-400 dark:border-violet-500 bg-transparent',
}

export function guestIndicator(guest: GuestData, requiresPayment: boolean): GuestIndicator {
  if (needsAttention(guest, requiresPayment)) return 'action'
  if (guest.rsvpStatus === 'no' || guestPresence(guest) === 'final_out') return 'off'
  if (guest.rsvpStatus === 'pending') return 'wait'
  if (requiresPayment && guest.paymentStatus !== 'paid') return 'wait'
  return 'ok'
}

function money(currency: string, amount: number): string {
  return `${currency}${amount.toLocaleString('es')}`
}

// Un único dato dinámico por fila — el más urgente para ESE invitado en este
// momento, nunca la ficha completa (esa vive en GuestDetailSheet). El orden
// de prioridad replica el que hoy arma el stack de badges en la card vieja.
export function getGuestSubtitle(
  guest: GuestData,
  ctx: { requiresPayment: boolean; ticketPrice: number; currency: string },
): string {
  const amount = ctx.ticketPrice * partySize(guest)

  if (guest.paymentStatus === 'pending_confirmation') {
    return guest.paymentNote ? `Comprobante enviado · ref. ${guest.paymentNote}` : 'Comprobante enviado · a revisar'
  }

  if (ctx.requiresPayment && guest.paymentStatus !== 'paid') {
    const methodSuffix = guest.paymentMethod ? ` · ${PAYMENT_METHOD_LABELS[guest.paymentMethod].toLowerCase()}` : ''
    return `${money(ctx.currency, amount)} pendiente${methodSuffix}`
  }

  const presence = guestPresence(guest)
  if (presence === 'inside') return 'Adentro'
  if (presence === 'temp_out') return 'Salida temporal'
  if (presence === 'final_out') return 'Salió del evento'

  if (guest.rsvpStatus === 'no') return 'No asistirá'

  if (guest.rsvpStatus === 'pending') {
    const size = partySize(guest)
    if (guest.isGroup) return `${size} integrante${size > 1 ? 's' : ''} · sin responder`
    return size > 1 ? `${size - 1} acompañante${size - 1 > 1 ? 's' : ''} · sin responder` : 'Sin responder'
  }

  if (guest.isGroup) return `${partySize(guest)} integrantes`

  const companionsText = guest.companions.length > 0 ? `${guest.companions.length} acompañante${guest.companions.length > 1 ? 's' : ''} · ` : ''
  if (ctx.requiresPayment && guest.paymentStatus === 'paid') {
    return `${companionsText}Pagó${guest.paymentMethod ? ` (${PAYMENT_METHOD_LABELS[guest.paymentMethod].toLowerCase()})` : ''}`
  }
  return `${companionsText}Confirmado`
}
