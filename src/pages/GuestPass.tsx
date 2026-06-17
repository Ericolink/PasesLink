import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { getEvent } from '../firebase/events'
import { claimGuestPass, findGuestByToken, setGuestRsvp } from '../firebase/guests'
import type { EventData, GuestData, RsvpStatus } from '../types'
import { Logo } from '../components/Logo'
import { IconAlertTriangle, IconCheckCircle, IconClock, IconDownload, IconHeart } from '../components/Icons'
import { WallSection } from '../components/WallSection'
import { EventMap } from '../components/EventMap'

export function GuestPass() {
  const { eventId, qrToken } = useParams<{ eventId: string; qrToken: string }>()
  const [event, setEvent] = useState<EventData | null>(null)
  const [guest, setGuest] = useState<GuestData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [locked, setLocked] = useState(false)
  const [rsvpSaving, setRsvpSaving] = useState(false)
  const [showMaybeMessage, setShowMaybeMessage] = useState(false)
  const qrWrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!eventId || !qrToken) return
    Promise.all([getEvent(eventId), findGuestByToken(eventId, qrToken)])
      .then(async ([eventData, guestData]) => {
        if (!eventData || !guestData) {
          setError(true)
          return
        }
        setEvent(eventData)

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
  }, [eventId, qrToken])

  if (loading) return <p className="text-center text-gray-500 mt-16">Cargando...</p>
  if (error || !event || !guest || !eventId || !qrToken) {
    return <p className="text-center text-gray-500 mt-16">Pase no encontrado.</p>
  }

  const passUrl = `${window.location.origin}/pass/${eventId}/${qrToken}`
  const accentColor = event.accentColor || ''

  async function handleRsvp(rsvpStatus: RsvpStatus) {
    if (!guest) return
    setRsvpSaving(true)
    try {
      await setGuestRsvp(eventId!, qrToken!, rsvpStatus)
      setGuest({ ...guest, rsvpStatus })
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
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-12 text-center animate-fade-in">
      {!event.coverImage && (
        <div className="flex justify-center mb-6">
          <Logo />
        </div>
      )}
      <div
        className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm overflow-hidden"
        style={accentColor ? { borderTopWidth: '4px', borderTopColor: accentColor } : undefined}
      >
        {event.coverImage && (
          <div className="w-full h-36 overflow-hidden">
            <img src={event.coverImage} alt={event.name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-6">
        <h1 className="text-xl font-semibold text-gray-900">{event.name}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {event.date} · {event.location}
        </p>

        {locked && (
          <div className="py-8">
            <IconAlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-400" />
            <p className="text-gray-900 font-medium">Esta invitación ya fue abierta</p>
            <p className="text-sm text-gray-500 mt-2">
              Por seguridad, este pase solo puede abrirse desde el dispositivo donde se usó por primera vez. Si crees
              que es un error, contacta al organizador del evento.
            </p>
          </div>
        )}

        {!locked && guest.rsvpStatus === 'yes' && (
          <>
            <p className="text-lg font-medium text-gray-900 mt-6">{guest.name}</p>
            {guest.companions > 0 && (
              <p className="text-sm text-gray-500">+ {guest.companions} acompañante(s)</p>
            )}

            <div className="flex justify-center my-6" ref={qrWrapperRef}>
              <div className="p-3 border border-gray-100 rounded-lg inline-block">
                <QRCodeCanvas value={passUrl} size={220} />
              </div>
            </div>

            {guest.status === 'checked_in' ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full font-medium bg-green-100 text-green-700">
                <IconCheckCircle className="w-4 h-4" /> Asistencia confirmada
              </p>
            ) : (
              <p className="text-sm text-gray-500">Presenta este código QR en la entrada</p>
            )}

            <button
              onClick={handleDownload}
              style={accentColor ? { backgroundColor: accentColor } : undefined}
              className="mt-4 inline-flex items-center gap-2 bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              <IconDownload className="w-4 h-4" /> Descargar QR
            </button>
          </>
        )}

        {!locked && guest.rsvpStatus === 'no' && (
          <div className="py-8">
            <IconHeart className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-900 font-medium">Qué lástima, ¡te vamos a extrañar!</p>
            <p className="text-sm text-gray-500 mt-2">
              Registramos que no podrás asistir. Si cambias de opinión, contacta al organizador del evento para que
              te genere un nuevo pase.
            </p>
          </div>
        )}

        {!locked && guest.rsvpStatus === 'pending' && !showMaybeMessage && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-lg font-medium text-gray-900 mb-1">{guest.name}</p>
            {guest.companions > 0 && (
              <p className="text-sm text-gray-500 mb-3">+ {guest.companions} acompañante(s)</p>
            )}
            <p className="text-sm font-medium text-gray-900 mb-3 mt-3">¿Asistirás a este evento?</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleRsvp('yes')}
                disabled={rsvpSaving}
                style={accentColor ? { backgroundColor: accentColor } : undefined}
                className="bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                Sí, asistiré
              </button>
              <button
                onClick={() => handleRsvp('no')}
                disabled={rsvpSaving}
                className="border border-gray-300 rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                No podré asistir
              </button>
              <button
                onClick={() => setShowMaybeMessage(true)}
                disabled={rsvpSaving}
                className="text-sm text-gray-500 font-medium hover:text-gray-700 transition-colors disabled:opacity-50"
              >
                Aún no lo sé
              </button>
            </div>
          </div>
        )}

        {!locked && guest.rsvpStatus === 'pending' && showMaybeMessage && (
          <div className="mt-6 pt-6 border-t border-gray-100 py-2">
            <IconClock className="w-8 h-8 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-900 font-medium">Ok, tómate tu tiempo</p>
            <p className="text-sm text-gray-500 mt-2 mb-4">
              Tu invitación queda pendiente. Vuelve a este enlace cuando quieras para confirmar tu asistencia.
            </p>
            <button onClick={() => setShowMaybeMessage(false)} className="text-sm text-primary font-medium">
              Responder ahora
            </button>
          </div>
        )}

        {event.welcomeMessage && (
          <p
            className="mt-5 pt-4 border-t border-gray-100 text-sm font-medium italic"
            style={accentColor ? { color: accentColor } : { color: '#2563eb' }}
          >
            {event.welcomeMessage}
          </p>
        )}
        </div>
      </div>
      {event.location && (
        <EventMap location={event.location} mapsUrl={event.mapsUrl} />
      )}
      {eventId && (
        <WallSection eventId={eventId} isPremium={event?.plan === 'premium'} guestName={guest.name} />
      )}
    </div>
  )
}
