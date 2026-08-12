import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getEvent } from '../firebase/events'
import { acceptConcessionsStaffInvite } from '../firebase/concessionsStaffInvites'
import { useAuth } from '../hooks/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { ScreenHeader } from '../components/ScreenHeader'
import { CrownLoader } from '../components/CrownLoader'
import { AccessibleButton } from '../components/accessibility/AccessibleButton'
import { IconBan, IconCheckCircle, IconShoppingCart } from '../components/accessibility/AccessibleIcon'
import { formatDate } from '../utils/time'
import type { EventData } from '../types'

type Outcome = 'success' | 'already_member' | 'expired' | 'used' | 'not_found' | 'error'

const OUTCOME_MESSAGE: Record<Exclude<Outcome, 'success' | 'already_member'>, string> = {
  expired: 'Este enlace de invitación venció. Pídele al organizador que genere uno nuevo.',
  used: 'Este enlace ya fue usado. Si crees que es un error, pídele al organizador que genere uno nuevo.',
  not_found: 'No encontramos esta invitación. Puede que el enlace esté incompleto o ya no exista.',
  error: 'No pudimos procesar la invitación. Intenta de nuevo en unos minutos.',
}

const ROLE_LABEL = { cashier: 'caja', prep: 'preparación' } as const

// Pantalla de aceptación del enlace de invitación de encargado de "Ventas
// del evento" (caja/preparación) — mismo patrón que
// AcceptCoOrganizerInvite.tsx. Detrás de ProtectedRoute (ver App.tsx): sin
// sesión, redirige a /login conservando este mismo destino (state.from), así
// que acá siempre hay un `user` disponible antes de intentar canjear el
// token.
export function AcceptConcessionsStaffInvite() {
  const { eventId, token } = useParams<{ eventId: string; token: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [event, setEvent] = useState<EventData | null | undefined>(undefined)
  const [accepting, setAccepting] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [role, setRole] = useState<'cashier' | 'prep' | null>(null)

  useDocumentTitle(event ? `Invitación · ${event.name}` : 'Invitación de encargado')

  useEffect(() => {
    if (!eventId) return
    getEvent(eventId).then(setEvent)
  }, [eventId])

  async function handleAccept() {
    if (!eventId || !token) return
    setAccepting(true)
    try {
      const result = await acceptConcessionsStaffInvite(eventId, token)
      setOutcome(result.status)
      if (result.status === 'success' || result.status === 'already_member') {
        setRole(result.role)
        navigate(`/events/${eventId}/kitchen`, { replace: true })
      }
    } catch {
      setOutcome('error')
    } finally {
      setAccepting(false)
    }
  }

  if (!eventId || !token) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 text-center">
        <IconBan className="w-10 h-10 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600 dark:text-gray-400">Este enlace de invitación no es válido.</p>
      </div>
    )
  }

  if (event === undefined) {
    return <CrownLoader />
  }

  if (event === null) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 text-center">
        <IconBan className="w-10 h-10 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600 dark:text-gray-400">No encontramos este evento.</p>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <ScreenHeader title="Invitación de encargado" backTo="/dashboard" />

      <div className="border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800 overflow-hidden">
        {event.coverImage && (
          <div className="h-36 overflow-hidden">
            <img src={event.coverImage} alt={event.name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-5 text-center">
          {!outcome && (
            <>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <IconShoppingCart className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Te invitaron a ser encargado</p>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{event.name}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">{formatDate(event.date)}</p>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">
                Vas a poder acceder a la pantalla de encargados de este evento para ayudar con las ventas durante el
                evento, sin acceso al resto de la información del evento.
              </p>
              <AccessibleButton onClick={handleAccept} disabled={accepting} className="w-full">
                {accepting ? 'Uniéndote…' : 'Aceptar invitación'}
              </AccessibleButton>
              {!user && (
                <p className="text-xs text-gray-400 mt-3">Necesitas iniciar sesión para continuar.</p>
              )}
            </>
          )}

          {(outcome === 'success' || outcome === 'already_member') && (
            <>
              <IconCheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                {outcome === 'already_member'
                  ? `Ya eras encargado de ${role ? ROLE_LABEL[role] : ''} en este evento.`
                  : `Ahora eres encargado de ${role ? ROLE_LABEL[role] : ''} en este evento.`}
              </p>
              <Link
                to={`/events/${eventId}/kitchen`}
                className="inline-flex items-center justify-center w-full bg-primary text-white rounded-xl py-3 text-sm font-semibold hover:bg-primary-dark transition-colors"
              >
                Ir al panel
              </Link>
            </>
          )}

          {outcome && outcome !== 'success' && outcome !== 'already_member' && (
            <>
              <IconBan className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{OUTCOME_MESSAGE[outcome]}</p>
              <Link to="/dashboard" className="text-sm font-medium text-primary hover:underline">
                Ir a mis eventos
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
