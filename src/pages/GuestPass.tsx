import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { getEvent } from '../firebase/events'
import { findGuestByToken } from '../firebase/guests'
import type { EventData, GuestData } from '../types'
import { Logo } from '../components/Logo'

export function GuestPass() {
  const { eventId, qrToken } = useParams<{ eventId: string; qrToken: string }>()
  const [event, setEvent] = useState<EventData | null>(null)
  const [guest, setGuest] = useState<GuestData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

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
  if (error || !event || !guest) {
    return <p className="text-center text-gray-500 mt-16">Pase no encontrado.</p>
  }

  const passUrl = `${window.location.origin}/pass/${eventId}/${qrToken}`

  return (
    <div className="max-w-sm mx-auto px-4 py-12 text-center">
      <div className="flex justify-center mb-6">
        <Logo />
      </div>
      <div className="border border-gray-200 rounded-xl bg-white p-6 shadow-sm">
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

        {guest.status === 'checked_in' ? (
          <p className="mt-2 inline-block text-sm px-3 py-1 rounded-full font-medium bg-green-100 text-green-700">
            ✓ Asistencia confirmada
          </p>
        ) : (
          <p className="mt-2 text-sm text-gray-500">Presenta este código QR en la entrada</p>
        )}
      </div>
    </div>
  )
}
