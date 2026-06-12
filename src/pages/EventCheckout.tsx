import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getEvent, markEventPaid } from '../firebase/events'
import type { EventData } from '../types'
import { PlanBadge } from '../components/PlanBadge'

const PLAN_PRICES: Record<string, string> = {
  basic: '$9',
  premium: '$19',
}

export function EventCheckout() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const [event, setEvent] = useState<EventData | null>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    if (!eventId) return
    getEvent(eventId).then((data) => {
      setEvent(data)
      setLoading(false)
    })
  }, [eventId])

  async function handlePay() {
    if (!eventId) return
    setPaying(true)
    await markEventPaid(eventId)
    navigate(`/events/${eventId}`)
  }

  if (loading) return <p className="text-center text-gray-500 mt-16">Cargando...</p>
  if (!event) return <p className="text-center text-gray-500 mt-16">Evento no encontrado.</p>

  if (event.paymentStatus === 'paid') {
    navigate(`/events/${event.id}`, { replace: true })
    return null
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6 text-center">Confirmar pago</h1>
      <div className="border border-gray-200 rounded-lg p-5 bg-white space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-medium text-gray-900">{event.name}</span>
          <PlanBadge plan={event.plan} />
        </div>
        <p className="text-sm text-gray-500">
          {event.date} · {event.location}
        </p>
        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
          <span className="text-sm text-gray-600">Total a pagar (pago único)</span>
          <span className="text-lg font-semibold text-gray-900">{PLAN_PRICES[event.plan]}</span>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-3 text-center">
        Pago simulado para esta versión inicial. Aquí se integrará la pasarela de pago.
      </p>

      <button
        onClick={handlePay}
        disabled={paying}
        className="w-full mt-6 bg-primary text-white rounded-md py-2.5 font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
      >
        {paying ? 'Procesando...' : 'Pagar y activar evento'}
      </button>
    </div>
  )
}
