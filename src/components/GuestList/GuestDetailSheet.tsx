import { useEffect, useState } from 'react'
import { AccessibleModal } from '../accessibility/AccessibleModal'
import { guestPresence, partySize, presentIndicesOf, type CheckInResult, type ConfirmPaymentAndCheckInResult } from '../../firebase/guests'
import type { CustomField, DietaryRestriction, GuestData, GuestSegmentTag, MenuOption, MenuSelection, PaymentMethod } from '../../types'
import { TagMultiSelect } from '../TagMultiSelect'

// Solo lectura (Feature 6) — la selección la hace el propio invitado desde
// "Editar mis datos" (GuestEditModal); acá el organizador solo consulta
// para catering, no edita.
function MenuSummary({ menu, selection, label }: { menu: { options: MenuOption[]; restrictions: DietaryRestriction[] }; selection: MenuSelection | undefined; label: string }) {
  if (!selection?.optionId && !selection?.restrictionIds?.length) return null
  const optionName = menu.options.find((o) => o.id === selection.optionId)?.name
  const restrictionLabels = (selection.restrictionIds || [])
    .map((id) => menu.restrictions.find((r) => r.id === id)?.label)
    .filter(Boolean)
  return (
    <div className="text-sm">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-gray-900 dark:text-white">
        {optionName || 'Sin platillo elegido'}
        {restrictionLabels.length > 0 && ` · ${restrictionLabels.join(', ')}`}
        {selection.note && <span className="block text-xs text-gray-500 dark:text-gray-400">{selection.note}</span>}
      </dd>
    </div>
  )
}
import {
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconEdit,
  IconHelpCircle,
  IconLogOut,
  IconMail,
  IconRotateCcw,
  IconShare,
  IconTicket,
  IconTrash,
  IconUserPlus,
  IconWhatsApp,
  IconX,
} from '../accessibility/AccessibleIcon'
import { GuestAvatar } from './GuestAvatar'
import { GuestEditForm } from './GuestEditForm'
import { GuestHistory } from './GuestHistory'
import { guestDisplayName } from './guestGrouping'
import { PAYMENT_METHOD_LABELS } from '../../utils/paymentMethods'
import { formatCustomFieldValue } from '../../utils/customFieldInput'
import { ActionButton, Pill } from './ActionSheetKit'

