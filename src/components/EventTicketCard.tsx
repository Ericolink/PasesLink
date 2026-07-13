import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { EventStatus, TemplateId } from '../types'
import { buildTicketThemeStyle } from '../templates/ticketTheme'
import { IconStar, IconTicket } from './Icons'

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function ticketDateParts(date: string): { day: string; month: string } {
  const d = new Date(date + 'T00:00:00')
  if (isNaN(d.getTime())) return { day: '--', month: '' }
  return { day: String(d.getDate()), month: MONTH_LABELS[d.getMonth()] }
}

const STATUS_LABELS: Record<EventStatus, string> = {
  active: 'Activo',
  cancelled: 'Cancelado',
  archived: 'Archivado',
}

interface EventTicketCardProps {
  /** Destino al tocar el boleto entero (navega, no dispara ninguna acción). */
  href: string
  /** 'YYYY-MM-DD' — alimenta el talón día/mes. */
  date: string
  /** Plantilla del evento — sin ella (o 'default') el boleto se ve igual que
      siempre (look nocturno/rosa de PaseLink), ver ticketTheme.ts. */
  templateId?: TemplateId
  accentColor?: string
  status?: EventStatus
  /** Boleto destacado (evento más próximo) — badge dorado, ajeno al tema. */
  highlight?: boolean
  /** Evento pasado — reduce opacidad. */
  dimmed?: boolean
  title: string
  subtitle: ReactNode
  /** Contenido arriba de la perforación (ej. barra de asistencia, QR). */
  body?: ReactNode
  /** Contenido abajo de la perforación (ej. horario). Sin esto, no hay perforación. */
  footer?: ReactNode
  /** Para escalonar la animación de entrada, como en una lista. */
  index?: number
}

export function EventTicketCard({
  href,
  date,
  templateId,
  accentColor,
  status,
  highlight,
  dimmed,
  title,
  subtitle,
  body,
  footer,
  index = 0,
}: EventTicketCardProps) {
  const { day, month } = ticketDateParts(date)
  const themeVars = buildTicketThemeStyle(templateId, accentColor)

  return (
    <Link
      to={href}
      style={{
        animationDelay: `${Math.min(index, 6) * 0.06}s`,
        border: `1px solid ${highlight ? 'var(--invite-accent, rgba(255,20,100,.4))' : 'var(--invite-border, rgba(74,50,92,.7))'}`,
        borderRadius: 'var(--invite-radius, 1rem)',
        fontFamily: 'var(--invite-font, inherit)',
        ...themeVars,
      }}
      className={`ticket-card animate-fade-in-up overflow-hidden flex ${dimmed ? 'opacity-70' : ''} ${highlight ? 'ticket-card--next' : ''}`}
    >
      {/* Talón: fecha */}
      <div
        className="ticket-stub shrink-0 w-[60px] sm:w-[72px] flex flex-col items-center justify-center gap-0.5"
        style={{
          background: highlight
            ? 'linear-gradient(180deg, color-mix(in srgb, var(--invite-accent, #FF1464) 22%, transparent), color-mix(in srgb, var(--invite-accent, #FF1464) 6%, transparent))'
            : 'var(--invite-surface, rgba(74,50,92,.35))',
        }}
      >
        <span
          className={`text-2xl font-bold leading-none ${highlight ? 'text-[var(--invite-accent,#FF1464)]' : 'text-[var(--invite-text,#fff)]'}`}
        >
          {day}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--invite-text-muted,#6b7280)]">{month}</span>
      </div>

      {/* Cuerpo del boleto */}
      <div
        className="flex-1 min-w-0"
        style={{
          background: highlight
            ? 'linear-gradient(135deg, color-mix(in srgb, var(--invite-accent, #FF1464) 10%, transparent), var(--invite-surface, rgba(30,20,40,.9)))'
            : 'var(--invite-surface, rgba(30,20,40,.8))',
        }}
      >
        {/* Padding recortado (antes p-4 pb-3 / mb-3 / footer pt-2.5) — con
            varias tarjetas en Dashboard/MyInvitations, el aire de sobra
            entre secciones se acumulaba en una lista notablemente más alta
            de lo que el contenido necesitaba. */}
        <div className="p-3.5 pb-2.5">
          <div className="flex items-start justify-between gap-2 mb-1">
            {/* El título es lo único que hereda la tipografía del tema — las
                etiquetas chicas (talón, PassInfoCell) se quedan en la sans
                por defecto para no perder legibilidad a tamaño reducido. */}
            <h2 className="font-semibold flex items-center gap-2 min-w-0 text-[var(--invite-text,#fff)]" style={{ fontFamily: 'var(--invite-font, inherit)' }}>
              <IconTicket className="w-4 h-4 shrink-0 text-[var(--invite-accent,#FF1464)]" />
              <span className="truncate min-w-0">{title}</span>
            </h2>
            <div className="flex items-center gap-1.5 shrink-0">
              {highlight && (
                <span
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide"
                  style={{ background: 'rgba(232,184,75,.15)', color: '#E8B84B', border: '1px solid rgba(232,184,75,.4)' }}
                >
                  <IconStar className="w-2.5 h-2.5" /> Próximo
                </span>
              )}
              {status && status !== 'active' && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: status === 'cancelled' ? 'rgba(255,20,100,.15)' : 'rgba(74,50,92,.8)',
                    color: status === 'cancelled' ? '#FF1464' : '#9C8FA8',
                    border: `1px solid ${status === 'cancelled' ? 'rgba(255,20,100,.3)' : 'rgba(74,50,92,.9)'}`,
                  }}
                >
                  {STATUS_LABELS[status]}
                </span>
              )}
            </div>
          </div>

          <p className="text-sm mb-2 text-[var(--invite-text-muted,#6b7280)]">{subtitle}</p>

          {body}
        </div>

        {footer && (
          <div className="ticket-perforation px-3.5 pb-2.5 pt-2">
            {footer}
          </div>
        )}
      </div>
    </Link>
  )
}
