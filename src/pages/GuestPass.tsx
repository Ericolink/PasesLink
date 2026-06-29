import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import confetti from 'canvas-confetti'
import { getEvent } from '../firebase/events'
import { checkInGuest, claimGuestPass, findGuestByToken, setGuestPaymentStatus, setGuestRsvp } from '../firebase/guests'
import { useAuth } from '../hooks/useAuth'
import type { EventData, GuestData, RsvpStatus } from '../types'
import { IconAlertTriangle, IconCheckCircle, IconClock, IconDownload, IconHeart, IconTicket, IconWhatsApp } from '../components/Icons'
import { WallSection } from '../components/WallSection'
import { EventMap } from '../components/EventMap'
import { InvitationCard } from '../components/InvitationCard'
import { InvitationThemeRoot } from '../components/InvitationThemeRoot'
import { ThemeOrnament } from '../components/ThemeOrnament'
import { ThemeSeal } from '../components/ThemeSeal'
import { InviteDivider } from '../components/InviteDivider'
import { EventCountdown } from '../components/EventCountdown'
import { formatTime12h } from '../utils/time'
import { getTemplate } from '../templates/registry'
import { buildPassUrl } from '../utils/qrUrl'

// El navegador reutiliza la misma instancia de GuestPass al navegar entre dos
// URLs /pass/:eventId/:qrToken distintas (mismo patrón de ruta) — sin esta key,
// el estado de check-in del invitado anterior queda pegado al escanear el
// siguiente QR, mostrando "ya registrado" sin haber hecho el check-in real.
export function GuestPass() {
  const { qrToken } = useParams<{ qrToken: string }>()
  return <GuestPassInner key={qrToken} />
}

