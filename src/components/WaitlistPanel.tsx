import { useEffect, useState } from 'react'
import {
  assignWaitlistSpot,
  cancelWaitlistOffer,
  moveWaitlistEntryToFront,
  removeFromWaitlist,
  subscribeToWaitlist,
} from '../firebase/waitlist'
import type { CustomField, PaymentMethod, WaitlistEntryData } from '../types'
import { MetricTile } from './MetricTile'
import { ConfirmDialog } from './ConfirmDialog'
import { ListSection } from './GuestList/ListSection'
import { WaitlistEntryRow } from './GuestList/WaitlistEntryRow'
import { WaitlistEntryDetailSheet } from './GuestList/WaitlistEntryDetailSheet'
import { buildResendWhatsAppUrl, buildWaitlistResendMessage } from '../utils/resendInvitation'
import { buildWaitlistStatusUrl } from '../utils/qrUrl'
import { captureException } from '../lib/sentry'
import { getFunctionsErrorMessage } from '../utils/firebaseErrorMessages'

interface WaitlistPanelProps {
  eventId: string
  eventName: string
  /** Gatea las acciones (mover/editar/promover/eliminar) — igual criterio que addGuests para GuestAddForm. */
  canManage: boolean
  requiresPayment: boolean
  paymentMethods: PaymentMethod[]
  maxCompanions: number
  customFields?: CustomField[]
}

