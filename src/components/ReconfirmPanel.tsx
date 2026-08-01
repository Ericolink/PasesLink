import { useState } from 'react'
import { deleteGuest } from '../firebase/guests'
import { giveMoreTime } from '../firebase/reconfirm'
import type { EventData, GuestData } from '../types'
import { MetricTile } from './MetricTile'
import { ConfirmDialog } from './ConfirmDialog'
import { StartReconfirmCampaignModal } from './StartReconfirmCampaignModal'

const GRACE_EXTENSION_MS = 48 * 60 * 60 * 1000

interface ReconfirmPanelProps {
  eventId: string
  event: EventData
  // Reutiliza el `guests` ya suscripto en vivo por EventDetail.tsx en vez
  // de abrir una segunda suscripción a la misma colección (a diferencia de
  // WaitlistPanel.tsx, que sí necesita la suya propia porque `waitlist` es
  // una colección separada que nadie más carga en esta página).
  guests: GuestData[]
  canManage: boolean
}

// Sección apilada, mismo criterio que WaitlistPanel.tsx — sin liberación
// automática (decisión de esta sesión, distinta a la ventana de gracia de
// 48h que recomendaba el RFC original): "en riesgo" solo se resuelve acá,
// a mano.
export function ReconfirmPanel({ eventId, event, guests, canManage }: ReconfirmPanelProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [releaseTarget, setReleaseTarget] = useState<GuestData | null>(null)
  const [error, setError] = useState('')

  if (!event.reconfirmCampaign && !canManage) return null

  const requested = guests.filter((g) => g.reconfirmStatus === 'requested')
  const expired = guests.filter((g) => g.reconfirmStatus === 'expired')
  const confirmedCount = guests.filter((g) => g.reconfirmStatus === 'confirmed').length
  const atRiskQueue = [...expired, ...requested]

  async function runAction(guestId: string, action: () => Promise<void>) {
    setBusyId(guestId)
    setError('')
    try {
      await action()
    } catch (err) {
      console.error('Error managing reconfirmation:', err)
      setError('No se pudo completar la acción. Intenta de nuevo.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 p-4 mb-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Reconfirmación</h2>
        {canManage && (
          <button type="button" onClick={() => setModalOpen(true)} className="text-xs text-primary font-medium hover:underline">
            {event.reconfirmCampaign ? 'Relanzar' : 'Iniciar reconfirmación'}
          </button>
        )}
      </div>

      {event.reconfirmCampaign ? (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <MetricTile label="Confirmaron" value={confirmedCount} align="start" accent="success" />
            <MetricTile label="Pendientes" value={requested.length} align="start" />
            <MetricTile label="En riesgo" value={expired.length} align="start" accent={expired.length > 0 ? 'warning' : 'gray'} />
          </div>

          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

          {atRiskQueue.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Todos respondieron.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {atRiskQueue.map((guest) => (
                <li key={guest.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {guest.name}
                      {guest.paymentStatus === 'paid' && <span className="text-gray-400 dark:text-gray-500"> · pagó</span>}
                    </p>
                    <p className={`text-xs ${guest.reconfirmStatus === 'expired' ? 'text-warning-ink font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                      {guest.reconfirmStatus === 'expired' ? 'EN RIESGO · no respondió a tiempo' : 'esperando respuesta'}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busyId === guest.id}
                        onClick={() => runAction(guest.id, () => giveMoreTime(eventId, guest.id, Date.now() + GRACE_EXTENSION_MS))}
                        className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-primary disabled:opacity-40"
                      >
                        Dar 48h más
                      </button>
                      {/* Un `paid` nunca pierde su lugar por esto — ni
                          siquiera si el organizador lo incluyó en la
                          campaña (§9 del RFC): no se ofrece "liberar" para
                          nadie que ya pagó. */}
                      {guest.reconfirmStatus === 'expired' && guest.paymentStatus !== 'paid' && (
                        <button
                          type="button"
                          disabled={busyId === guest.id}
                          onClick={() => setReleaseTarget(guest)}
                          className="text-xs font-medium text-red-500 hover:underline disabled:opacity-40"
                        >
                          Liberar lugar
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">Todavía no iniciaste una campaña de reconfirmación.</p>
      )}

      <ConfirmDialog
        open={!!releaseTarget}
        title="¿Liberar este lugar?"
        message={`${releaseTarget?.name} deja de estar invitado y su pase deja de ser válido. Si hay lista de espera activa, el lugar se ofrece automáticamente a la siguiente persona.`}
        confirmLabel="Liberar lugar"
        danger
        onConfirm={() => {
          if (!releaseTarget) return
          const target = releaseTarget
          setReleaseTarget(null)
          runAction(target.id, () => deleteGuest(eventId, target))
        }}
        onCancel={() => setReleaseTarget(null)}
      />

      <StartReconfirmCampaignModal
        open={modalOpen}
        eventId={eventId}
        guestTags={event.guestTags}
        onClose={() => setModalOpen(false)}
        onStarted={() => {}}
      />
    </div>
  )
}
