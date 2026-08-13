import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getEvent } from '../firebase/events'
import { acceptCollaboratorInvite } from '../firebase/collaboratorInvites'
import { useAuth } from '../hooks/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { ScreenHeader } from '../components/ScreenHeader'
import { CrownLoader } from '../components/CrownLoader'
import { AccessibleButton } from '../components/accessibility/AccessibleButton'
import { IconBan, IconCheckCircle, IconShield } from '../components/accessibility/AccessibleIcon'
import { formatDate } from '../utils/time'
import {
  COLLABORATOR_ROLE_DESCRIPTIONS,
  COLLABORATOR_ROLE_LABELS,
  type CollaboratorRole,
} from '../types/collaboratorPermissions'
import type { EventData } from '../types'

type Outcome = 'success' | 'already_member' | 'expired' | 'used' | 'not_found' | 'full' | 'error'

const OUTCOME_MESSAGE: Record<Exclude<Outcome, 'success' | 'already_member'>, string> = {
  expired: 'Este enlace de invitación venció. Pídele al organizador que genere uno nuevo.',
  used: 'Este enlace ya fue usado. Si crees que es un error, pídele al organizador que genere uno nuevo.',
  not_found: 'No encontramos esta invitación. Puede que el enlace esté incompleto o ya no exista.',
  full: 'Este evento ya alcanzó el máximo de colaboradores permitidos.',
  error: 'No pudimos procesar la invitación. Intenta de nuevo en unos minutos.',
}

function isCollaboratorRole(value: string | null): value is CollaboratorRole {
  return value === 'administrador' || value === 'recepcion' || value === 'caja' || value === 'ventas' || value === 'preparacion'
}

// Pantalla de aceptación del enlace de invitación de colaborador (sistema
// unificado, ver ROLES_PERMISSIONS_REDESIGN.md Fase 4) — a diferencia de
// AcceptCoOrganizerInvite.tsx/AcceptConcessionsStaffInvite.tsx, esta SÍ
// muestra la lista concreta de permisos antes de aceptar (pedido explícito
// §24 del rediseño). El documento real de la invitación es ilegible desde
// el cliente (firestore.rules), así que el rol mostrado viene del query
// param `?role=` que generó CollaboratorPanel.tsx — puramente informativo,
// nunca la fuente de autorización real (ver buildCollaboratorInviteUrl).
// Detrás de ProtectedRoute (ver App.tsx): sin sesión, redirige a /login
// conservando este destino.
export function AcceptCollaboratorInvite() {
  const { eventId, token } = useParams<{ eventId: string; token: string }>()
  const [searchParams] = useSearchParams()
  const roleParam = searchParams.get('role')
  const displayRole: CollaboratorRole | null = isCollaboratorRole(roleParam) ? roleParam : null
  const { user } = useAuth()
  const navigate = useNavigate()
  const [event, setEvent] = useState<EventData | null | undefined>(undefined)
  const [accepting, setAccepting] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [confirmedRole, setConfirmedRole] = useState<CollaboratorRole | null>(null)

  useDocumentTitle(event ? `Colaborador · ${event.name}` : 'Invitación de colaborador')

  useEffect(() => {
    if (!eventId) return
    getEvent(eventId).then(setEvent)
  }, [eventId])

  async function handleAccept() {
    if (!eventId || !token) return
    setAccepting(true)
    try {
      const result = await acceptCollaboratorInvite(eventId, token)
      setOutcome(result.status)
      if (result.status === 'success') setConfirmedRole(result.role)
      if (result.status === 'success' || result.status === 'already_member') {
        navigate(`/events/${eventId}`, { replace: true })
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

  const roleForDisplay = confirmedRole || displayRole

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <ScreenHeader title="Invitación de colaborador" backTo="/dashboard" />

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
                <IconShield className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                Te invitaron como {roleForDisplay ? COLLABORATOR_ROLE_LABELS[roleForDisplay].toLowerCase() : 'colaborador'}
              </p>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{event.name}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">{formatDate(event.date)}</p>

              {roleForDisplay ? (
                <div className="text-left bg-gray-50 dark:bg-gray-700/40 rounded-xl p-4 mb-5">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Vas a poder:
                  </p>
                  <ul className="text-sm text-gray-600 dark:text-gray-300 list-disc list-inside space-y-1">
                    {COLLABORATOR_ROLE_DESCRIPTIONS[roleForDisplay].map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">
                  Vas a poder acceder según el rol y los permisos que te otorgue quien organiza este evento.
                </p>
              )}

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
                {outcome === 'already_member' ? 'Ya eras colaborador de este evento.' : 'Ahora eres colaborador de este evento.'}
              </p>
              <Link
                to={`/events/${eventId}`}
                className="inline-flex items-center justify-center w-full bg-primary text-white rounded-xl py-3 text-sm font-semibold hover:bg-primary-dark transition-colors"
              >
                Ir al evento
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
