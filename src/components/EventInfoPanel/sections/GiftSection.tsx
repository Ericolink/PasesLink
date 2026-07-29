import type { EventData } from '../../../types'
import { IconGift, IconLink } from '../../accessibility/AccessibleIcon'
import { EventInfoSection } from '../EventInfoSection'

interface Props {
  event: EventData
}

// Primer módulo nuevo de punta a punta del panel (tipo + zod + editor +
// lectura) — prueba el patrón de extensión: agregar un módulo futuro
// (Hospedaje, VIP...) es copiar este archivo + su GiftInfo en types/
// schemas, sin tocar EventInformationPanel.
export function GiftSection({ event }: Props) {
  const gifts = event.gifts
  if (!gifts?.message?.trim() && !gifts?.registryUrl?.trim() && !gifts?.cashInfo?.trim()) return null

  const isValidUrl = !!gifts.registryUrl && /^https?:\/\//i.test(gifts.registryUrl)

  return (
    <EventInfoSection id="gifts" icon={<IconGift className="w-4 h-4" />} title="Regalos">
      <div className="space-y-3">
        {gifts.message?.trim() && <p className="whitespace-pre-line leading-relaxed">{gifts.message}</p>}
        {isValidUrl && (
          <a
            href={gifts.registryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium bg-[var(--invite-accent-soft)] text-[var(--invite-accent-dark)] hover:opacity-90 transition-opacity"
          >
            <IconLink className="w-4 h-4" />
            Ver mesa de regalos
          </a>
        )}
        {gifts.cashInfo?.trim() && (
          <div>
            <p className="text-xs font-medium mb-0.5 text-[var(--invite-text-muted)]">Regalo en efectivo/transferencia</p>
            <p className="whitespace-pre-line">{gifts.cashInfo}</p>
          </div>
        )}
      </div>
    </EventInfoSection>
  )
}
