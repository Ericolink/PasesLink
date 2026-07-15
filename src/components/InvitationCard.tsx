import type { ReactNode } from 'react'
import { optimizedImageUrl } from '../utils/cloudinary'

interface InvitationCardProps {
  coverImage?: string
  coverAlt?: string
  children: ReactNode
  // true en páginas de aterrizaje frío de un invitado (EventJoin, EventArrive)
  // donde esta portada suele ser el elemento LCP — carga eager + prioridad
  // alta, igual que ya hacen GuestPass.tsx/EventDetail.tsx con su propio
  // <img> inline. Default false (loading="lazy") para InvitationPreview, la
  // vista previa durante la creación del evento, que no es una carga fría
  // real y no vale la pena priorizar.
  priority?: boolean
}

// Puramente presentacional: confía en que un InvitationThemeRoot ancestro ya
// dejó disponibles las variables --invite-* (acento, superficie, texto,
// tipografía, radio, sombra). No conoce el tema activo, así que nunca hace
// falta tocar este archivo al agregar una plantilla nueva.
export function InvitationCard({ coverImage, coverAlt, children, priority = false }: InvitationCardProps) {
  return (
    <div
      className="invite-card overflow-hidden border bg-[var(--invite-surface)] text-[var(--invite-text)] [font-family:var(--invite-font)] [border-radius:var(--invite-radius)]"
      style={{
        boxShadow: 'var(--invite-shadow)',
        borderColor: 'var(--invite-border)',
        borderTopColor: 'var(--invite-accent)',
        borderTopWidth: '4px',
      }}
    >
      <div className="invite-cover w-full overflow-hidden">
        {coverImage && (
          priority ? (
            <img src={optimizedImageUrl(coverImage, 800)} alt={coverAlt || ''} fetchPriority="high" crossOrigin="anonymous" className="w-full h-full object-cover" />
          ) : (
            <img src={optimizedImageUrl(coverImage, 800)} alt={coverAlt || ''} loading="lazy" crossOrigin="anonymous" className="w-full h-full object-cover" />
          )
        )}
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}