// Misma familia visual que GuestList (ListSection + fila con avatar/badges +
// hoja de detalle con menú de acciones) — antes era una <ul> plana con
// botones de texto, ver git history. Sigue siendo su propio componente/
// suscripción (WaitlistEntryData no comparte forma con GuestData: sin
// companions[], sin pase/QR, sin RSVP), pegado arriba de GuestList en
// EventDetail.tsx.
export function WaitlistPanel({ eventId, eventName, canManage, requiresPayment, paymentMethods, maxCompanions, customFields = [] }: WaitlistPanelProps) {
  const [entries, setEntries] = useState<WaitlistEntryData[]>([])
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<WaitlistEntryData | null>(null)
  const [promoteTarget, setPromoteTarget] = useState<WaitlistEntryData | null>(null)
  const [markPaidTarget, setMarkPaidTarget] = useState<WaitlistEntryData | null>(null)
  // Antes, un error de suscripción (ej. permission-denied) solo se mandaba a
  // Sentry — el panel se quedaba oculto igual que "no hay nadie esperando",
  // sin ningún indicio de que había un error real. Ahora se muestra acá.
  const [subscriptionError, setSubscriptionError] = useState(false)

  useEffect(() => {
    return subscribeToWaitlist(
      eventId,
      (data) => {
        setSubscriptionError(false)
        setEntries(data)
      },
      (err) => {
        console.error('Error al suscribirse a la lista de espera:', err)
        setSubscriptionError(true)
        captureException(err, { tags: { flow: 'waitlist-panel' } })
      },
    )
  }, [eventId])

  if (subscriptionError) {
    return (
      <div className="border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 rounded-xl p-4 mb-5">
        <p className="text-sm text-red-700 dark:text-red-400">
          No se pudo cargar la lista de espera. Revisa la consola del navegador para más detalles, o intenta recargar la página.
        </p>
      </div>
    )
  }

  if (entries.length === 0) return null

  const waitingCount = entries.filter((e) => e.status === 'waiting').length
  const offeredCount = entries.filter((e) => e.status === 'offered').length
  const detailEntry = detailEntryId ? entries.find((e) => e.id === detailEntryId) ?? null : null
  const detailPosition = detailEntry ? entries.findIndex((e) => e.id === detailEntry.id) + 1 : 0

  async function runAction(entryId: string, action: () => Promise<void>) {
    setBusyEntryId(entryId)
    setError('')
    try {
      await action()
    } catch (err) {
      console.error('Error managing waitlist entry:', err)
      setError(getFunctionsErrorMessage(err, 'No se pudo completar la acción. Intenta de nuevo.'))
    } finally {
      setBusyEntryId(null)
    }
  }

  async function handleShare(entry: WaitlistEntryData) {
    const url = buildWaitlistStatusUrl(eventId, entry.waitlistToken)
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Lista de espera', text: `Aquí está el estado de tu lugar en la lista de espera, ${entry.name}`, url })
        return
      } catch {
        return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(entry.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch (err) {
      console.error('Error copying waitlist status link:', err)
      setError('No se pudo copiar el link. Intenta de nuevo.')
    }
  }

  function handleResendWhatsApp(entry: WaitlistEntryData) {
    if (!entry.phone) return
    const message = buildWaitlistResendMessage(entry.name, eventName, eventId, entry.waitlistToken)
    window.open(buildResendWhatsAppUrl(entry.phone, message, entry.phoneCountry), '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-800 dark:border dark:border-gray-700 p-4 mb-5">
      <div className="grid grid-cols-2 gap-2 mb-4">
        <MetricTile label="En espera" value={waitingCount} align="start" />
        <MetricTile label="Ofertas activas" value={offeredCount} align="start" accent={offeredCount > 0 ? 'warning' : 'gray'} />
      </div>

      <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 mb-4">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Evento lleno</p>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
          El evento alcanzó su capacidad máxima. Estar en la lista de espera no garantiza un lugar — si alguien decide
          asistir igual, podría no poder ingresar mientras no se libere un espacio.
        </p>
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      <ListSection
        title="Lista de espera"
        titleTone="violet"
        alwaysExpanded
        collapsedByDefault={false}
        items={entries}
        loadMoreLabel="personas"
        renderItem={(entry) => {
          const position = entries.findIndex((e) => e.id === entry.id) + 1
          return <WaitlistEntryRow key={entry.id} entry={entry} position={position} onOpenDetail={(e) => setDetailEntryId(e.id)} />
        }}
      />

      <WaitlistEntryDetailSheet
        eventId={eventId}
        entry={detailEntry}
        position={detailPosition}
        canManage={canManage}
        busy={busyEntryId === detailEntry?.id}
        requiresPayment={requiresPayment}
        paymentMethods={paymentMethods}
        customFields={customFields}
        maxCompanions={maxCompanions}
        copiedId={copiedId}
        onClose={() => setDetailEntryId(null)}
        onShare={handleShare}
        onResendWhatsApp={handleResendWhatsApp}
        onMoveToFront={(entry) => runAction(entry.id, () => moveWaitlistEntryToFront(eventId, entry.id))}
        onCancelOffer={(entry) => runAction(entry.id, () => cancelWaitlistOffer(eventId, entry.id))}
        onRequestPromote={(entry) => { setDetailEntryId(null); setPromoteTarget(entry) }}
        onRequestMarkPaid={(entry) => { setDetailEntryId(null); setMarkPaidTarget(entry) }}
        onRequestRemove={(entry) => { setDetailEntryId(null); setRemoveTarget(entry) }}
      />

      <ConfirmDialog
        open={!!removeTarget}
        title="¿Quitar de la lista de espera?"
        message={`${removeTarget?.name} ya no va a poder confirmar un lugar desde este link. Puedes dejar que se vuelva a anotar si quieres.`}
        confirmLabel="Quitar"
        danger
        onConfirm={() => {
          if (!removeTarget) return
          const target = removeTarget
          setRemoveTarget(null)
          runAction(target.id, () => removeFromWaitlist(eventId, target.id))
        }}
        onCancel={() => setRemoveTarget(null)}
      />

      <ConfirmDialog
        open={!!promoteTarget}
        title="¿Pasar a la lista normal?"
        message={`${promoteTarget?.name} (${promoteTarget?.partySize ?? 1} persona${(promoteTarget?.partySize ?? 1) === 1 ? '' : 's'}) va a quedar confirmado de inmediato, sin pedirle que confirme por correo. Solo se puede si todavía hay lugar disponible.`}
        confirmLabel="Pasar a la lista normal"
        onConfirm={() => {
          if (!promoteTarget) return
          const target = promoteTarget
          setPromoteTarget(null)
          runAction(target.id, async () => { await assignWaitlistSpot(eventId, target.id) })
        }}
        onCancel={() => setPromoteTarget(null)}
      />

      <ConfirmDialog
        open={!!markPaidTarget}
        title="¿Marcar como pagado?"
        message={`${markPaidTarget?.name} va a quedar confirmado y pagado de inmediato. Solo se puede si todavía hay lugar disponible.`}
        confirmLabel="Marcar como pagado"
        onConfirm={() => {
          if (!markPaidTarget) return
          const target = markPaidTarget
          setMarkPaidTarget(null)
          runAction(target.id, async () => { await assignWaitlistSpot(eventId, target.id, paymentMethods[0], true) })
        }}
        onCancel={() => setMarkPaidTarget(null)}
      />
    </div>
  )
}
