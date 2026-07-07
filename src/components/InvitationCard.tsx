import type { ReactNode } from 'react'
import { optimizedImageUrl } from '../utils/cloudinary'

interface InvitationCardProps {
  coverImage?: string
  coverAlt?: string
  children: ReactNode
}

// Puramente presentacional: confía en que un InvitationThemeRoot ancestro ya
// dejó disponibles las variables --invite-* (acento, superficie, texto,
// tipografía, radio, sombra). No conoce el tema activo, así que nunca hace
// falta tocar este archivo al agregar una plantilla nueva.
export function InvitationCard({ coverImage, coverAlt, children }: InvitationCardProps) {
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
          <img src={optimizedImageUrl(coverImage, 800)} alt={coverAlt || ''} loading="lazy" crossOrigin="anonymous" className="w-full h-full object-cover" />
        )}
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}