function GuestPassInner() {
  const { eventId, qrToken } = useParams<{ eventId: string; qrToken: string }>()
  const { user, loading: authLoading } = useAuth()
  const [event, setEvent] = useState<EventData | null>(null)
  const [guest, setGuest] = useState<GuestData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [locked, setLocked] = useState(false)
  const [rsvpSaving, setRsvpSaving] = useState(false)
  const [rsvpError, setRsvpError] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  const [showMaybeMessage, setShowMaybeMessage] = useState(false)
  const [checkInState, setCheckInState] = useState<'idle' | 'loading' | 'done' | 'already' | 'payment_required'>('idle')
  const [paymentSaving, setPaymentSaving] = useState(false)
  const qrWrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Esperar a que useAuth() confirme la sesión antes de decidir si el visor
    // es organizador o invitado público — si no, una carga fresca de la página
    // puede tratar momentáneamente al organizador como invitado anónimo
    // (auth.currentUser todavía no resuelto) y aplicarle el flujo de RSVP/lock
    // en vez del de check-in.
    if (!eventId || !qrToken || authLoading) return
    Promise.all([getEvent(eventId), findGuestByToken(eventId, qrToken)])
      .then(async ([eventData, guestData]) => {
        if (!eventData || !guestData) {
          setError(true)
          return
        }
        setEvent(eventData)

        // Si el visor es organizador o co-org, no aplicar lock — solo cargar el guest
        const viewerIsOrg = !!user && (
          user.uid === eventData.ownerId ||
          !!(eventData.coOrganizersMap && user.uid in eventData.coOrganizersMap)
        )
        if (viewerIsOrg) {
          setGuest(guestData)
          if (guestData.status === 'checked_in') setCheckInState('already')
          return
        }

        const storageKey = `paselink_lock_${eventId}_${qrToken}`
        const localToken = localStorage.getItem(storageKey) || crypto.randomUUID()
        const claimedToken = await claimGuestPass(eventId, guestData.id, localToken)
        if (claimedToken === localToken) {
          localStorage.setItem(storageKey, localToken)
          setGuest({ ...guestData, lockToken: claimedToken })
        } else {
          setGuest({ ...guestData, lockToken: claimedToken })
          setLocked(true)
        }
      })
      .catch((err) => {
        console.error('Error loading guest pass:', err)
        setError(true)
      })
      .finally(() => setLoading(false))
  }, [eventId, qrToken, user, authLoading])

  if (loading) return <p className="text-center text-gray-500 mt-16">Cargando…</p>
  if (error || !event || !guest || !eventId || !qrToken) {
    return <p className="text-center text-gray-500 mt-16">Pase no encontrado.</p>
  }

  const isOrg = !!user && (
    user.uid === event.ownerId ||
    !!(event.coOrganizersMap && user.uid in event.coOrganizersMap)
  )
  const passUrl = buildPassUrl(eventId, qrToken)

  async function handleCheckIn() {
    if (!eventId || !qrToken || !user) return
    setCheckInState('loading')
    const result = await checkInGuest(eventId, qrToken, user.uid, user.email)
    if (result.status === 'success') {
      setGuest((g) => g ? { ...g, status: 'checked_in' } : g)
      setCheckInState('done')
      const tpl = getTemplate(event!.templateId).vars
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.5 },
        colors: [event!.accentColor || tpl.accent, tpl.accentDark, tpl.accentSoft],
        shapes: tpl.confettiShape ? [tpl.confettiShape] : undefined,
      })
    } else if (result.status === 'already_checked_in') {
      setCheckInState('already')
    } else if (result.status === 'payment_required') {
      setCheckInState('payment_required')
    }
  }

  async function handleTogglePayment() {
    if (!eventId || !guest) return
    setPaymentSaving(true)
    try {
      const next = guest.paymentStatus === 'paid' ? 'unpaid' : 'paid'
      await setGuestPaymentStatus(eventId, guest.id, next)
      setGuest((g) => g ? { ...g, paymentStatus: next } : g)
      if (checkInState === 'payment_required' && next === 'paid') setCheckInState('idle')
    } finally {
      setPaymentSaving(false)
    }
  }

  // Vista del organizador: solo check-in, sin lock ni RSVP
  if (isOrg) {
    return (
      <InvitationThemeRoot
        templateId={event.templateId}
        accentOverride={event.accentColor}
        className="max-w-sm mx-auto px-4 py-12 text-center"
      >
        <InvitationCard>
          <p className="text-xs uppercase tracking-wide mb-4 text-[var(--invite-text-muted)]">Modo organizador</p>
          <h1 className="text-xl font-semibold">{guest.name}</h1>
          {guest.companions.length > 0 && (
            <p className="text-sm mt-1 text-[var(--invite-text-muted)]">+ {guest.companions.length} acompañante(s)</p>
          )}
          <p className="text-sm mt-1 text-[var(--invite-text-muted)]">{event.name}</p>

          {event.requiresPayment && (
            <div className="mt-4 flex flex-col items-center gap-2">
              {guest.paymentStatus === 'paid' && <ThemeSeal templateId={event.templateId} />}
              <span
                className={`inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full font-medium ${
                  guest.paymentStatus === 'paid' ? 'invite-badge-positive bg-[var(--invite-accent-soft)] text-[var(--invite-accent-dark)]' : 'bg-amber-100 text-amber-700'
                }`}
              >
                <IconTicket className={`w-4 h-4 ${guest.paymentStatus === 'paid' ? 'text-green-500' : ''}`} />
                {guest.paymentStatus === 'paid'
                  ? 'Pago confirmado'
                  : `Debe ${event.currency}${(event.ticketPrice * (1 + guest.companions.length)).toLocaleString('es')}`}
              </span>
              <button
                onClick={handleTogglePayment}
                disabled={paymentSaving}
                className="text-sm font-medium disabled:opacity-50 text-[var(--invite-accent)]"
              >
                {guest.paymentStatus === 'paid' ? 'Marcar como no pagado' : 'Marcar como pagado'}
              </button>
            </div>
          )}

          {checkInState !== 'done' && (
            <div className="flex justify-center my-6">
              <div
                className="p-4 border rounded-lg max-w-[250px] max-h-[250px] overflow-hidden flex items-center justify-center"
                style={{ borderColor: 'var(--invite-border)' }}
              >
                <QRCodeCanvas value={passUrl} size={200} marginSize={2} />
              </div>
            </div>
          )}

          <div className="mt-8">
            {checkInState === 'done' && (
              <div className="flex flex-col items-center gap-3">
                <ThemeSeal templateId={event.templateId} />
                <span className="invite-badge-icon">
                  <IconCheckCircle className="w-16 h-16 text-green-500" />
                </span>
                <p className="text-lg font-semibold text-[var(--invite-text)]">¡Entrada registrada!</p>
                {event.welcomeMessage && (
                  <p className="text-sm italic text-[var(--invite-text-muted)]">{event.welcomeMessage}</p>
                )}
              </div>
            )}
            {checkInState === 'already' && (
              <div className="flex flex-col items-center gap-3">
                <IconAlertTriangle className="w-14 h-14 text-amber-400" />
                <p className="text-base font-semibold text-amber-600">Ya registrado</p>
                <p className="text-sm text-[var(--invite-text-muted)]">Este invitado ya hizo check-in anteriormente.</p>
              </div>
            )}
            {checkInState === 'payment_required' && (
              <p className="text-sm text-amber-600 mb-3">Cobra la entrada y marcá el pago antes de registrar el ingreso.</p>
            )}
            {(checkInState === 'idle' || checkInState === 'loading' || checkInState === 'payment_required') && (
              <button
                onClick={handleCheckIn}
                disabled={checkInState === 'loading' || (event.requiresPayment && guest.paymentStatus !== 'paid')}
                className="w-full text-white rounded-xl py-4 text-lg font-bold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 bg-[var(--invite-accent)]"
              >
                {checkInState === 'loading' ? 'Registrando…' : 'Registrar entrada'}
              </button>
            )}
          </div>
        </InvitationCard>
      </InvitationThemeRoot>
    )
  }

  async function handleRsvp(rsvpStatus: RsvpStatus) {
    if (!guest) return
    setRsvpSaving(true)
    setRsvpError(null)
    try {
      await setGuestRsvp(eventId!, qrToken!, rsvpStatus)
      // Solo se actualiza el estado local después de confirmar que Firestore
      // guardó el cambio — si la escritura falla, el invitado se queda en el
      // estado anterior y ve el error en vez de una confirmación falsa.
      setGuest({ ...guest, rsvpStatus })
    } catch (err) {
      console.error('Error guardando RSVP:', err)
      setRsvpError('No se guardó. Intenta de nuevo.')
    } finally {
      setRsvpSaving(false)
    }
  }

  function handleDownload() {
    const canvas = qrWrapperRef.current?.querySelector('canvas')
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `pase-${guest!.name.replace(/\s+/g, '_')}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 2000)
  }

  return (
    <InvitationThemeRoot
      templateId={event.templateId}
      accentOverride={event.accentColor}
      className="max-w-sm mx-auto px-4 py-12 text-center"
    >
      {/* La portada es opcional: si no hay imagen, .invite-cover colapsa a 0
          (ver templates.css) y el título queda como primer elemento visible
          — sin logo de PaseLink ni ningún otro relleno reservando espacio. */}
      <InvitationCard coverImage={event.coverImage} coverAlt={event.name}>
        <h1 className="text-xl font-semibold">{event.name}</h1>
        <ThemeOrnament templateId={event.templateId} className="w-16 h-6 mx-auto mt-2 text-[var(--invite-accent)]" />
        <p className="text-sm mt-1 text-[var(--invite-text-muted)]">
          {event.date} · {event.location}
        </p>
        {event.startTime && (
          <p className="text-2xl font-bold mt-1 text-[var(--invite-accent)]">
            {formatTime12h(event.startTime)}{event.endTime && ` – ${formatTime12h(event.endTime)}`}
          </p>
        )}
        <EventCountdown
          date={event.date}
          startTime={event.startTime}
          endTime={event.endTime}
          className="text-sm font-medium mt-1 text-[var(--invite-text-muted)]"
        />

        {locked && (
          <div className="py-8">
            <IconAlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-400" />
            <p className="font-medium">Esta invitación ya fue abierta</p>
            <p className="text-sm mt-2 text-[var(--invite-text-muted)]">
              Por seguridad, este pase solo puede abrirse desde el dispositivo donde se usó por primera vez. Si crees
              que es un error, contacta al organizador del evento.
            </p>
          </div>
        )}

        {/* El invitado solo ve su propio QR después de confirmar que asistirá.
            El organizador puede verlo/escanearlo igual desde su propia vista
            (más abajo en este archivo), sin depender del RSVP del invitado. */}
        {!locked && guest.rsvpStatus === 'yes' && (
          <>
            <p className="text-lg font-medium mt-6">{guest.name}</p>
            {guest.companions.length > 0 && (
              <p className="text-sm text-[var(--invite-text-muted)]">+ {guest.companions.length} acompañante(s)</p>
            )}

            <div className="flex justify-center my-6" ref={qrWrapperRef}>
              <div
                className="p-4 border rounded-lg max-w-[250px] max-h-[250px] overflow-hidden flex items-center justify-center"
                style={{ borderColor: 'var(--invite-border)' }}
              >
                <QRCodeCanvas value={passUrl} size={200} marginSize={2} />
              </div>
            </div>

            {guest.status === 'checked_in' ? (
              <span className="mt-2 inline-flex items-center gap-2">
                <ThemeSeal templateId={event.templateId} />
                <p className="invite-badge-positive inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full font-medium bg-[var(--invite-accent-soft)] text-[var(--invite-accent-dark)]">
                  <IconCheckCircle className="w-4 h-4 text-green-500" /> Entrada registrada
                </p>
              </span>
            ) : (
              <p className="text-sm text-[var(--invite-text-muted)]">Presenta este código QR en la entrada</p>
            )}

            <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={handleDownload}
                className="inline-flex items-center justify-center gap-2 text-white rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity bg-[var(--invite-accent)]"
              >
                {downloaded ? <IconCheckCircle className="w-4 h-4" /> : <IconDownload className="w-4 h-4" />}
                {downloaded ? 'Descargado' : 'Descargar QR'}
              </button>
              {guest.companions.length > 0 && (
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Aquí está mi pase para ${event.name}: ${passUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Comparte con tus acompañantes"
                  className="inline-flex items-center justify-center gap-2 bg-[#25D366] text-white rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  <IconWhatsApp className="w-4 h-4" /> Compartir
                </a>
              )}
            </div>
          </>
        )}

        {!locked && guest.rsvpStatus === 'no' && (
          <div className="py-8">
            <IconHeart className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Qué lástima, ¡te vamos a extrañar!</p>
            <p className="text-sm mt-2 text-[var(--invite-text-muted)]">
              Registramos que no podrás asistir. Si cambias de opinión, contacta al organizador del evento para que
              te genere un nuevo pase.
            </p>
          </div>
        )}

        {!locked && guest.rsvpStatus === 'pending' && !showMaybeMessage && (
          <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--invite-border)' }}>
            <p className="text-lg font-medium mb-1">{guest.name}</p>
            {guest.companions.length > 0 && (
              <p className="text-sm mb-3 text-[var(--invite-text-muted)]">+ {guest.companions.length} acompañante(s)</p>
            )}
            <p className="text-sm font-medium mb-3 mt-3">¿Asistirás a este evento?</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleRsvp('yes')}
                disabled={rsvpSaving}
                className="text-white rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 bg-[var(--invite-accent)]"
              >
                Sí, asistiré
              </button>
              <button
                onClick={() => handleRsvp('no')}
                disabled={rsvpSaving}
                className="border rounded-md px-4 py-2 text-sm font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
                style={{ borderColor: 'var(--invite-border)' }}
              >
                No podré asistir
              </button>
              <button
                onClick={() => setShowMaybeMessage(true)}
                disabled={rsvpSaving}
                className="text-sm font-medium transition-colors disabled:opacity-50 text-[var(--invite-text-muted)] hover:text-[var(--invite-text)]"
              >
                Aún no lo sé
              </button>
            </div>
            {rsvpError && <p className="text-sm text-red-500 mt-3">{rsvpError}</p>}
          </div>
        )}

        {!locked && guest.rsvpStatus === 'pending' && showMaybeMessage && (
          <div className="mt-6 pt-6 py-2 border-t" style={{ borderColor: 'var(--invite-border)' }}>
            <IconClock className="w-8 h-8 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Ok, tómate tu tiempo</p>
            <p className="text-sm mt-2 mb-4 text-[var(--invite-text-muted)]">
              Tu invitación queda pendiente. Vuelve a este enlace cuando quieras para confirmar tu asistencia.
            </p>
            <button onClick={() => setShowMaybeMessage(false)} className="text-sm font-medium text-[var(--invite-accent)]">
              Responder ahora
            </button>
          </div>
        )}

        {!locked && event.requiresPayment && guest.rsvpStatus !== 'no' && (
          <div className="mt-5 pt-4 text-left border-t" style={{ borderColor: 'var(--invite-border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 text-[var(--invite-text-muted)]">Pago de entrada</p>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-sm">
                Monto a pagar: <strong>{event.currency}{(event.ticketPrice * (1 + guest.companions.length)).toLocaleString('es')}</strong>
              </span>
              <span className="inline-flex items-center gap-2 shrink-0">
                {guest.paymentStatus === 'paid' && <ThemeSeal templateId={event.templateId} />}
                <span
                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                    guest.paymentStatus === 'paid' ? 'invite-badge-positive bg-[var(--invite-accent-soft)] text-[var(--invite-accent-dark)]' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  <IconTicket className={`w-3.5 h-3.5 ${guest.paymentStatus === 'paid' ? 'text-green-500' : ''}`} />
                  {guest.paymentStatus === 'paid' ? 'Pagado' : 'Pendiente'}
                </span>
              </span>
            </div>
            {event.paymentInstructions && (
              <p className="text-sm whitespace-pre-line text-[var(--invite-text-muted)]">{event.paymentInstructions}</p>
            )}
          </div>
        )}

        {event.welcomeMessage && (
          <p className="mt-5 pt-4 text-sm font-medium italic border-t text-[var(--invite-accent)]" style={{ borderColor: 'var(--invite-border)' }}>
            {event.welcomeMessage}
          </p>
        )}
      </InvitationCard>
      {event.mapsUrl && (
        <>
          <InviteDivider templateId={event.templateId} />
          <EventMap mapsUrl={event.mapsUrl} />
        </>
      )}
      {eventId && (
        guest.rsvpStatus === 'yes' ? (
          <WallSection eventId={eventId} isPremium={event?.plan === 'premium'} guestName={guest.name} templateId={event.templateId} />
        ) : !locked && (
          <div className="mt-8 pt-6 border-t text-center" style={{ borderColor: 'var(--invite-border)' }}>
            <p className="text-sm text-[var(--invite-text-muted)]">Confirma tu asistencia para ver el muro del evento.</p>
          </div>
        )
      )}
    </InvitationThemeRoot>
  )
}