export function GuestDetailSheet({
  eventId,
  guest,
  requiresPayment,
  paymentMethods,
  ticketPrice,
  currency,
  customFields = [],
  guestTags = [],
  menu,
  maxCompanions,
  copiedId,
  canEditGuests = true,
  canConfirmPayments = true,
  canDeleteGuests = true,
  canCheckIn = true,
  attendeeLimitEnabled = false,
  onClose,
  onShare,
  onResend,
  onMarkPaid,
  onMarkUnpaid,
  onSetTags,
  onRequestDelete,
  onRequestReentry,
  onReactivate,
  onConfirmRsvp,
  onCheckIn,
  onNeedsCheckInSelection,
  onConfirmPaymentAndCheckIn,
  onRequestSendToWaitlist,
}: {
  eventId: string
  guest: GuestData | null
  requiresPayment: boolean
  paymentMethods: PaymentMethod[]
  ticketPrice: number
  currency: string
  customFields?: CustomField[]
  guestTags?: GuestSegmentTag[]
  menu?: { options: MenuOption[]; restrictions: DietaryRestriction[] }
  maxCompanions: number
  copiedId: string | null
  // Defaults en `true` para no romper a ningún caller que todavía no pasa
  // estos props (mismo criterio de compatibilidad que el resto de esta
  // feature: sin entrada de permisos = acceso amplio, como antes).
  canEditGuests?: boolean
  canConfirmPayments?: boolean
  canDeleteGuests?: boolean
  // Mismo permiso `scanQr` que exige la Cloud Function checkInGuest — sin
  // esto, un coanfitrión sin acceso al escáner vería el botón "Registrar
  // entrada" igual y recién se enteraría del permission-denied al tocarlo.
  canCheckIn?: boolean
  // "Enviar a lista de espera" solo tiene sentido en eventos con cupo
  // límite (si no, no hay lista de espera que active una cascada al
  // liberar el lugar) — ver moveGuestToWaitlist en src/firebase/guests.ts.
  attendeeLimitEnabled?: boolean
  onClose: () => void
  onShare: (guest: GuestData) => void
  onResend: (guest: GuestData, channel: 'whatsapp' | 'email') => void
  onMarkPaid: (guest: GuestData, method?: PaymentMethod) => Promise<void>
  onMarkUnpaid: (guest: GuestData) => Promise<void>
  onSetTags: (guest: GuestData, tagIds: string[]) => void
  onRequestDelete: (guest: GuestData) => void
  onRequestReentry: (guest: GuestData) => void
  onReactivate: (guest: GuestData) => void
  // Confirmación manual del organizador cuando el invitado avisó por otro
  // medio (WhatsApp, llamada) en vez de responder el RSVP público — ver
  // confirmGuestRsvp en src/firebase/guests.ts.
  onConfirmRsvp: (guest: GuestData) => void
  // "Registrar entrada" — mismo checkInGuest que usa el Scanner, para cuando
  // la cámara falla o el invitado no tiene el QR a mano. Devuelve el
  // CheckInResult completo (no solo éxito/error) porque este sheet necesita
  // distinguir 'already_checked_in'/'payment_required'/'blocked_final_exit'
  // para mostrar el mensaje correcto sin duplicar esa lógica en GuestList.
  onCheckIn: (guest: GuestData) => Promise<CheckInResult>
  // 'needs_selection' (grupo/familia con integrantes pendientes) no se
  // resuelve acá adentro — GuestList.tsx cierra este sheet y abre
  // CheckInSelectionModal (mismo componente que usa el Scanner).
  onNeedsCheckInSelection: (guest: GuestData, pendingIndices: number[]) => void
  // Botón "Sí, ya pagó" cuando onCheckIn devuelve 'payment_required' — mismo
  // confirmPaymentAndCheckIn atómico que usa el escáner (ScanResultModal),
  // en vez de obligar al organizador a ir a "Confirmar pago" aparte y volver
  // a tocar "Registrar entrada".
  onConfirmPaymentAndCheckIn: (guest: GuestData, method?: PaymentMethod) => Promise<ConfirmPaymentAndCheckInResult>
  onRequestSendToWaitlist: (guest: GuestData) => void
}) {
  const [editing, setEditing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  // Antes onMarkPaid/onMarkUnpaid no devolvían nada esperable: el botón no
  // tenía forma de saber si la llamada seguía en curso o había fallado, así
  // que no mostraba ni carga ni error — el único indicio de éxito era que
  // `guest` viniera actualizado (y GuestList.tsx guardaba una COPIA fija de
  // `guest` al abrir el detalle, así que ni eso se veía sin cerrar y volver
  // a abrir). Acá se resuelve la parte de feedback; la reactividad de
  // `guest` se resolvió en GuestList.tsx (detailGuestId derivado de `guests`
  // en vez de una copia congelada).
  const [paymentActionPending, setPaymentActionPending] = useState(false)
  const [paymentActionError, setPaymentActionError] = useState('')
  // Solo relevante con 2+ métodos habilitados — con uno solo, paymentMethods[0]
  // ya resuelve el método sin pedirle nada al organizador. Se reinicia al
  // cambiar de invitado porque este sheet no se desmonta entre uno y otro
  // (GuestList.tsx reusa la misma instancia, sin `key` por guest.id).
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | undefined>(undefined)
  // "Confirmar pago" con 2+ métodos no confirma directo: primero pide elegir
  // método acá mismo (inline, no un modal aparte) y recién con "Confirmar"
  // dispara el pago — pedido explícito del organizador para no confirmar por
  // error con el método equivocado ya preseleccionado.
  const [confirmingPaymentMethod, setConfirmingPaymentMethod] = useState(false)
  // Mismo criterio que paymentActionPending/Error de arriba — "Registrar
  // entrada" necesita su propio feedback inline (el resultado 'success' no
  // muestra nada porque el pill de presencia de más arriba ya se actualiza
  // solo al re-renderizar con el `guest` fresco).
  const [checkInPending, setCheckInPending] = useState(false)
  const [checkInError, setCheckInError] = useState('')
  // "Registrar entrada" sobre un invitado sin pagar no tira error y listo:
  // pregunta "¿Pagó?" (mismo criterio que "Sí, ya pagó" del escáner) para
  // resolver pago + check-in en un solo paso, sin mandar al organizador a
  // buscar el botón "Confirmar pago" aparte y volver a tocar este.
  const [checkInNeedsPayment, setCheckInNeedsPayment] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect -- reinicio de selección al cambiar de invitado (el sheet no se desmonta entre uno y otro) */
  useEffect(() => {
    setSelectedMethod(undefined)
    setConfirmingPaymentMethod(false)
    setCheckInError('')
    setCheckInNeedsPayment(false)
  }, [guest?.id])
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleClose() {
    setEditing(false)
    setHistoryOpen(false)
    setPaymentActionPending(false)
    setPaymentActionError('')
    setConfirmingPaymentMethod(false)
    setCheckInError('')
    setCheckInNeedsPayment(false)
    onClose()
  }

  async function handleCheckInClick(g: GuestData) {
    setCheckInPending(true)
    setCheckInError('')
    try {
      const result = await onCheckIn(g)
      if (result.status === 'needs_selection') {
        onNeedsCheckInSelection(g, result.pendingIndices)
      } else if (result.status === 'already_checked_in') {
        setCheckInError(`${guestDisplayName(g)} ya había registrado su entrada.`)
      } else if (result.status === 'payment_required') {
        setCheckInNeedsPayment(true)
      } else if (result.status === 'blocked_final_exit') {
        setCheckInError('Salió definitivamente del evento — usa "Permitir reingreso" primero.')
      } else if (result.status === 'not_found') {
        setCheckInError('No se encontró la invitación.')
      }
    } catch {
      setCheckInError('No se pudo registrar la entrada. Intenta de nuevo.')
    } finally {
      setCheckInPending(false)
    }
  }

  async function handleConfirmPaymentAndCheckInClick(g: GuestData) {
    setCheckInPending(true)
    setCheckInError('')
    try {
      const result = await onConfirmPaymentAndCheckIn(g, selectedMethod ?? g.paymentMethod ?? paymentMethods[0])
      setCheckInNeedsPayment(false)
      if (result.checkIn === 'needs_selection') {
        onNeedsCheckInSelection(g, result.pendingIndices)
      } else if (result.checkIn === 'already_checked_in') {
        setCheckInError(`${guestDisplayName(g)} ya había registrado su entrada.`)
      } else if (result.checkIn === 'blocked_final_exit') {
        setCheckInError('Salió definitivamente del evento — usa "Permitir reingreso" primero.')
      }
    } catch {
      setCheckInError('No se pudo confirmar el pago. Intenta de nuevo.')
    } finally {
      setCheckInPending(false)
    }
  }

  async function handleMarkPaidClick(g: GuestData, method?: PaymentMethod) {
    setPaymentActionPending(true)
    setPaymentActionError('')
    try {
      await onMarkPaid(g, method)
    } catch {
      setPaymentActionError('No se pudo confirmar el pago. Intenta de nuevo.')
    } finally {
      setPaymentActionPending(false)
    }
  }

  async function handleMarkUnpaidClick(g: GuestData) {
    setPaymentActionPending(true)
    setPaymentActionError('')
    try {
      await onMarkUnpaid(g)
    } catch {
      setPaymentActionError('No se pudo actualizar el estado de pago. Intenta de nuevo.')
    } finally {
      setPaymentActionPending(false)
    }
  }

  if (!guest) return null

  const presence = guestPresence(guest)
  const amount = ticketPrice * partySize(guest)

  return (
    <AccessibleModal open={!!guest} onClose={handleClose} label={`Detalle de ${guestDisplayName(guest)}`} maxWidth="sm:max-w-md">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4 shrink-0 border-b border-gray-100 dark:border-gray-700">
        <GuestAvatar guest={guest} size={46} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-gray-900 dark:text-white truncate">
            {guest.isGroup ? `${guest.name} · ${partySize(guest)} integrantes` : guestDisplayName(guest)}
          </p>
          {guest.phone && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{guest.phone}</p>}
        </div>
        <button
          onClick={handleClose}
          aria-label="Cerrar"
          className="-m-2 min-w-11 min-h-11 inline-flex items-center justify-center shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <IconX className="w-5 h-5" />
        </button>
      </div>

      <div className="px-5 py-4 overflow-y-auto space-y-5">
          {editing ? (
            <GuestEditForm eventId={eventId} guest={guest} customFields={customFields} maxCompanions={maxCompanions} onDone={() => setEditing(false)} />
          ) : (
            <>
              <section className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Estado</p>
                <div className="flex flex-wrap gap-2">
                  {guest.rsvpStatus === 'yes' && <Pill tone="green" icon={<IconCheckCircle className="w-3.5 h-3.5" />}>Asistirá</Pill>}
                  {guest.rsvpStatus === 'no' && <Pill tone="gray" icon={<IconX className="w-3.5 h-3.5" />}>No asistirá</Pill>}
                  {guest.rsvpStatus === 'pending' && <Pill tone="amber" icon={<IconHelpCircle className="w-3.5 h-3.5" />}>Sin responder</Pill>}
                  {presence === 'inside' && (
                    <Pill tone="blue" icon={<IconCheckCircle className="w-3.5 h-3.5" />}>
                      {presentIndicesOf(guest).length < partySize(guest)
                        ? `Adentro · ${presentIndicesOf(guest).length}/${partySize(guest)}`
                        : 'Adentro'}
                    </Pill>
                  )}
                  {presence === 'temp_out' && <Pill tone="amber" icon={<IconLogOut className="w-3.5 h-3.5" />}>Salida temporal</Pill>}
                  {presence === 'final_out' && <Pill tone="gray" icon={<IconLogOut className="w-3.5 h-3.5" />}>Fuera del evento</Pill>}
                </div>
                {!guest.isGroup && guest.companions.length > 0 && (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {guest.companions.length} acompañante{guest.companions.length > 1 ? 's' : ''}
                    {guest.companions.some((c) => c.name) && (
                      <>: {guest.companions.map((c) => c.name || 'Sin nombre').join(', ')}</>
                    )}
                  </p>
                )}
                {guest.status === 'checked_in' && (
                  <button
                    onClick={() => setHistoryOpen((v) => !v)}
                    className="text-xs text-gray-500 dark:text-gray-400 font-medium underline underline-offset-2"
                  >
                    {historyOpen ? 'Ocultar historial de accesos' : 'Ver historial de accesos'}
                  </button>
                )}
                {historyOpen && <GuestHistory eventId={eventId} guestId={guest.id} />}
              </section>

              {guestTags.length > 0 && canEditGuests && (
                <section className="space-y-1">
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Segmentos</p>
                  <TagMultiSelect
                    tags={guestTags}
                    selected={guest.tags || []}
                    onChange={(ids) => onSetTags(guest, ids)}
                  />
                </section>
              )}

              {menu && (menu.options.length > 0 || menu.restrictions.length > 0)
                && (guest.menuSelection?.optionId || guest.menuSelection?.restrictionIds?.length
                  || guest.companions.some((c) => c.menuSelection?.optionId || c.menuSelection?.restrictionIds?.length)) && (
                <section className="space-y-1">
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Menú</p>
                  <dl className="space-y-1.5">
                    <MenuSummary menu={menu} selection={guest.menuSelection} label={guestDisplayName(guest)} />
                    {guest.companions.map((c, i) => (
                      <MenuSummary key={i} menu={menu} selection={c.menuSelection} label={c.name || `Acompañante ${i + 1}`} />
                    ))}
                  </dl>
                </section>
              )}

              {customFields.some((field) => guest.customData?.[field.id]) && (
                <section className="space-y-1">
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Datos adicionales</p>
                  <dl className="space-y-1">
                    {customFields.map((field) => {
                      const value = guest.customData?.[field.id]
                      if (!value) return null
                      return (
                        <div key={field.id} className="flex justify-between gap-3 text-sm">
                          <dt className="text-gray-500 dark:text-gray-400">{field.label}</dt>
                          <dd className="text-gray-900 dark:text-white font-medium text-right truncate">{formatCustomFieldValue(field, value)}</dd>
                        </div>
                      )
                    })}
                  </dl>
                </section>
              )}

              {requiresPayment && (
                <section className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Pago</p>
                  <div className="flex flex-wrap gap-2">
                    {guest.paymentStatus === 'paid' ? (
                      <Pill tone="green" icon={<IconTicket className="w-3.5 h-3.5" />}>
                        Pagó{guest.paymentMethod ? ` (${PAYMENT_METHOD_LABELS[guest.paymentMethod]})` : ''}
                      </Pill>
                    ) : guest.paymentStatus === 'pending_confirmation' ? (
                      <Pill tone="amber" icon={<IconTicket className="w-3.5 h-3.5" />}>Comprobante enviado — a revisar</Pill>
                    ) : (
                      <Pill tone="amber" icon={<IconTicket className="w-3.5 h-3.5" />}>
                        Pendiente · {currency}{amount.toLocaleString('es')}
                        {guest.paymentMethod ? ` · ${PAYMENT_METHOD_LABELS[guest.paymentMethod]}` : ''}
                      </Pill>
                    )}
                    {guest.paymentNote && <Pill tone="gray">Ref: {guest.paymentNote}</Pill>}
                  </div>
                  {/* Feedback inline: el banner de error de GuestList.tsx
                      queda tapado por este modal, así que el único lugar
                      donde el organizador puede verlo mientras decide qué
                      hacer es acá adentro. */}
                  {paymentActionError && (
                    <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                      {paymentActionError}
                    </p>
                  )}
                </section>
              )}

              <section className="space-y-1 pt-1 border-t border-gray-100 dark:border-gray-700">
                {/* Mismo checkInGuest que usa el escáner — para cuando la
                    cámara falla o el invitado no tiene el QR a mano. Oculto
                    con salida definitiva (presence === 'final_out'): ahí el
                    propio checkInGuest devuelve 'blocked_final_exit', así
                    que no tiene sentido ofrecer el botón antes de "Permitir
                    reingreso". */}
                {canCheckIn && presence !== 'final_out' && !checkInNeedsPayment && (
                  <ActionButton
                    icon={<IconUserPlus className="w-4 h-4" />}
                    onClick={() => void handleCheckInClick(guest)}
                    disabled={checkInPending}
                  >
                    {checkInPending ? 'Registrando…' : 'Registrar entrada'}
                  </ActionButton>
                )}
                {/* "Registrar entrada" sobre un invitado sin pagar pregunta
                    acá mismo en vez de solo avisar — "Sí, ya pagó" dispara
                    confirmPaymentAndCheckIn (pago + check-in atómicos), mismo
                    botón que ya existe en el escáner. */}
                {checkInNeedsPayment && (
                  <div className="px-3 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 space-y-2.5">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      {guest.paymentStatus === 'pending_confirmation'
                        ? 'Envió comprobante y está esperando confirmación. ¿Confirmas el pago para registrar la entrada?'
                        : `¿${guestDisplayName(guest)} ya pagó la entrada?`}
                    </p>
                    {paymentMethods.length > 1 && (
                      <div className="flex gap-2">
                        {paymentMethods.map((m) => {
                          const isSelected = (selectedMethod ?? guest.paymentMethod ?? paymentMethods[0]) === m
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setSelectedMethod(m)}
                              disabled={checkInPending}
                              aria-pressed={isSelected}
                              className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                                isSelected
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                              }`}
                            >
                              {PAYMENT_METHOD_LABELS[m]}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCheckInNeedsPayment(false)}
                        disabled={checkInPending}
                        className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 disabled:opacity-50"
                      >
                        No, todavía no
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleConfirmPaymentAndCheckInClick(guest)}
                        disabled={checkInPending}
                        className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {checkInPending ? 'Confirmando…' : 'Sí, ya pagó'}
                      </button>
                    </div>
                  </div>
                )}
                {checkInError && (
                  <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                    {checkInError}
                  </p>
                )}
                <ActionButton icon={copiedId === guest.id ? <IconCheck className="w-4 h-4" /> : <IconShare className="w-4 h-4" />} onClick={() => onShare(guest)}>
                  {copiedId === guest.id ? 'Copiado!' : 'Compartir invitación'}
                </ActionButton>
                {/* Reenvío del mismo link (mismo qrToken) por si el invitado
                    se autoregistró desde el navegador de Instagram/TikTok y
                    lo perdió al cerrarlo — ver src/utils/resendInvitation.ts.
                    Gateado por editGuests (mismo permiso que "Editar datos"):
                    toca datos de contacto del invitado, no debe quedar
                    disponible para un coanfitrión de solo lectura. */}
                {canEditGuests && guest.phone?.trim() && (
                  <ActionButton icon={<IconWhatsApp className="w-4 h-4" />} onClick={() => onResend(guest, 'whatsapp')}>
                    Reenviar por WhatsApp
                  </ActionButton>
                )}
                {canEditGuests && guest.email?.trim() && (
                  <ActionButton icon={<IconMail className="w-4 h-4" />} onClick={() => onResend(guest, 'email')}>
                    Reenviar por correo
                  </ActionButton>
                )}
                {canEditGuests && (
                  <ActionButton icon={<IconEdit className="w-4 h-4" />} onClick={() => setEditing(true)}>
                    Editar datos
                  </ActionButton>
                )}

                {canConfirmPayments && requiresPayment && guest.paymentStatus === 'paid' && (
                  <ActionButton
                    tone="subtle"
                    icon={<IconRotateCcw className="w-4 h-4" />}
                    onClick={() => void handleMarkUnpaidClick(guest)}
                    disabled={paymentActionPending}
                  >
                    {paymentActionPending ? 'Actualizando…' : 'Marcar como no pagado'}
                  </ActionButton>
                )}
                {canConfirmPayments && requiresPayment && guest.paymentStatus === 'pending_confirmation' && (
                  <>
                    <ActionButton
                      icon={<IconCheck className="w-4 h-4" />}
                      onClick={() => void handleMarkPaidClick(guest, selectedMethod ?? guest.paymentMethod ?? undefined)}
                      disabled={paymentActionPending}
                    >
                      {paymentActionPending ? 'Confirmando…' : 'Aprobar pago'}
                    </ActionButton>
                    <ActionButton
                      tone="danger"
                      icon={<IconX className="w-4 h-4" />}
                      onClick={() => void handleMarkUnpaidClick(guest)}
                      disabled={paymentActionPending}
                    >
                      {paymentActionPending ? 'Actualizando…' : 'Rechazar comprobante'}
                    </ActionButton>
                  </>
                )}
                {canConfirmPayments && requiresPayment && guest.paymentStatus !== 'paid' && guest.paymentStatus !== 'pending_confirmation' && (
                  paymentMethods.length > 1 && confirmingPaymentMethod ? (
                    <div className="px-2 py-2 space-y-2">
                      <p className="text-2xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">¿Cómo pagó?</p>
                      <div className="flex gap-2">
                        {paymentMethods.map((m) => {
                          const isSelected = (selectedMethod ?? paymentMethods[0]) === m
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setSelectedMethod(m)}
                              disabled={paymentActionPending}
                              aria-pressed={isSelected}
                              className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                                isSelected
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                              }`}
                            >
                              {PAYMENT_METHOD_LABELS[m]}
                            </button>
                          )
                        })}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmingPaymentMethod(false)}
                          disabled={paymentActionPending}
                          className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleMarkPaidClick(guest, selectedMethod ?? paymentMethods[0])}
                          disabled={paymentActionPending}
                          className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {paymentActionPending ? 'Confirmando…' : 'Confirmar'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <ActionButton
                      icon={<IconTicket className="w-4 h-4" />}
                      onClick={() => {
                        if (paymentMethods.length > 1) {
                          setConfirmingPaymentMethod(true)
                        } else {
                          void handleMarkPaidClick(guest, guest.paymentMethod ?? paymentMethods[0])
                        }
                      }}
                      disabled={paymentActionPending}
                    >
                      {paymentActionPending ? 'Confirmando…' : 'Confirmar pago'}
                    </ActionButton>
                  )
                )}

                {canEditGuests && guest.rsvpStatus !== 'yes' && (
                  <ActionButton icon={<IconCheckCircle className="w-4 h-4" />} onClick={() => onConfirmRsvp(guest)}>
                    Confirmar asistencia
                  </ActionButton>
                )}
                {canEditGuests && guest.rsvpStatus === 'no' && (
                  <ActionButton icon={<IconRotateCcw className="w-4 h-4" />} onClick={() => onReactivate(guest)}>
                    Reactivar invitación
                  </ActionButton>
                )}
                {canEditGuests && presence === 'final_out' && (
                  <ActionButton icon={<IconRotateCcw className="w-4 h-4" />} onClick={() => onRequestReentry(guest)}>
                    Permitir reingreso
                  </ActionButton>
                )}

                {/* Para el día del evento: en vez de eliminar a alguien que
                    no pagó y no llegó (perdiendo su registro), lo pasa a la
                    lista de espera — libera su lugar igual (misma cascada
                    que deleteGuest, vía onCapacityFreed) pero conserva sus
                    datos por si aparece más tarde. No para quien ya pagó
                    (nunca se le quita el lugar a un pase pagado) ni para
                    quien ya hizo check-in. */}
                {canDeleteGuests && attendeeLimitEnabled && guest.paymentStatus !== 'paid' && presence === 'invited' && (
                  <ActionButton tone="subtle" icon={<IconClock className="w-4 h-4" />} onClick={() => onRequestSendToWaitlist(guest)}>
                    Enviar a lista de espera
                  </ActionButton>
                )}

                {canDeleteGuests && (
                  <>
                    <div className="h-px bg-gray-100 dark:bg-gray-700 my-2" />
                    <ActionButton tone="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => onRequestDelete(guest)}>
                      Eliminar invitado
                    </ActionButton>
                  </>
                )}
              </section>
            </>
          )}
        </div>
    </AccessibleModal>
  )
}
