import { useEffect, useState } from 'react'
import { subscribeToMessageCampaigns, type MessageCampaign, type MessageCampaignStatus } from '../firebase/messageCampaigns'

const STATUS_LABELS: Record<MessageCampaignStatus, string> = {
  queued: 'En cola',
  processing: 'Enviando…',
  sent: 'Enviado',
  partial: 'Enviado parcialmente',
  failed: 'Falló',
}

interface Props {
  eventId: string
}

export function MassMessageHistory({ eventId }: Props) {
  const [campaigns, setCampaigns] = useState<MessageCampaign[]>([])

  useEffect(() => {
    const unsubscribe = subscribeToMessageCampaigns(eventId, setCampaigns)
    return unsubscribe
  }, [eventId])

  if (campaigns.length === 0) return null

  return (
    <div className="space-y-2">
      {campaigns.map((c) => (
        <div key={c.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.subject}</p>
            <span className={`text-xs shrink-0 font-medium ${c.status === 'sent' ? 'text-green-600' : c.status === 'failed' ? 'text-red-500' : 'text-amber-600'}`}>
              {STATUS_LABELS[c.status]}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {c.audienceSummary} · {c.guestIds.length} destinatario(s) · {new Date(c.createdAt).toLocaleString('es')}
          </p>
        </div>
      ))}
    </div>
  )
}
