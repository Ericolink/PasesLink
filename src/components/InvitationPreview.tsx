import { useDeferredValue } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { InvitationThemeRoot } from './InvitationThemeRoot'
import { InvitationCard } from './InvitationCard'
import { ThemeOrnament } from './ThemeOrnament'
import { InviteDivider } from './InviteDivider'
import { EventMap } from './EventMap'
import { TimelineDisplay } from './TimelineDisplay'
import { IconDownload, IconWhatsApp } from './Icons'
import { PREVIEW_CONTENT, PREVIEW_WALL_MESSAGES } from '../templates/previewContent'
import { QR_QUIET_ZONE_MODULES } from '../utils/qrUrl'
import type { TemplateId, TimelineEntry } from '../types'

interface InvitationPreviewProps {
  templateId: TemplateId
  eventName?: string
  date?: string
  location?: string
  mapsUrl?: string
  coverImage?: string
  accentColor?: string
  welcomeMessage?: string
  description?: string
  dressCode?: string
  timeline?: TimelineEntry[]
}

// Invitación de muestra real: reusa los mismos componentes que ve un
// invitado de verdad (InvitationThemeRoot, InvitationCard, ThemeOrnament,
// InviteDivider, EventMap), pero con datos del formulario en vivo cuando ya
// existen y datos de ejemplo cuando todavía no — así nunca se desincroniza
// del diseño real ni queda vacía mientras el anfitrión recién empieza a
// completar el formulario. El muro de comentarios es la única pieza no-real
// (estático, sin Firestore): postear acá escribiría bajo un eventId que no
// existe.
export function InvitationPreview({
  templateId,
  eventName,
  date,
  location,
  mapsUrl,
  coverImage,
  accentColor,
  welcomeMessage,
  description,
  dressCode,
  timeline,
}: InvitationPreviewProps) {
  const sample = PREVIEW_CONTENT[templateId]
  const name = eventName?.trim() || sample.eventName
  const shownDate = date?.trim() || sample.date
  const shownLocation = location?.trim() || sample.location

  // El mapa solo debe recargar el iframe cuando el anfitrión hace una
  // pausa al escribir el link, no en cada tecla.
  const deferredMapsUrl = useDeferredValue(mapsUrl)

  return (
    <InvitationThemeRoot
      templateId={templateId}
      accentOverride={accentColor}
      className="max-w-sm mx-auto px-4 py-8 text-center"
    >
      <InvitationCard coverImage={coverImage} coverAlt={name}>
        <h1 className="text-xl font-semibold">{name}</h1>
        <ThemeOrnament templateId={templateId} className="w-16 h-6 mx-auto mt-2 text-[var(--invite-accent)]" />
        <p className="text-sm mt-1 text-[var(--invite-text-muted)]">
          {shownDate} · {shownLocation}
        </p>
        {dressCode?.trim() && (
          <p className="text-xs mt-1 text-[var(--invite-text-muted)]">Vestimenta: {dressCode}</p>
        )}

        {description?.trim() && (
          <p className="mt-4 text-sm text-[var(--invite-text-muted)] leading-relaxed whitespace-pre-line text-center max-w-xs mx-auto">
            {description}
          </p>
        )}

        <p className="text-lg font-medium mt-6">{sample.guestName}</p>
        <div className="flex justify-center my-6">
          <div className="invite-qr-frame p-3 border rounded-lg inline-block" style={{ borderColor: 'var(--invite-border)' }}>
            <QRCodeCanvas value="https://paselink.app/vista-previa" size={180} marginSize={QR_QUIET_ZONE_MODULES} />
          </div>
        </div>
        <p className="text-sm text-[var(--invite-text-muted)]">Presenta este código QR en la entrada</p>

        <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
          <button
            type="button"
            disabled
            className="inline-flex items-center justify-center gap-2 text-white rounded-md px-4 py-2 text-sm font-medium opacity-90 bg-[var(--invite-accent)]"
          >
            <IconDownload className="w-4 h-4" /> Descargar pase
          </button>
          <button
            type="button"
            disabled
            className="inline-flex items-center justify-center gap-2 bg-[#25D366] text-white rounded-md px-4 py-2 text-sm font-medium opacity-90"
          >
            <IconWhatsApp className="w-4 h-4" /> Compartir
          </button>
        </div>

        {timeline && timeline.length > 0 && (
          <div className="mt-4 pt-4 text-left border-t" style={{ borderColor: 'var(--invite-border)' }}>
            <TimelineDisplay entries={timeline} />
          </div>
        )}

        {welcomeMessage?.trim() && (
          <p className="mt-5 pt-4 text-sm font-medium italic border-t text-[var(--invite-accent)]" style={{ borderColor: 'var(--invite-border)' }}>
            {welcomeMessage}
          </p>
        )}
      </InvitationCard>

      <InviteDivider templateId={templateId} />
      <EventMap mapsUrl={deferredMapsUrl} />

      <div className="mt-8 pt-6 border-t text-left" style={{ borderColor: 'var(--invite-border)' }}>
        <h2 className="text-lg font-bold mb-4 text-center text-[var(--invite-text)]">Muro del evento</h2>
        <div className="space-y-3">
          {PREVIEW_WALL_MESSAGES.map((msg) => (
            <div
              key={msg.authorName}
              className="border p-4 bg-[var(--invite-surface)] [border-radius:var(--invite-radius)]"
              style={{ borderColor: 'var(--invite-border)' }}
            >
              <p className="text-xs font-semibold mb-1 text-[var(--invite-text)]">{msg.authorName}</p>
              <p className="text-sm mb-3 text-[var(--invite-text)]">{msg.text}</p>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <span aria-hidden="true">👍❤️</span>
                <span>2</span>
              </div>
            </div>
          ))}
          <input
            disabled
            placeholder="Esto es una vista previa"
            className="w-full border rounded-md px-3 py-2 text-sm bg-transparent text-[var(--invite-text-muted)]"
            style={{ borderColor: 'var(--invite-border)' }}
          />
        </div>
      </div>
    </InvitationThemeRoot>
  )
}
