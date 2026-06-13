import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { getEvent } from '../firebase/events'
import { findGuestByToken, setGuestRsvp } from '../firebase/guests'
import type { EventData, GuestData, RsvpStatus } from '../types'
import { Logo } from '../components/Logo'

export function GuestPass() {
  const { eventId, qrToken } = useParams<{ eventId: string; qrToken: string }>()
  const [event, setEvent] = useState<EventData | null>(null)
  const [guest, setGuest] = useState<GuestData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [rsvpSaving, setRsvpSaving] = useState(false)

  useEffect(() => {
    if (!eventId || !qrToken) return
    Promise.all([getEvent(eventId), findGuestByToken(eventId, qrToken)])
      .then(([eventData, guestData]) => {
        if (!eventData || !guestData) {
          setError(true)
        } else {
          setEvent(eventData)
          setGuest(guestData)
        }
      })
      .catch(() => setError(true))
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

  return (
    <div className="max-w-sm mx-auto px-4 py-12 text-center">
      <div className="flex justify-center mb-6">
        {event.logoUrl ? (
          <img src={event.logoUrl} alt={event.name} className="h-12 object-contain" />
        ) : (
          <Logo />
        )}
      </div>
      <div
        className="border border-gray-200 rounded-xl bg-white p-6 shadow-sm"
        style={accentColor ? { borderTopWidth: '4px', borderTopColor: accentColor } : undefined}
      >
        <h1 className="text-xl font-semibold text-gray-900">{event.name}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {event.date} · {event.location}
        </p>

        <div className="flex justify-center my-6">
          <div className="p-3 border border-gray-100 rounded-lg inline-block">
            <QRCodeSVG value={passUrl} size={200} />
          </div>
        </div>

        <p className="text-lg font-medium text-gray-900">{guest.name}</p>
        {guest.companions > 0 && (
          <p className="text-sm text-gray-500">+ {guest.companions} acompañante(s)</p>
        )}

        {guest.status === 'checked_in' ? (
          <p className="mt-2 inline-block text-sm px-3 py-1 rounded-full font-medium bg-green-100 text-green-700">
            ✓ Asistencia confirmada
          </p>
        ) : (
          <p className="mt-2 text-sm text-gray-500">Presenta este código QR en la entrada</p>
        )}

        <div className="mt-6 pt-6 border-t border-gray-100">
          {guest.rsvpStatus === 'pending' ? (
            <>
              <p className="text-sm font-medium text-gray-900 mb-3">¿Vas a asistir?</p>
              <div className="flex gap-2 justify-center">
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
                  No podré ir
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">
              {guest.rsvpStatus === 'yes' ? '✓ Confirmaste tu asistencia.' : 'Indicaste que no podrás asistir.'}{' '}
              <button onClick={() => handleRsvp('pending')} className="text-primary font-medium">
                Cambiar respuesta
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
