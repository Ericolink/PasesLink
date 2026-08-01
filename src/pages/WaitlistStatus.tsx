import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { getEvent } from '../firebase/events'
import { confirmWaitlistOffer, declineWaitlistOffer, subscribeToWaitlistEntry } from '../firebase/waitlist'
import type { EventData, PaymentMethod, WaitlistEntryData } from '../types'
import { InvitationThemeRoot } from '../components/InvitationThemeRoot'
import { InvitationCard } from '../components/InvitationCard'
import { ThemeOrnament } from '../components/ThemeOrnament'
import { CrownLoader } from '../components/CrownLoader'
import { IconBan } from '../components/accessibility/AccessibleIcon'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PAYMENT_METHOD_LABELS } from '../utils/paymentMethods'

type ActionState = 'idle' | 'confirming' | 'declining' | 'error'

// Pantalla de estado de una entrada de lista de espera — acceso sin login,
// por `waitlistToken` en la URL (mismo principio que el pase por qrToken).
// Ver WAITLIST_RECONFIRMATION_ARCHITECTURE.md §3.2. A diferencia de
// GuestPass.tsx (que evita listeners en vivo por el costo de fan-out a
// miles de pases abiertos a la vez), acá el volumen esperado es
// muchísimo menor y ver la oferta aparecer sin refrescar es el punto
// central de esta pantalla — sí usa un listener en vivo.
export function WaitlistStatus() {
  const { eventId } = useParams<{ eventId: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()

  const [event, setEvent] = useState<EventData | null>(null)
  const [entry, setEntry] = useState<WaitlistEntryData | null | undefined>(undefined)
  const [actionState, setActionState] = useState<ActionState>('idle')
  const [actionError, setActionError] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')

  useDocumentTitle(event ? `Lista de espera · ${event.name}` : 'Lista de espera')

  useEffect(() => {
    if (!eventId) return
    getEvent(eventId).then(setEvent)
  }, [eventId])

  useEffect(() => {
    if (!eventId || !token) return
    return subscribeToWaitlistEntry(eventId, token, setEntry)
  }, [eventId, token])

  // Ya tiene un lugar: la vista de lista de espera deja de ser relevante,
  // redirige directo al pase real. El guest doc por id es públicamente
  // legible (mismo criterio que `guests/{guestId}: allow get: if true`),
  // así que alcanza con un getDoc puntual para conseguir su qrToken.
  useEffect(() => {
    if (!eventId || !entry?.promotedGuestId) return
    getDoc(doc(db, 'events', eventId, 'guests', entry.promotedGuestId)).then((snap) => {
      const qrToken = snap.data()?.qrToken as string | undefined
      if (qrToken) navigate(`/pass/${eventId}/${qrToken}`, { replace: true })
    })
  }, [eventId, entry?.promotedGuestId, navigate])

  // Mismo criterio que EventJoin.tsx: si el evento requiere pago y tiene
  // más de un método configurado, hay que elegir antes de confirmar — con
  // un solo método, se resuelve solo (nunca se le pide a la persona elegir
  // entre una sola opción).
  const needsMethodChoice = !!event?.requiresPayment && (event?.paymentMethods.length || 0) > 1
  const resolvedPaymentMethod: PaymentMethod | undefined = !event?.requiresPayment
    ? undefined
    : needsMethodChoice
      ? paymentMethod || undefined
      : event.paymentMethods[0]

  async function handleConfirm() {
    if (!eventId || !entry?.offerToken) return
    if (needsMethodChoice && !resolvedPaymentMethod) {
      setActionError('Elegí cómo vas a pagar antes de confirmar.')
      return
    }
    setActionState('confirming')
    setActionError('')
    try {
      await confirmWaitlistOffer(eventId, entry.id, entry.offerToken, resolvedPaymentMethod)
      // El redirect a /pass lo dispara el efecto de arriba en cuanto el
      // listener reciba promotedGuestId — no hace falta hacer nada más acá.
    } catch (err) {
      console.error('Error confirming waitlist offer:', err)
      setActionError(
        err instanceof Error && err.message.includes('venció')
          ? 'Esta oferta ya venció.'
          : 'No pudimos confirmar tu lugar. Puede que ya no esté disponible.',
      )
      setActionState('error')
    }
  }

  async function handleDecline() {
    if (!eventId || !entry?.offerToken) return
    setActionState('declining')
    setActionError('')
    try {
      await declineWaitlistOffer(eventId, entry.id, entry.offerToken)
    } catch (err) {
      console.error('Error declining waitlist offer:', err)
      setActionState('error')
    }
  }

  if (!token || entry === null) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-center p-4">
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <IconBan className="w-12 h-12 text-gray-400" />
          </div>
          <p className="text-gray-600 dark:text-gray-400">No encontramos esta entrada en la lista de espera.</p>
        </div>
      </div>
    )
  }

  if (entry === undefined) {
    return <CrownLoader />
  }

  return (
    <InvitationThemeRoot
      templateId={event?.templateId}
      accentOverride={event?.accentColor}
      themeOverrides={event?.themeOverrides}
      communityTemplateVars={event?.communityTemplateSnapshot?.vars}
      className="min-h-dvh flex items-center justify-center text-center p-4"
    >
      <div className="w-full max-w-sm">
        <InvitationCard coverImage={event?.coverImage} coverAlt={event?.name} priority>
          <h1 className="text-xl font-bold mb-1">{event?.name}</h1>
          <ThemeOrnament templateId={event?.templateId} className="w-16 h-6 mx-auto mt-1 mb-4 text-[var(--invite-accent)]" />

          {entry.status === 'waiting' && (
            <>
              <p className="text-base font-semibold text-[var(--invite-text)] mb-2">Seguís en la lista de espera.</p>
              <p className="text-sm text-[var(--invite-text-muted)]">
                Te avisamos por email apenas se libere un lugar. Podés cerrar esta página y volver cuando quieras con el
                mismo link.
              </p>
            </>
          )}

          {entry.status === 'offered' && (
            <div className="text-left">
              <p className="text-base font-semibold text-[var(--invite-text)] mb-2 text-center">
                🎉 ¡Se liberó un lugar para vos!
              </p>
              <p className="text-sm text-[var(--invite-text-muted)] mb-4 text-center">
                Confirmá tu asistencia cuando puedas. Te recomendamos hacerlo pronto: si tarda demasiado, el
                organizador puede ofrecerle el lugar a la siguiente persona en la fila.
              </p>
              {needsMethodChoice && (
                <div role="radiogroup" aria-label="Método de pago" className="grid grid-cols-2 gap-2 mb-3">
                  {event!.paymentMethods.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={paymentMethod === m}
                      onClick={() => setPaymentMethod(m)}
                      className={`min-h-11 rounded-full border text-sm font-semibold transition-colors ${
                        paymentMethod === m
                          ? 'bg-[var(--invite-accent)] text-white border-[var(--invite-accent)]'
                          : 'border-[var(--invite-border)] text-[var(--invite-text)]'
                      }`}
                    >
                      {PAYMENT_METHOD_LABELS[m]}
                    </button>
                  ))}
                </div>
              )}
              {actionError && <p className="text-sm text-error mb-3 text-center">{actionError}</p>}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={actionState === 'confirming' || actionState === 'declining' || (needsMethodChoice && !paymentMethod)}
                  className="w-full text-white rounded-full py-3.5 font-bold text-base hover:opacity-90 active:scale-[.98] transition-all disabled:opacity-50 bg-[var(--invite-accent)]"
                >
                  {actionState === 'confirming' ? 'Confirmando…' : 'Confirmar mi lugar'}
                </button>
                <button
                  type="button"
                  onClick={handleDecline}
                  disabled={actionState === 'confirming' || actionState === 'declining'}
                  className="w-full rounded-full py-3 font-semibold text-sm text-[var(--invite-text-muted)] disabled:opacity-50"
                >
                  {actionState === 'declining' ? 'Un momento…' : 'No, gracias'}
                </button>
              </div>
            </div>
          )}

          {entry.status === 'declined' && (
            <p className="text-sm text-[var(--invite-text-muted)]">
              Declinaste este lugar. Si cambiaste de opinión, contactá al organizador.
            </p>
          )}

          {entry.status === 'expired' && (
            <p className="text-sm text-[var(--invite-text-muted)]">
              El lugar que se liberó ya fue asignado a otra persona porque no llegamos a tu confirmación a tiempo. Si
              querés seguir esperando, anotate de nuevo desde el link de invitación del evento.
            </p>
          )}

          {entry.status === 'removed' && (
            <p className="text-sm text-[var(--invite-text-muted)]">
              El organizador te quitó de la lista de espera. Si creés que es un error, contactalo directamente.
            </p>
          )}
        </InvitationCard>
      </div>
    </InvitationThemeRoot>
  )
}
