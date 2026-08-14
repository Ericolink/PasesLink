import type { ReactNode, RefObject } from 'react'
import { InvitationThemeRoot } from '../InvitationThemeRoot'
import { WallSection } from '../WallSection'
import { Logo } from '../Logo'
import {
  CustomInfoSection,
  EventInformationPanel,
  FAQSection,
  GeneralInfoSection,
  GiftSection,
  LocationSection,
  ScheduleSection,
  TransportationSection,
} from '../EventInfoPanel'
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll'
import { usePaymentProof } from '../../hooks/usePaymentProof'
import type { EventData, GuestData, RsvpStatus } from '../../types'
import { InvitationPass } from './InvitationPass'
import { InvitationEventInfoCard } from './InvitationEventInfoCard'
import { InvitationMenu } from './InvitationMenu'
import { InvitationGuestInfo } from './InvitationGuestInfo'
import { InvitationScrollCue } from './InvitationScrollCue'
import { InvitationAccountFab } from './InvitationAccountFab'

interface Props {
  event: EventData
  guest: GuestData
  eventId: string
  qrToken: string
  passUrl: string
  deviceToken: string | null
  hasAccount: boolean
  ticketRef: RefObject<HTMLDivElement | null>
  downloaded: boolean
  onDownload: () => void
  onAddToCalendar: () => void
  rsvpSaving: boolean
  rsvpError: string | null
  onRsvp: (status: RsvpStatus, opts?: { skipSignupPrompt?: boolean }) => void
  proof: ReturnType<typeof usePaymentProof>
  cancelSaving: boolean
  cancelError: string | null
  onCancelAttendance: () => void
  onGuestSaved: (patch: Partial<GuestData>) => void
}

