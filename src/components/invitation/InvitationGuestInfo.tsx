import { useEffect, useState } from 'react'
import { getGuestContact } from '../../firebase/guests'
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll'
import { IconEdit, IconUser } from '../accessibility/AccessibleIcon'
import { GuestEditModal } from '../GuestEditModal'
import type { EventData, GuestData } from '../../types'

interface Props {
  event: EventData
  guest: GuestData
  eventId: string
  deviceToken: string | null
  onGuestSaved: (patch: Partial<GuestData>) => void
}

// "Datos de tu registro" — antes solo el nombre era visible en el pase; acá
// se muestran también las respuestas del invitado (event.customFields) y
// los datos de cada acompañante (ver INVITATION_REDESIGN_PLAN §14). El
// contacto (teléfono/email) vive aparte en guestContacts/{guestId} — se
// carga al montar (mismo costo que ya paga GuestEditModal cada vez que el
// invitado toca "Editar mis datos", solo que ahora es una vez por vista del
// pase en vez de a demanda; se probó gatearlo a "cuando la tarjeta entra en
// viewport" pero el IntersectionObserver no siempre llegaba a dispararse
// antes de que el invitado mirara la sección, dejando teléfono/email sin
// mostrar — ver bug reportado).
export function InvitationGuestInfo({ event, guest, eventId, deviceToken, onGuestSaved }: Props) {
  const { ref, className } = useRevealOnScroll<HTMLElement>()
  const [contact, setContact] = useState<{ email: string; phone: string } | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    getGuestContact(eventId, guest.id)
      .then((c) => {
        if (!cancelled) setContact({ email: c.email, phone: c.phone })
      })
      .catch((err) => {
        console.error('Error cargando el contacto del invitado:', err)
      })
    return () => {
      cancelled = true
    }
  }, [eventId, guest.id])

  const customFields = event.customFields || []

  return (
    <section
      ref={ref}
      className={`invite-card border bg-[var(--invite-surface)] text-[var(--invite-text)] [font-family:var(--invite-font)] [border-radius:var(--invite-radius)] p-4 text-left ${className}`}
      style={{ boxShadow: 'var(--invite-shadow)', borderColor: 'var(--invite-border)' }}
    >
      <div className="flex items-center gap-3 mb-4">
        <span className="invite-icon-badge shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-[var(--invite-accent-soft)] text-[var(--invite-accent)]">
          <IconUser className="w-4 h-4" />
        </span>
        <h2 className="text-base font-semibold text-[var(--invite-text)]">Datos de tu registro</h2>
        {!guest.isGroup && (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-[var(--invite-text-muted)] hover:text-[var(--invite-text)] underline underline-offset-2 min-h-9 px-1"
          >
            <IconEdit className="w-3.5 h-3.5" /> Editar
          </button>
        )}
      </div>

      <dl className="space-y-2.5 text-sm">
        <InfoRow label="Nombre" value={[guest.name, guest.lastName].filter(Boolean).join(' ')} />
        {contact?.phone && <InfoRow label="Teléfono" value={contact.phone} />}
        {contact?.email && <InfoRow label="Email" value={contact.email} />}
        {customFields.map((field) => {
          const value = guest.customData?.[field.id]
          if (!value) return null
          return <InfoRow key={field.id} label={field.label} value={value} />
        })}
      </dl>

      {guest.companions.length > 0 && (
        <div className="mt-4 pt-4 border-t space-y-3" style={{ borderColor: 'var(--invite-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--invite-text-muted)]">
            Acompañantes ({guest.companions.length})
          </p>
          {guest.companions.map((companion, index) => {
            const companionFields = customFields.filter((f) => f.appliesToCompanions)
            const fullName = [companion.name, companion.lastName].filter(Boolean).join(' ')
            return (
              <dl key={index} className="space-y-1.5 text-sm rounded-lg bg-[var(--invite-page-bg,transparent)] px-3 py-2.5 border" style={{ borderColor: 'var(--invite-border)' }}>
                <InfoRow label={`Acompañante ${index + 1}`} value={fullName || 'Sin nombre'} />
                {companionFields.map((field) => {
                  const value = companion.customData?.[field.id]
                  if (!value) return null
                  return <InfoRow key={field.id} label={field.label} value={value} />
                })}
              </dl>
            )
          })}
        </div>
      )}

      {editOpen && (
        <GuestEditModal
          eventId={eventId}
          event={event}
          guest={guest}
          lockToken={deviceToken}
          onClose={() => setEditOpen(false)}
          onSaved={(patch) => { onGuestSaved(patch); setEditOpen(false) }}
        />
      )}
    </section>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs uppercase tracking-wide text-[var(--invite-text-muted)] shrink-0">{label}</dt>
      <dd className="text-right text-[var(--invite-text)] break-words">{value}</dd>
    </div>
  )
}
