import type { ReactNode } from 'react'
import { EventCountdown } from '../EventCountdown'
import { formatDate, formatTime12h } from '../../utils/time'
import { IconCalendar, IconClock, IconMapPin, IconSparkles } from '../accessibility/AccessibleIcon'
import type { EventData } from '../../types'

interface Props {
  event: EventData
}

// Fecha/Hora/Lugar/Vestimenta + countdown, siempre visibles (nunca detrás
// de un acordeón) — ver INVITATION_REDESIGN_PLAN §10. Reordenado a lista
// vertical con un ícono por dato (antes grilla 2 columnas sin íconos, ver
// bug reportado) — mismo lenguaje visual que el resto de las tarjetas
// nuevas (ícono en insignia circular + etiqueta/valor).
export function InvitationEventInfoCard({ event }: Props) {
  const timeLabel = event.startTime
    ? `${formatTime12h(event.startTime)}${event.endTime ? ` – ${formatTime12h(event.endTime)}` : ''}`
    : null

  return (
    <section
      className="invite-card border bg-[var(--invite-surface)] text-[var(--invite-text)] [font-family:var(--invite-font)] [border-radius:var(--invite-radius)] p-4 text-center"
      style={{ boxShadow: 'var(--invite-shadow)', borderColor: 'var(--invite-border)' }}
    >
      <div className="space-y-3 text-left">
        <InfoRow icon={<IconCalendar className="w-4 h-4" />} label="Fecha" value={formatDate(event.date)} />
        {timeLabel && <InfoRow icon={<IconClock className="w-4 h-4" />} label="Hora" value={timeLabel} />}
        <InfoRow icon={<IconMapPin className="w-4 h-4" />} label="Lugar" value={event.location} />
        {event.dressCode && <InfoRow icon={<IconSparkles className="w-4 h-4" />} label="Vestimenta" value={event.dressCode} />}
      </div>

      <EventCountdown date={event.date} startTime={event.startTime} endTime={event.endTime} className="mt-4 mx-auto" />
    </section>
  )
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="invite-icon-badge shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-[var(--invite-accent-soft)] text-[var(--invite-accent)]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="invite-pass-label text-2xs uppercase tracking-widest font-semibold text-[var(--invite-text-muted)] mb-0.5">{label}</p>
        <p className="invite-pass-value text-sm font-medium text-[var(--invite-text)] leading-snug">{value}</p>
      </div>
    </div>
  )
}