// Experiencia de invitación rediseñada — hoy solo Fiesta Improvisada (ver
// INVITATION_REDESIGN_PLAN). 100% presentacional: recibe los mismos
// handlers/estado que ya calcula GuestPassInner (RSVP, pago, cancelación,
// edición, descarga) — ninguna lógica de negocio se duplica acá, solo
// cambia el orden y la presentación visual respecto de las otras 6
// plantillas (ver GuestPass.tsx).
//
// Orden (brief §18): pase (título → QR → identidad) → info principal
// (fecha/hora/lugar/vestimenta + countdown) → información general →
// ubicación → menú → datos del invitado → historias + comunidad → footer.
export function HousePartyPassLayout({
  event,
  guest,
  eventId,
  qrToken,
  passUrl,
  deviceToken,
  hasAccount,
  ticketRef,
  downloaded,
  onDownload,
  onAddToCalendar,
  rsvpSaving,
  rsvpError,
  onRsvp,
  proof,
  cancelSaving,
  cancelError,
  onCancelAttendance,
  onGuestSaved,
}: Props) {
  // La barra flotante de cuenta (ver InvitationAccountFab) tapa la franja
  // superior de la pantalla mientras está visible — se reserva ese espacio
  // con un spacer al principio (no un pt-* que compita con el padding-top
  // que ya trae py-12 acá abajo) para que el título del pase no arranque
  // tapado, mismo criterio que AppShell.tsx usa para BottomTabBar (pero
  // arriba en vez de abajo).
  const showAccountFab = !hasAccount && guest.rsvpStatus !== 'no'

  return (
    <>
    <InvitationThemeRoot
      templateId={event.templateId}
      accentOverride={event.accentColor}
      themeOverrides={event.themeOverrides}
      communityTemplateVars={event.communityTemplateSnapshot?.vars}
      className="max-w-sm mx-auto px-4 py-12 text-center space-y-4"
    >
      {showAccountFab && <div aria-hidden="true" style={{ height: 'calc(4rem + env(safe-area-inset-top))' }} />}
      <InvitationPass
        event={event}
        guest={guest}
        eventId={eventId}
        passUrl={passUrl}
        deviceToken={deviceToken}
        hasAccount={hasAccount}
        ticketRef={ticketRef}
        downloaded={downloaded}
        onDownload={onDownload}
        onAddToCalendar={onAddToCalendar}
        rsvpSaving={rsvpSaving}
        rsvpError={rsvpError}
        onRsvp={onRsvp}
        proof={proof}
        cancelSaving={cancelSaving}
        cancelError={cancelError}
        onCancelAttendance={onCancelAttendance}
        onGuestSaved={onGuestSaved}
      />

      <Reveal>
        <InvitationEventInfoCard event={event} />
      </Reveal>

      <InvitationScrollCue />

      <Reveal>
        <GeneralInfoSection event={event} guest={guest} variant="flat" />
      </Reveal>

      <Reveal>
        <LocationSection event={event} guest={guest} variant="flat" />
      </Reveal>

      {/* Transporte/FAQ/cronograma/regalo/secciones libres: mismo acordeón
          reducido que ya usan las otras 6 plantillas (EventInformationPanel
          decide solo si tiene contenido) — no se fuerzan a "flat" acá
          porque el brief solo pide visible sin acordeón la info general y
          la ubicación (ver INVITATION_REDESIGN_PLAN, "Qué NO se rediseña").
          El título va afuera de la tarjeta con borde (hideTitle), mismo
          tratamiento que ya tiene "Comunidad" en WallSection, en vez de
          compartir caja con el acordeón. */}
      <Reveal>
        <h2 className="invite-section-title text-lg font-bold text-[var(--invite-text)] text-left px-1">
          Información del evento
        </h2>
        <EventInformationPanel hideTitle>
          <TransportationSection event={event} guest={guest} />
          <FAQSection event={event} guest={guest} />
          <ScheduleSection event={event} guest={guest} />
          <GiftSection event={event} />
          {event.sections?.map((s) => (
            <CustomInfoSection key={s.id} section={s} guest={guest} />
          ))}
        </EventInformationPanel>
      </Reveal>

      <Reveal>
        <InvitationMenu event={event} guest={guest} eventId={eventId} lockToken={deviceToken} />
      </Reveal>

      <Reveal>
        <InvitationGuestInfo event={event} guest={guest} eventId={eventId} deviceToken={deviceToken} onGuestSaved={onGuestSaved} />
      </Reveal>

      {guest.rsvpStatus === 'yes' ? (
        <WallSection
          eventId={eventId}
          eventName={event.name}
          guestName={guest.name}
          guestToken={qrToken}
          templateId={event.templateId}
          title="Comunidad"
          composerCta="Publicar"
          showTypeSelector={false}
          composerPlaceholder="Escribe tu mensaje…"
        />
      ) : (
        <p className="text-sm text-[var(--invite-text-muted)] pt-6 border-t" style={{ borderColor: 'var(--invite-border)' }}>
          Confirma tu asistencia para ver la comunidad del evento.
        </p>
      )}

      <footer className="pt-6 pb-2">
        <Logo variant="invite" className="h-6 mx-auto opacity-70" />
      </footer>

    </InvitationThemeRoot>

    {/* Fuera de InvitationThemeRoot a propósito: su wrapper interno lleva
        una clase de animación de entrada (enterAnimation) cuyo
        animation-fill-mode:both deja `transform: translateY(0)` aplicado
        para siempre después de terminar — CUALQUIER transform en un
        ancestro convierte a ese ancestro en el "containing block" de un
        descendiente position:fixed (spec CSS), así que este botón quedaba
        fijo respecto de esa tarjeta (al final del scroll) en vez de
        respecto del viewport (bug reportado: "no te va siguiendo mientras
        scrolleas"). Como hermano, sin ningún transform de por medio, sí es
        realmente sticky al viewport — el tema visual (--invite-*) le
        sigue llegando igual porque InvitationThemeRoot también las espeja
        en document.documentElement (ver ese componente). */}
    {showAccountFab && <InvitationAccountFab eventId={eventId} guest={guest} />}
    </>
  )
}

function Reveal({ children }: { children: ReactNode }) {
  const { ref, className } = useRevealOnScroll<HTMLDivElement>()
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
