import { useEffect, useMemo, useState } from 'react'
import { AccessibleModal } from './accessibility/AccessibleModal'
import { DialogHeader } from './DialogHeader'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { FilterChip } from './FilterChip'
import { getAllGuestsWithContacts } from '../firebase/guests'
import { createMessageCampaign } from '../firebase/messageCampaigns'
import { matchesAudienceFilter, DEFAULT_AUDIENCE_FILTER, type AudienceFilter } from '../utils/audienceSegmentation'
import { MASS_MESSAGE_BODY_MAX, MASS_MESSAGE_MAX_RECIPIENTS, MASS_MESSAGE_SUBJECT_MAX } from '../utils/validation'
import { useAuth } from '../hooks/useAuth'
import type { EventData, GuestData } from '../types'

const RSVP_OPTIONS: { value: AudienceFilter['rsvp']; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'No respondieron' },
  { value: 'yes', label: 'Confirmados' },
  { value: 'no', label: 'No asistirán' },
]

const PAYMENT_OPTIONS: { value: AudienceFilter['payment']; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'unpaid', label: 'Sin pago' },
  { value: 'pending_confirmation', label: 'Pago sin confirmar' },
  { value: 'paid', label: 'Pagado' },
]

function audienceSummary(filter: AudienceFilter): string {
  const rsvpLabel = RSVP_OPTIONS.find((o) => o.value === filter.rsvp)?.label
  const paymentLabel = PAYMENT_OPTIONS.find((o) => o.value === filter.payment)?.label
  const parts = [filter.rsvp !== 'all' && rsvpLabel, filter.payment !== 'all' && paymentLabel].filter(Boolean)
  return parts.length ? parts.join(' + ') : 'Todos los invitados'
}

interface Props {
  event: EventData
  open: boolean
  onClose: () => void
}

// Selección de audiencia + composición + envío, en un solo sheet — el
// script Node (scripts/send-mass-messages.mjs) procesa la cola por
// separado, este componente solo encola (createMessageCampaign).
export function MassMessageComposer({ event, open, onClose }: Props) {
  const { user } = useAuth()
  const [guests, setGuests] = useState<GuestData[] | null>(null)
  const [filter, setFilter] = useState<AudienceFilter>(DEFAULT_AUDIENCE_FILTER)
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return
    setGuests(null)
    setError('')
    setSent(false)
    getAllGuestsWithContacts(event.id)
      .then(setGuests)
      .catch(() => setError('No pudimos cargar la lista de invitados.'))
  }, [open, event.id])
  /* eslint-enable react-hooks/set-state-in-effect */

  const matchingGuests = useMemo(() => (guests || []).filter((g) => matchesAudienceFilter(g, filter)), [guests, filter])
  const recipientsWithEmail = useMemo(() => matchingGuests.filter((g) => g.email?.trim()), [matchingGuests])
  const recipientsWithoutEmail = matchingGuests.length - recipientsWithEmail.length

  async function handleSend() {
    if (!user || recipientsWithEmail.length === 0) return
    setSending(true)
    setError('')
    try {
      await createMessageCampaign(event.id, user.uid, user.email, {
        subject: subject.trim(),
        bodyText: bodyText.trim(),
        guestIds: recipientsWithEmail.slice(0, MASS_MESSAGE_MAX_RECIPIENTS).map((g) => g.id),
        audienceSummary: audienceSummary(filter),
      })
      setSent(true)
    } catch {
      setError('No pudimos encolar el envío. Intenta de nuevo.')
    } finally {
      setSending(false)
    }
  }

  const canSend = subject.trim().length > 0 && bodyText.trim().length > 0 && recipientsWithEmail.length > 0 && !sending

  return (
    <AccessibleModal open={open} onClose={onClose} label="Enviar mensaje a invitados" maxWidth="sm:max-w-md">
      <DialogHeader title="Mensaje a invitados" onClose={onClose} />

      <div className="px-5 pb-4 pt-4 overflow-y-auto space-y-5">
        {sent ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Tu mensaje se está preparando, puede tardar unos minutos en salir. Podés ver el estado del envío en el historial.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Confirmación</p>
              <div className="flex flex-wrap gap-2">
                {RSVP_OPTIONS.map((opt) => (
                  <FilterChip key={opt.value} active={filter.rsvp === opt.value} onClick={() => setFilter((f) => ({ ...f, rsvp: opt.value }))}>
                    {opt.label}
                  </FilterChip>
                ))}
              </div>
            </div>

            {event.requiresPayment && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Pago</p>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_OPTIONS.map((opt) => (
                    <FilterChip key={opt.value} active={filter.payment === opt.value} onClick={() => setFilter((f) => ({ ...f, payment: opt.value }))}>
                      {opt.label}
                    </FilterChip>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-gray-500 dark:text-gray-400">
              {guests === null
                ? 'Cargando invitados…'
                : `${recipientsWithEmail.length} destinatario(s) con email${recipientsWithoutEmail > 0 ? `, ${recipientsWithoutEmail} sin email quedarán afuera` : ''}.`}
            </p>

            <div className="space-y-1.5">
              <label htmlFor="mass-message-subject" className="block text-xs font-medium text-gray-500 dark:text-gray-400">Asunto</label>
              <input
                id="mass-message-subject"
                type="text"
                value={subject}
                maxLength={MASS_MESSAGE_SUBJECT_MAX}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Asunto del mensaje"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="mass-message-body" className="block text-xs font-medium text-gray-500 dark:text-gray-400">Mensaje</label>
              <textarea
                id="mass-message-body"
                value={bodyText}
                maxLength={MASS_MESSAGE_BODY_MAX}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Escribe tu mensaje…"
                rows={5}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary resize-y"
              />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-700 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4 shrink-0">
        {sent ? (
          <AccessibleButton type="button" size="sm" onClick={onClose}>Cerrar</AccessibleButton>
        ) : (
          <AccessibleButton type="button" size="sm" onClick={handleSend} disabled={!canSend} loading={sending}>
            {sending ? 'Enviando…' : `Enviar a ${recipientsWithEmail.length}`}
          </AccessibleButton>
        )}
      </div>
    </AccessibleModal>
  )
}
