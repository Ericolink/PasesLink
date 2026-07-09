import { forwardRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { EventData, GuestData } from '../types'
import { partySize } from '../firebase/guests'
import { formatDate, formatTime12h } from '../utils/time'
import { ThemeOrnament } from './ThemeOrnament'
import { ThemeSeal } from './ThemeSeal'
import { PerforatedDivider } from './PerforatedDivider'
import { PassInfoCell } from './PassInfoCell'
import { PassSecurityNotice } from './PassSecurityNotice'
import { Logo } from './Logo'
import { IconCheckCircle } from './Icons'

interface GuestPassTicketProps {
  event: EventData
  guest: GuestData
  passUrl: string
}

// Artefacto de exportación del pase — NO es la invitación en pantalla y por
// eso no está sujeto al contrato de bloques de
// src/design-system/DESIGN_GOVERNANCE.md (ese rige GuestPass.tsx visible).
// A propósito omite pago, timeline, bienvenida, portada y RSVP: es un
// boleto de acceso, pensado para presentarse en la puerta, no una copia de
// la invitación. Vive dentro del mismo <InvitationThemeRoot> que ya envuelve
// GuestPassInner, así que hereda las variables --invite-* por cascada sin
// necesitar templateId como prop.
//
// El QR usa QRCodeSVG (no QRCodeCanvas, a diferencia del resto de la app):
// se renderiza de forma síncrona como <svg>/<path> en el commit de React,
// sin el useEffect asíncrono que pinta el <canvas> de QRCodeCanvas — eso
// eliminaba la condición de carrera que a veces dejaba el PNG exportado sin
// QR. Mismo `value` (passUrl/qrToken), no cambia la lógica de generación de
// datos del QR.
export const GuestPassTicket = forwardRef<HTMLDivElement, GuestPassTicketProps>(function GuestPassTicket(
  { event, guest, passUrl },
  ref,
) {
  const timeLabel = event.startTime
    ? `${formatTime12h(event.startTime)}${event.endTime ? ` – ${formatTime12h(event.endTime)}` : ''}`
    : null
  const companionsCount = guest.isGroup ? partySize(guest) : guest.companions.length

  return (
    <div
      ref={ref}
      className="invite-card w-[420px] border bg-[var(--invite-surface)] text-[var(--invite-text)] [font-family:var(--invite-font)] [border-radius:var(--invite-radius)]"
      style={{
        boxShadow: 'var(--invite-shadow)',
        borderColor: 'var(--invite-border)',
        borderTopColor: 'var(--invite-accent)',
        borderTopWidth: '4px',
      }}
    >
      {/* ── Encabezado: evento ── */}
      <div className="px-8 pt-7 pb-5 text-center">
        <h1 className="text-2xl font-semibold text-[var(--invite-text)]">{event.name}</h1>
        <ThemeOrnament templateId={event.templateId} className="w-16 h-6 mx-auto mt-2 text-[var(--invite-accent)]" />

        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-left">
          <PassInfoCell label="Fecha" value={formatDate(event.date)} />
          {timeLabel && <PassInfoCell label="Hora" value={timeLabel} />}
          <PassInfoCell label="Lugar" value={event.location} className={!timeLabel ? 'col-span-2' : ''} />
          {event.dressCode && (
            <PassInfoCell label="Vestimenta" value={event.dressCode} className={!timeLabel ? '' : 'col-span-2'} />
          )}
        </div>
      </div>

      <PerforatedDivider />

      {/* ── Pie: invitado + QR ── */}
      <div className="px-8 pb-8 pt-6 text-center">
        <p className="text-xl font-semibold text-[var(--invite-text)] mb-0.5">{guest.name}</p>
        {companionsCount > 0 && (
          <p className="text-sm text-[var(--invite-text-muted)] mb-4">
            {guest.isGroup ? `${companionsCount} integrantes` : `+ ${companionsCount} acompañante(s)`}
          </p>
        )}

        {guest.status === 'checked_in' && (
          <span className="inline-flex items-center gap-2 mb-4">
            <ThemeSeal templateId={event.templateId} />
            <p className="invite-badge-positive inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full font-medium bg-[var(--invite-accent-soft)] text-[var(--invite-accent-dark)]">
              <IconCheckCircle className="w-4 h-4 text-green-500" /> Entrada registrada
            </p>
          </span>
        )}

        <div className="flex justify-center my-2">
          <div
            className="invite-qr-frame p-4 border rounded-xl inline-flex items-center justify-center"
            style={{ borderColor: 'var(--invite-border)', background: 'var(--invite-surface)' }}
          >
            <QRCodeSVG value={passUrl} size={260} marginSize={2} />
          </div>
        </div>

        <p className="text-sm text-[var(--invite-text-muted)] mt-3 mb-1">Presenta este código QR en la entrada</p>

        <PassSecurityNotice />

        <div className="mt-5 flex justify-center opacity-80">
          <Logo className="h-6" />
        </div>
      </div>
    </div>
  )
})
